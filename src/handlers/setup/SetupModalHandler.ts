// SetupModalHandler processes modal submissions during setup
import {
  ModalSubmitInteraction,
  EmbedBuilder
} from 'discord.js';
import { UserAccountService } from '../../services/UserAccountService';
import { PaymentMethodType } from '../../models/UserAccount';
import { InputValidator } from '../../utils/InputValidator';
import { auditLogger, AuditEventType, AuditSeverity } from '../../utils/AuditLogger';
import { errorHandler, ValidationError } from '../../utils/ErrorHandler';
import { paymentDataEncryption } from '../../utils/Encryption';

export class SetupModalHandler {
  private userAccountService: UserAccountService;

  constructor(userAccountService: UserAccountService) {
    this.userAccountService = userAccountService;
  }

  /**
   * Ensures a user account exists, creating one if necessary
   */
  private async ensureUserAccountExists(userId: string): Promise<void> {
    try {
      // Check if user already has an account
      const existingAccount = await this.userAccountService.getAccount(userId);

      if (!existingAccount) {
        // Create new account if one doesn't exist
        await this.userAccountService.createAccount(userId);
        console.log(`Created new user account for user ${userId}`);
        
        // Log the automatic account creation
        await auditLogger.logEvent({
          eventType: AuditEventType.ACCOUNT_SETUP_COMPLETED,
          severity: AuditSeverity.INFO,
          userId: userId,
          details: {
            initiatedVia: 'modal_submission',
            action: 'auto_account_creation'
          },
        });
      }
    } catch (error) {
      console.error(`Error ensuring user account exists for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Handles modal submissions during setup
   */
  async handleSetupModal(interaction: ModalSubmitInteraction): Promise<void> {
    const { customId } = interaction;

    try {
      // Ensure user has an account before processing payment methods
      await this.ensureUserAccountExists(interaction.user.id);

      switch (customId) {
        case 'setup_crypto_modal':
          await this.processCryptoSetup(interaction);
          break;
        case 'setup_ach_modal':
          await this.processACHSetup(interaction);
          break;
        case 'setup_other_modal':
          await this.processOtherSetup(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown setup modal',
            flags: 64 // Use flags instead of deprecated ephemeral
          });
      }
    } catch (error) {
      console.error('SetupModalHandler error:', error);
      console.error('Error details:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace',
        customId,
        userId: interaction.user.id
      });
      
      await errorHandler.handleError(error as Error, {
        interaction,
        userId: interaction.user.id,
        serverId: interaction.guildId || undefined,
        additionalMetadata: {
          command: 'setup-payment',
          action: 'modal_submission',
          modalId: customId
        }
      });
    }
  }

  /**
   * Processes cryptocurrency setup modal submission
   */
  private async processCryptoSetup(interaction: ModalSubmitInteraction): Promise<void> {
    try {
      console.log('Starting processCryptoSetup...');
      
      const walletAddress = interaction.fields.getTextInputValue('crypto_wallet_address');
      const cryptoType = interaction.fields.getTextInputValue('crypto_type');

      console.log('Modal fields:', { walletAddress, cryptoType });

      // Validate inputs
      if (!walletAddress || !cryptoType) {
        throw new ValidationError(
          'Missing required fields',
          'MISSING_FIELDS',
          'Wallet address and cryptocurrency type are required'
        );
      }

      console.log('Inputs validated, validating wallet address...');

      // Validate wallet address format (basic validation)
      const addressValidation = InputValidator.validateCryptoAddress(walletAddress, cryptoType);
      if (!addressValidation.isValid) {
        throw new ValidationError(
          'Invalid wallet address',
          'INVALID_WALLET_ADDRESS',
          addressValidation.errors.join(', ') || 'Please provide a valid wallet address'
        );
      }

      console.log('Wallet address validated, creating payment method...');

      // Add payment method to user account
      await this.userAccountService.addPaymentMethod(interaction.user.id, {
        type: 'CRYPTO',
        displayName: `${cryptoType} Wallet`,
        encryptedDetails: {
          walletAddress: walletAddress,
          cryptoType: cryptoType
        } as any,
        isActive: true
      });

      console.log('Payment method created, logging audit event...');

      // Log successful setup
      await auditLogger.logEvent({
        eventType: AuditEventType.ACCOUNT_SETUP_COMPLETED,
        severity: AuditSeverity.INFO,
        userId: interaction.user.id,
        details: {
          paymentMethodType: 'CRYPTO',
          cryptoType: cryptoType
        },
      });

      // Clean up DM policy tracking since setup is complete
      await this.cleanupDMPolicyTracking(interaction);

      console.log('Audit event logged, sending success response...');

      // Send success response
      const embed = new EmbedBuilder()
        .setTitle('✅ Cryptocurrency Setup Complete!')
        .setDescription(`Your ${cryptoType} wallet has been successfully configured.`)
        .setColor('#00ff00')
        .addFields(
          { name: 'Wallet Type', value: cryptoType, inline: true },
          { name: 'Status', value: '✅ Active', inline: true }
        );

      await interaction.reply({ embeds: [embed], flags: 64 });
      
      console.log('processCryptoSetup completed successfully');
    } catch (error) {
      console.error('Error in processCryptoSetup:', error);
      throw error;
    }
  }

  /**
   * Processes ACH setup modal submission
   */
  private async processACHSetup(interaction: ModalSubmitInteraction): Promise<void> {
    const accountNumber = interaction.fields.getTextInputValue('ach_account_number');
    const routingNumber = interaction.fields.getTextInputValue('ach_routing_number');
    const bankName = interaction.fields.getTextInputValue('ach_bank_name');

    // Validate inputs
    if (!accountNumber || !routingNumber || !bankName) {
      throw new ValidationError(
        'Missing required fields',
        'MISSING_FIELDS',
        'Account number, routing number, and bank name are required'
      );
    }

    // Validate account number format
    const accountValidation = InputValidator.validateBankAccount(accountNumber);
    if (!accountValidation.isValid) {
      throw new ValidationError(
        'Invalid account number',
        'INVALID_ACCOUNT_NUMBER',
        accountValidation.errors.join(', ') || 'Please provide a valid account number'
      );
    }

    // Validate routing number format
    const routingValidation = InputValidator.validateRoutingNumber(routingNumber);
    if (!routingValidation.isValid) {
      throw new ValidationError(
        'Invalid routing number',
        'INVALID_ROUTING_NUMBER',
        routingValidation.errors.join(', ') || 'Please provide a valid routing number'
      );
    }

    // Encrypt sensitive data
    const encryptedBankData = await paymentDataEncryption.encryptBankAccount(accountNumber, routingNumber);

          // Add payment method to user account
      await this.userAccountService.addPaymentMethod(interaction.user.id, {
        type: 'ACH',
        displayName: `${bankName} Account`,
        encryptedDetails: {
          routingNumber: routingNumber,
          accountNumber: accountNumber,
          accountType: 'checking' // Default to checking for now
        } as any,
        isActive: true
      });

    // Log successful setup
    await auditLogger.logEvent({
      eventType: AuditEventType.ACCOUNT_SETUP_COMPLETED,
      severity: AuditSeverity.INFO,
      userId: interaction.user.id,
      details: {
        paymentMethodType: 'ACH',
        bankName: bankName
      },
    });

    // Clean up DM policy tracking since setup is complete
    await this.cleanupDMPolicyTracking(interaction);

    // Send success response
    const embed = new EmbedBuilder()
      .setTitle('✅ ACH Setup Complete!')
      .setDescription('Your bank account has been successfully configured for ACH transfers.')
      .setColor('#00ff00')
      .addFields(
        { name: 'Bank Name', value: bankName, inline: true },
        { name: 'Status', value: '✅ Active', inline: true }
      );

    await interaction.reply({ embeds: [embed], flags: 64 });
  }

  /**
   * Processes other payment method setup modal submission
   */
  private async processOtherSetup(interaction: ModalSubmitInteraction): Promise<void> {
    try {
      console.log('Starting processOtherSetup...');
      
      const methodType = interaction.fields.getTextInputValue('other_method_type');
      const accountInfo = interaction.fields.getTextInputValue('other_account_info');

      console.log('Modal fields:', { methodType, accountInfo });

      // Validate inputs
      if (!methodType || !accountInfo) {
        throw new ValidationError(
          'Missing required fields',
          'MISSING_FIELDS',
          'Payment method type and account information are required'
        );
      }

      console.log('Inputs validated, proceeding to add payment method...');

      // Add payment method to user account
      await this.userAccountService.addPaymentMethod(interaction.user.id, {
        type: 'OTHER',
        displayName: `${methodType} Payment Method`,
        encryptedDetails: {
          provider: methodType,
          accountId: accountInfo
        } as any,
        isActive: true
      });

      console.log('Payment method added successfully, logging audit event...');

      // Log successful setup
      await auditLogger.logEvent({
        eventType: AuditEventType.ACCOUNT_SETUP_COMPLETED,
        severity: AuditSeverity.INFO,
        userId: interaction.user.id,
        details: {
          paymentMethodType: 'OTHER',
          methodType: methodType
        },
      });

      // Clean up DM policy tracking since setup is complete
      await this.cleanupDMPolicyTracking(interaction);

      console.log('Audit event logged, sending success response...');

      // Send success response
      const embed = new EmbedBuilder()
        .setTitle('✅ Alternative Payment Method Setup Complete!')
        .setDescription(`Your ${methodType} payment method has been successfully configured.`)
        .setColor('#00ff00')
        .addFields(
          { name: 'Method Type', value: methodType, inline: true },
          { name: 'Status', value: '✅ Active', inline: true }
        );

      await interaction.reply({ embeds: [embed], flags: 64 });
      
      console.log('processOtherSetup completed successfully');
    } catch (error) {
      console.error('Error in processOtherSetup:', error);
      throw error;
    }
  }

  /**
   * Clean up DM policy tracking when setup completes
   */
  private async cleanupDMPolicyTracking(interaction: ModalSubmitInteraction): Promise<void> {
    try {
      const bot = interaction.client;
      const dmHandler = (bot as any).dmHandler;
      
      if (dmHandler && dmHandler.removeSetupUser) {
        dmHandler.removeSetupUser(interaction.user.id);
        console.log(`🐷 User ${interaction.user.tag} (${interaction.user.id}) removed from DM policy tracking - setup complete`);
      }
    } catch (error) {
      console.error(`🐷 Error cleaning up DM policy tracking for user ${interaction.user.id}:`, error);
      // Don't throw - this is cleanup, not critical
    }
  }
}
