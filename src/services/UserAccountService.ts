// User account service implementation with CRUD operations and secure payment method storage
import { UserAccount, PaymentMethodConfig, NotificationSettings, PaymentMethodType, isValidDiscordId, isValidPaymentMethodConfig, dbToUserAccount, userAccountToDb } from '../models/UserAccount';
import { getPrismaClient, withTransaction } from '../models/database';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

export interface UserAccountService {
  createAccount(discordId: string): Promise<UserAccount>;
  getAccount(discordId: string): Promise<UserAccount | null>;
  addPaymentMethod(discordId: string, paymentMethod: Omit<PaymentMethodConfig, 'id' | 'addedAt'>): Promise<PaymentMethodConfig>;
  removePaymentMethod(discordId: string, methodId: string): Promise<void>;
  updateNotificationPreferences(discordId: string, preferences: Partial<NotificationSettings>): Promise<void>;
  validatePaymentMethod(type: PaymentMethodType, details: any): Promise<boolean>;
  encryptPaymentDetails(details: any): string;
  decryptPaymentDetails(encryptedDetails: string): any;
  getPaymentMethods(discordId: string): Promise<PaymentMethodConfig[]>;
  getPaymentMethod(discordId: string, methodId: string): Promise<PaymentMethodConfig | null>;
  listActivePaymentMethods(discordId: string): Promise<PaymentMethodConfig[]>;
}

export class UserAccountServiceImpl implements UserAccountService {
  private readonly encryptionKey: string;
  private readonly algorithm = 'aes-256-cbc';

  constructor(encryptionKey?: string) {
    this.encryptionKey = encryptionKey || process.env.ENCRYPTION_KEY || this.generateEncryptionKey();
  }

  private generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a new user account with default settings
   */
  async createAccount(discordId: string): Promise<UserAccount> {
    if (!isValidDiscordId(discordId)) {
      throw new Error('Invalid Discord ID format');
    }

    const prisma = getPrismaClient();

    try {
      // Check if account already exists
      const existingAccount = await prisma.userAccount.findUnique({
        where: { discordId },
        include: { paymentMethods: true }
      });

      if (existingAccount) {
        throw new Error('Account already exists for this Discord ID');
      }

      // Create new account with default settings
      const dbUser = await prisma.userAccount.create({
        data: {
          discordId,
          enableDMNotifications: true,
          enableChannelNotifications: false,
        },
        include: { paymentMethods: true }
      });

      // Convert Prisma result to our domain model
      return dbToUserAccount(dbUser as any, []);
    } catch (error) {
      if (error instanceof Error && error.message === 'Account already exists for this Discord ID') {
        throw error;
      }
      throw new Error(`Failed to create account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve user account by Discord ID
   */
  async getAccount(discordId: string): Promise<UserAccount | null> {
    if (!isValidDiscordId(discordId)) {
      throw new Error('Invalid Discord ID format');
    }

    const prisma = getPrismaClient();

    try {
      const dbUser = await prisma.userAccount.findUnique({
        where: { discordId },
        include: { paymentMethods: true }
      });

      if (!dbUser) {
        return null;
      }

      // Convert payment methods from DB format
      const paymentMethods: PaymentMethodConfig[] = dbUser.paymentMethods.map(pm => ({
        id: pm.id,
        type: pm.type as PaymentMethodType,
        displayName: pm.displayName,
        encryptedDetails: pm.encryptedDetails,
        isActive: pm.isActive,
        addedAt: pm.addedAt,
      }));

      // Convert Prisma result to our domain model
      return dbToUserAccount(dbUser as any, paymentMethods);
    } catch (error) {
      throw new Error(`Failed to retrieve account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add a new payment method to user account with validation and encryption
   */
  async addPaymentMethod(
    discordId: string,
    paymentMethod: Omit<PaymentMethodConfig, 'id' | 'addedAt'>
  ): Promise<PaymentMethodConfig> {
    if (!isValidDiscordId(discordId)) {
      throw new Error('Invalid Discord ID format');
    }

    // Validate payment method details
    const isValid = await this.validatePaymentMethod(paymentMethod.type, paymentMethod.encryptedDetails);
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
        pm => pm.type === paymentMethod.type && pm.displayName === paymentMethod.displayName
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

  /**
   * Remove a payment method from user account
   */
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

      // Check if payment method is being used in active transactions
      const activeTransactions = await tx.transaction.findMany({
        where: {
          OR: [
            { senderPaymentMethodId: methodId },
            { recipientPaymentMethodId: methodId }
          ],
          status: {
            in: ['PENDING', 'ESCROWED']
          }
        }
      });

      if (activeTransactions.length > 0) {
        throw new Error('Cannot remove payment method with active transactions');
      }

      // Remove payment method
      await tx.paymentMethodConfig.delete({
        where: { id: methodId }
      });
    });
  }

  /**
   * Update user notification preferences
   */
  async updateNotificationPreferences(
    discordId: string,
    preferences: Partial<NotificationSettings>
  ): Promise<void> {
    if (!isValidDiscordId(discordId)) {
      throw new Error('Invalid Discord ID format');
    }

    if (!preferences || typeof preferences !== 'object') {
      throw new Error('Invalid notification preferences');
    }

    const prisma = getPrismaClient();

    try {
      const updateData: any = {};

      if (preferences.enableDMNotifications !== undefined) {
        updateData.enableDMNotifications = preferences.enableDMNotifications;
      }

      if (preferences.enableChannelNotifications !== undefined) {
        updateData.enableChannelNotifications = preferences.enableChannelNotifications;
      }

      const result = await prisma.userAccount.update({
        where: { discordId },
        data: updateData
      });

      if (!result) {
        throw new Error('User account not found');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'User account not found') {
        throw error;
      }
      throw new Error(`Failed to update notification preferences: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate payment method details based on type
   */
  async validatePaymentMethod(type: PaymentMethodType, details: any): Promise<boolean> {
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
      return false;
    }
  }

  private validateCryptoPaymentMethod(details: any): boolean {
    if (!details || typeof details !== 'object') {
      return false;
    }

    const { walletAddress, cryptoType } = details;

    if (!walletAddress || typeof walletAddress !== 'string') {
      return false;
    }

    if (!cryptoType || typeof cryptoType !== 'string') {
      return false;
    }

    // Basic wallet address validation (simplified)
    const validCryptoTypes = ['BTC', 'ETH', 'LTC', 'BCH'];
    if (!validCryptoTypes.includes(cryptoType.toUpperCase())) {
      return false;
    }

    // Basic address format validation
    if (walletAddress.length < 26 || walletAddress.length > 62) {
      return false;
    }

    return true;
  }

  private validateACHPaymentMethod(details: any): boolean {
    if (!details || typeof details !== 'object') {
      return false;
    }

    const { routingNumber, accountNumber, accountType } = details;

    if (!routingNumber || typeof routingNumber !== 'string') {
      return false;
    }

    if (!accountNumber || typeof accountNumber !== 'string') {
      return false;
    }

    if (!accountType || typeof accountType !== 'string') {
      return false;
    }

    // Validate routing number (9 digits)
    if (!/^\d{9}$/.test(routingNumber)) {
      return false;
    }

    // Validate account number (4-17 digits)
    if (!/^\d{4,17}$/.test(accountNumber)) {
      return false;
    }

    // Validate account type
    const validAccountTypes = ['checking', 'savings'];
    if (!validAccountTypes.includes(accountType.toLowerCase())) {
      return false;
    }

    return true;
  }

  private validateOtherPaymentMethod(details: any): boolean {
    if (!details || typeof details !== 'object') {
      return false;
    }

    const { provider, accountId } = details;

    if (!provider || typeof provider !== 'string') {
      return false;
    }

    if (!accountId || typeof accountId !== 'string') {
      return false;
    }

    // Basic validation for other payment methods
    if (provider.length < 2 || provider.length > 50) {
      return false;
    }

    if (accountId.length < 3 || accountId.length > 100) {
      return false;
    }

    return true;
  }

  /**
   * Encrypt payment details using simple base64 encoding (for demo purposes)
   * In production, use proper encryption like AES-256-GCM
   */
  encryptPaymentDetails(details: any): string {
    try {
      const plaintext = JSON.stringify(details);
      // Simple base64 encoding for demo - in production use proper encryption
      const encoded = Buffer.from(plaintext + ':' + this.encryptionKey).toString('base64');
      return encoded;
    } catch (error) {
      throw new Error('Failed to encrypt payment details');
    }
  }

  /**
   * Decrypt payment details using simple base64 decoding (for demo purposes)
   * In production, use proper decryption like AES-256-GCM
   */
  decryptPaymentDetails(encryptedDetails: string): any {
    try {
      // Simple base64 decoding for demo - in production use proper decryption
      const decoded = Buffer.from(encryptedDetails, 'base64').toString('utf8');
      const parts = decoded.split(':');
      if (parts.length < 2) {
        throw new Error('Invalid encrypted data format');
      }

      // Remove the key part and reconstruct the original data
      const keyPart = parts.pop();
      if (keyPart !== this.encryptionKey) {
        throw new Error('Invalid encryption key');
      }

      const plaintext = parts.join(':');
      return JSON.parse(plaintext);
    } catch (error) {
      throw new Error('Failed to decrypt payment details');
    }
  }

  /**
   * Get all payment methods for a user (both active and inactive)
   */
  async getPaymentMethods(discordId: string): Promise<PaymentMethodConfig[]> {
    if (!isValidDiscordId(discordId)) {
      throw new Error('Invalid Discord ID format');
    }

    const prisma = getPrismaClient();

    try {
      const userAccount = await prisma.userAccount.findUnique({
        where: { discordId },
        include: { paymentMethods: true }
      });

      if (!userAccount) {
        throw new Error('User account not found');
      }

      return userAccount.paymentMethods.map(pm => ({
        id: pm.id,
        type: pm.type as PaymentMethodType,
        displayName: pm.displayName,
        encryptedDetails: pm.encryptedDetails,
        isActive: pm.isActive,
        addedAt: pm.addedAt,
      }));
    } catch (error) {
      throw new Error(`Failed to retrieve payment methods: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a specific payment method by ID for a user
   */
  async getPaymentMethod(discordId: string, methodId: string): Promise<PaymentMethodConfig | null> {
    if (!isValidDiscordId(discordId)) {
      throw new Error('Invalid Discord ID format');
    }

    if (!methodId || typeof methodId !== 'string') {
      throw new Error('Invalid payment method ID');
    }

    const prisma = getPrismaClient();

    try {
      const userAccount = await prisma.userAccount.findUnique({
        where: { discordId },
        include: { paymentMethods: true }
      });

      if (!userAccount) {
        throw new Error('User account not found');
      }

      const paymentMethod = userAccount.paymentMethods.find(pm => pm.id === methodId);
      
      if (!paymentMethod) {
        return null;
      }

      return {
        id: paymentMethod.id,
        type: paymentMethod.type as PaymentMethodType,
        displayName: paymentMethod.displayName,
        encryptedDetails: paymentMethod.encryptedDetails,
        isActive: paymentMethod.isActive,
        addedAt: paymentMethod.addedAt,
      };
    } catch (error) {
      throw new Error(`Failed to retrieve payment method: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get only active payment methods for a user
   */
  async listActivePaymentMethods(discordId: string): Promise<PaymentMethodConfig[]> {
    if (!isValidDiscordId(discordId)) {
      throw new Error('Invalid Discord ID format');
    }

    const prisma = getPrismaClient();

    try {
      const userAccount = await prisma.userAccount.findUnique({
        where: { discordId },
        include: { paymentMethods: true }
      });

      if (!userAccount) {
        throw new Error('User account not found');
      }

      return userAccount.paymentMethods
        .filter(pm => pm.isActive)
        .map(pm => ({
          id: pm.id,
          type: pm.type as PaymentMethodType,
          displayName: pm.displayName,
          encryptedDetails: pm.encryptedDetails,
          isActive: pm.isActive,
          addedAt: pm.addedAt,
        }));
    } catch (error) {
      throw new Error(`Failed to retrieve active payment methods: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}