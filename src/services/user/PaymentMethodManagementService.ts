// PaymentMethodManagementService handles payment method operations for user accounts
import { PaymentMethodConfig, PaymentMethodType } from '../../models/UserAccount';
import { getPrismaClient, withTransaction } from '../../models/database';
import { isValidDiscordId } from '../../models/UserAccount';

export interface PaymentMethodManagementService {
  addPaymentMethod(
    discordId: string,
    paymentMethod: Omit<PaymentMethodConfig, 'id' | 'addedAt'>
  ): Promise<PaymentMethodConfig>;

  removePaymentMethod(discordId: string, methodId: string): Promise<void>;

  validatePaymentMethod(type: PaymentMethodType, details: any): Promise<boolean>;

  encryptPaymentDetails(details: any): string;

  decryptPaymentDetails(encryptedDetails: string): any;
}

export class PaymentMethodManagementServiceImpl implements PaymentMethodManagementService {
  private readonly encryptionKey: string;
  private readonly algorithm = 'aes-256-cbc';

  constructor(encryptionKey?: string) {
    this.encryptionKey = encryptionKey || process.env.ENCRYPTION_KEY || this.generateEncryptionKey();
  }

  private generateEncryptionKey(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  async addPaymentMethod(
    discordId: string,
    paymentMethod: Omit<PaymentMethodConfig, 'id' | 'addedAt'>
  ): Promise<PaymentMethodConfig> {
    if (!isValidDiscordId(discordId)) {
      throw new Error('Invalid Discord ID format');
    }

    // Validate payment method details
    const isValid = await this.validatePaymentMethod(
      paymentMethod.type, 
      paymentMethod.encryptedDetails
    );
    if (!isValid) {
      throw new Error('Invalid payment method details');
    }

    const prisma = getPrismaClient();

    return await withTransaction(async (tx) => {
      // Ensure user account exists
      const userAccount = await tx.userAccount.findUnique({
        where: { discordId },
        include: { paymentMethods: true }
      });

      if (!userAccount) {
        throw new Error('User account not found');
      }

      // Check for duplicate payment methods (same type and display name)
      const existingMethod = userAccount.paymentMethods.find(
        pm => pm.type === paymentMethod.type && 
              pm.displayName === paymentMethod.displayName
      );

      if (existingMethod) {
        throw new Error('Payment method with this name already exists');
      }

      // Encrypt payment details before storing
      const encryptedDetails = this.encryptPaymentDetails(paymentMethod.encryptedDetails);

      // Create payment method
      const dbPaymentMethod = await tx.paymentMethodConfig.create({
        data: {
          userId: userAccount.id,
          type: paymentMethod.type as any,
          displayName: paymentMethod.displayName,
          encryptedDetails,
          isActive: paymentMethod.isActive,
        }
      });

      return {
        id: dbPaymentMethod.id,
        type: dbPaymentMethod.type as PaymentMethodType,
        displayName: dbPaymentMethod.displayName,
        encryptedDetails: dbPaymentMethod.encryptedDetails,
        isActive: dbPaymentMethod.isActive,
        addedAt: dbPaymentMethod.addedAt,
      };
    });
  }

  async removePaymentMethod(discordId: string, methodId: string): Promise<void> {
    if (!isValidDiscordId(discordId)) {
      throw new Error('Invalid Discord ID format');
    }

    if (!methodId || typeof methodId !== 'string') {
      throw new Error('Invalid payment method ID');
    }

    const prisma = getPrismaClient();

    await withTransaction(async (tx) => {
      // Verify user owns this payment method
      const userAccount = await tx.userAccount.findUnique({
        where: { discordId },
        include: { paymentMethods: true }
      });

      if (!userAccount) {
        throw new Error('User account not found');
      }

      const paymentMethod = userAccount.paymentMethods.find(pm => pm.id === methodId);
      if (!paymentMethod) {
        throw new Error('Payment method not found or does not belong to user');
      }

      // Soft delete by marking as inactive
      await tx.paymentMethodConfig.update({
        where: { id: methodId },
        data: { isActive: false }
      });
    });
  }

  async validatePaymentMethod(type: PaymentMethodType, details: any): Promise<boolean> {
    if (!type || !details) {
      return false;
    }

    try {
      switch (type) {
        case 'CRYPTO':
          return this.validateCryptoPaymentMethod(details);
        case 'ACH':
          return this.validateACHPaymentMethod(details);
        case 'OTHER':
          return this.validateOtherPaymentMethod(details);
        default:
          return false;
      }
    } catch (error) {
      console.error('Error validating payment method:', error);
      return false;
    }
  }

  private validateCryptoPaymentMethod(details: any): boolean {
    if (!details || typeof details !== 'object') {
      return false;
    }

    const requiredFields = ['walletAddress', 'network'];
    const hasRequiredFields = requiredFields.every(field => 
      details[field] && typeof details[field] === 'string'
    );

    if (!hasRequiredFields) {
      return false;
    }

    // Validate wallet address format (basic check)
    const walletAddress = details.walletAddress;
    if (walletAddress.length < 26 || walletAddress.length > 100) {
      return false;
    }

    // Validate network
    const validNetworks = ['ethereum', 'bitcoin', 'polygon', 'binance'];
    if (!validNetworks.includes(details.network.toLowerCase())) {
      return false;
    }

    return true;
  }

  private validateACHPaymentMethod(details: any): boolean {
    if (!details || typeof details !== 'object') {
      return false;
    }

    const requiredFields = ['accountNumber', 'routingNumber', 'accountType'];
    const hasRequiredFields = requiredFields.every(field => 
      details[field] && typeof details[field] === 'string'
    );

    if (!hasRequiredFields) {
      return false;
    }

    // Validate account number (9-17 digits)
    const accountNumber = details.accountNumber.replace(/\D/g, '');
    if (accountNumber.length < 9 || accountNumber.length > 17) {
      return false;
    }

    // Validate routing number (9 digits)
    const routingNumber = details.routingNumber.replace(/\D/g, '');
    if (routingNumber.length !== 9) {
      return false;
    }

    // Validate account type
    const validAccountTypes = ['checking', 'savings'];
    if (!validAccountTypes.includes(details.accountType.toLowerCase())) {
      return false;
    }

    return true;
  }

  private validateOtherPaymentMethod(details: any): boolean {
    if (!details || typeof details !== 'object') {
      return false;
    }

    // For other payment methods, require at least a name and some identifier
    const hasName = details.name && typeof details.name === 'string';
    const hasIdentifier = details.identifier && typeof details.identifier === 'string';

    return hasName && hasIdentifier;
  }

  encryptPaymentDetails(details: any): string {
    try {
      const crypto = require('crypto');
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
      
      let encrypted = cipher.update(JSON.stringify(details), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('Error encrypting payment details:', error);
      throw new Error('Failed to encrypt payment details');
    }
  }

  decryptPaymentDetails(encryptedDetails: string): any {
    try {
      const crypto = require('crypto');
      const [ivHex, encrypted] = encryptedDetails.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      
      const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Error decrypting payment details:', error);
      throw new Error('Failed to decrypt payment details');
    }
  }
}
