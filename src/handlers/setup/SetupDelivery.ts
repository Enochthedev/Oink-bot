// SetupDelivery handles the complete DM-first setup flow
import {
  User,
  ButtonInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder
} from 'discord.js';
import { UserAccountService } from '../../services/UserAccountService';
import { SetupDMHandler } from './SetupDMHandler';
import { auditLogger, AuditEventType, AuditSeverity } from '../../utils/AuditLogger';
import { errorHandler } from '../../utils/ErrorHandler';

export class SetupDelivery {
  private userAccountService: UserAccountService;
  private dmHandler: SetupDMHandler;

  constructor(userAccountService: UserAccountService) {
    this.userAccountService = userAccountService;
    this.dmHandler = new SetupDMHandler();
  }

  /**
   * Handles setup button interactions from DMs
   * This processes the user's choice of payment method
   */
  async handleSetupChoice(interaction: ButtonInteraction): Promise<void> {
    try {
      const { customId } = interaction;
      const user = interaction.user;

      // Log the setup choice
      await auditLogger.logEvent({
        eventType: AuditEventType.ACCOUNT_SETUP_CHOICE_MADE,
        severity: AuditSeverity.INFO,
        userId: user.id,
        details: {
          choice: customId,
          source: 'dm_button',
        },
      });

      switch (customId) {
        case 'setup_ach':
          await this.handleACHSetup(interaction);
          break;
        case 'setup_crypto':
          await this.handleCryptoSetup(interaction);
          break;
        case 'setup_other':
          await this.handleOtherSetup(interaction);
          break;
        case 'show_friend_help':
          await this.showFriendHelp(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown setup option. Please try again.',
            ephemeral: true
          });
      }
    } catch (error) {
      await errorHandler.handleError(error as Error, {
        interaction,
        userId: interaction.user.id,
        additionalMetadata: {
          command: 'setup-delivery',
          action: 'handle_setup_choice',
          customId: interaction.customId
        }
      });
    }
  }

  /**
   * Handles ACH/Bank Transfer setup
   */
  private async handleACHSetup(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId('ach_setup_modal')
      .setTitle('🏦 ACH/Bank Transfer Setup');

    const accountNumberInput = new TextInputBuilder()
      .setCustomId('account_number')
      .setLabel('Bank Account Number')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your account number')
      .setRequired(true)
      .setMinLength(8)
      .setMaxLength(17);

    const routingNumberInput = new TextInputBuilder()
      .setCustomId('routing_number')
      .setLabel('Routing Number')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your routing number')
      .setRequired(true)
      .setMinLength(9)
      .setMaxLength(9);

    const accountTypeInput = new TextInputBuilder()
      .setCustomId('account_type')
      .setLabel('Account Type')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Checking or Savings')
      .setRequired(true)
      .setMinLength(7)
      .setMaxLength(8);

    const accountHolderInput = new TextInputBuilder()
      .setCustomId('account_holder')
      .setLabel('Account Holder Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Name on the account')
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(50);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(accountNumberInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(routingNumberInput);
    const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(accountTypeInput);
    const fourthActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(accountHolderInput);

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow);

    await interaction.showModal(modal);
  }

  /**
   * Handles Cryptocurrency setup
   */
  private async handleCryptoSetup(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId('crypto_setup_modal')
      .setTitle('₿ Cryptocurrency Setup');

    const walletAddressInput = new TextInputBuilder()
      .setCustomId('wallet_address')
      .setLabel('Wallet Address')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your wallet address')
      .setRequired(true)
      .setMinLength(26)
      .setMaxLength(100);

    const cryptoTypeInput = new TextInputBuilder()
      .setCustomId('crypto_type')
      .setLabel('Cryptocurrency Type')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('BTC, ETH, USDC, etc.')
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(10);

    const walletNameInput = new TextInputBuilder()
      .setCustomId('wallet_name')
      .setLabel('Wallet Name (Optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Give your wallet a nickname')
      .setRequired(false)
      .setMaxLength(30);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(walletAddressInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(cryptoTypeInput);
    const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(walletNameInput);

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

    await interaction.showModal(modal);
  }

  /**
   * Handles Other payment method setup
   */
  private async handleOtherSetup(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId('other_setup_modal')
      .setTitle('🔧 Alternative Payment Setup');

    const methodTypeInput = new TextInputBuilder()
      .setCustomId('method_type')
      .setLabel('Payment Method Type')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., PayPal, Venmo, Cash App')
      .setRequired(true)
      .setMaxLength(50);

    const accountInfoInput = new TextInputBuilder()
      .setCustomId('account_info')
      .setLabel('Account Information')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Provide details about your payment method (username, email, etc.)')
      .setRequired(true)
      .setMaxLength(500);

    const additionalNotesInput = new TextInputBuilder()
      .setCustomId('additional_notes')
      .setLabel('Additional Notes (Optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Any special instructions or preferences')
      .setRequired(false)
      .setMaxLength(300);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(methodTypeInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(accountInfoInput);
    const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(additionalNotesInput);

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

    await interaction.showModal(modal);
  }

  /**
   * Shows friend request help
   */
  private async showFriendHelp(interaction: ButtonInteraction): Promise<void> {
    const { content, embed } = this.dmHandler.createFriendRequestMessage();
    
    await interaction.reply({
      content: content,
      embeds: [embed],
      ephemeral: true
    });
  }

  /**
   * Processes setup modal submissions
   * This handles the actual setup data after users fill out the forms
   */
  async handleSetupModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
      const { customId } = interaction;
      const user = interaction.user;

      // Log modal submission
      await auditLogger.logEvent({
        eventType: AuditEventType.ACCOUNT_SETUP_FORM_SUBMITTED,
        severity: AuditSeverity.INFO,
        userId: user.id,
        details: {
          modalType: customId,
          source: 'dm_modal',
        },
      });

      switch (customId) {
        case 'ach_setup_modal':
          await this.processACHSetup(interaction);
          break;
        case 'crypto_setup_modal':
          await this.processCryptoSetup(interaction);
          break;
        case 'other_setup_modal':
          await this.processOtherSetup(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown setup form. Please try again.',
            ephemeral: true
          });
      }
    } catch (error) {
      await errorHandler.handleError(error as Error, {
        interaction,
        userId: interaction.user.id,
        additionalMetadata: {
          command: 'setup-delivery',
          action: 'handle_setup_modal',
          customId: interaction.customId
        }
      });
    }
  }

  /**
   * Processes ACH setup form submission
   */
  private async processACHSetup(interaction: ModalSubmitInteraction): Promise<void> {
    const accountNumber = interaction.fields.getTextInputValue('account_number');
    const routingNumber = interaction.fields.getTextInputValue('routing_number');
    const accountType = interaction.fields.getTextInputValue('account_type');
    const accountHolder = interaction.fields.getTextInputValue('account_holder');

    // Validate inputs
    if (!this.validateACHInputs(accountNumber, routingNumber, accountType, accountHolder)) {
      await interaction.reply({
        content: '❌ Invalid input. Please check your information and try again.',
        ephemeral: true
      });
      return;
    }

    try {
      // Store the payment method (this would integrate with your payment service)
      await this.storePaymentMethod(interaction.user.id, {
        type: 'ach',
        accountNumber: this.maskAccountNumber(accountNumber),
        routingNumber,
        accountType: accountType.toLowerCase(),
        accountHolder,
        isActive: true
      });

      // Send success message
      await this.dmHandler.sendSetupSuccessDM(interaction.user, 'ACH/Bank Transfer');

      // Update interaction
      await interaction.reply({
        content: '✅ ACH setup completed successfully! You can now use the /pay command.',
        ephemeral: true
      });

    } catch (error) {
      await this.dmHandler.sendSetupErrorDM(interaction.user, 'Failed to save ACH information');
      await interaction.reply({
        content: '❌ Setup failed. Please try again or contact support.',
        ephemeral: true
      });
    }
  }

  /**
   * Processes Crypto setup form submission
   */
  private async processCryptoSetup(interaction: ModalSubmitInteraction): Promise<void> {
    const walletAddress = interaction.fields.getTextInputValue('wallet_address');
    const cryptoType = interaction.fields.getTextInputValue('crypto_type');
    const walletName = interaction.fields.getTextInputValue('wallet_name') || 'Default';

    // Validate inputs
    if (!this.validateCryptoInputs(walletAddress, cryptoType)) {
      await interaction.reply({
        content: '❌ Invalid input. Please check your information and try again.',
        ephemeral: true
      });
      return;
    }

    try {
      // Store the payment method
      await this.storePaymentMethod(interaction.user.id, {
        type: 'crypto',
        walletAddress,
        cryptoType: cryptoType.toUpperCase(),
        walletName,
        isActive: true
      });

      // Send success message
      await this.dmHandler.sendSetupSuccessDM(interaction.user, 'Cryptocurrency');

      // Update interaction
      await interaction.reply({
        content: '✅ Crypto setup completed successfully! You can now use the /pay command.',
        ephemeral: true
      });

    } catch (error) {
      await this.dmHandler.sendSetupErrorDM(interaction.user, 'Failed to save cryptocurrency information');
      await interaction.reply({
        content: '❌ Setup failed. Please try again or contact support.',
        ephemeral: true
      });
    }
  }

  /**
   * Processes Other payment method setup form submission
   */
  private async processOtherSetup(interaction: ModalSubmitInteraction): Promise<void> {
    const methodType = interaction.fields.getTextInputValue('method_type');
    const accountInfo = interaction.fields.getTextInputValue('account_info');
    const additionalNotes = interaction.fields.getTextInputValue('additional_notes') || '';

    // Validate inputs
    if (!this.validateOtherInputs(methodType, accountInfo)) {
      await interaction.reply({
        content: '❌ Invalid input. Please check your information and try again.',
        ephemeral: true
      });
      return;
    }

    try {
      // Store the payment method
      await this.storePaymentMethod(interaction.user.id, {
        type: 'other',
        methodType,
        accountInfo,
        additionalNotes,
        isActive: true
      });

      // Send success message
      await this.dmHandler.sendSetupSuccessDM(interaction.user, methodType);

      // Update interaction
      await interaction.reply({
        content: `✅ ${methodType} setup completed successfully! You can now use the /pay command.`,
        ephemeral: true
      });

    } catch (error) {
      await this.dmHandler.sendSetupErrorDM(interaction.user, 'Failed to save payment method information');
      await interaction.reply({
        content: '❌ Setup failed. Please try again or contact support.',
        ephemeral: true
      });
    }
  }

  /**
   * Validates ACH input fields
   */
  private validateACHInputs(accountNumber: string, routingNumber: string, accountType: string, accountHolder: string): boolean {
    // Basic validation - in production, you'd want more sophisticated validation
    const accountNumberRegex = /^\d{8,17}$/;
    const routingNumberRegex = /^\d{9}$/;
    const accountTypeRegex = /^(checking|savings)$/i;
    const accountHolderRegex = /^[a-zA-Z\s]{2,50}$/;

    return (
      accountNumberRegex.test(accountNumber) &&
      routingNumberRegex.test(routingNumber) &&
      accountTypeRegex.test(accountType) &&
      accountHolderRegex.test(accountHolder)
    );
  }

  /**
   * Validates Crypto input fields
   */
  private validateCryptoInputs(walletAddress: string, cryptoType: string): boolean {
    // Basic validation - in production, you'd want more sophisticated validation
    const walletAddressRegex = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^0x[a-fA-F0-9]{40}$/;
    const cryptoTypeRegex = /^[A-Z]{2,10}$/;

    return (
      walletAddressRegex.test(walletAddress) &&
      cryptoTypeRegex.test(cryptoType)
    );
  }

  /**
   * Validates Other payment method input fields
   */
  private validateOtherInputs(methodType: string, accountInfo: string): boolean {
    return (
      methodType.length >= 2 &&
      methodType.length <= 50 &&
      accountInfo.length >= 5 &&
      accountInfo.length <= 500
    );
  }

  /**
   * Masks account number for security
   */
  private maskAccountNumber(accountNumber: string): string {
    if (accountNumber.length <= 4) return accountNumber;
    return '*'.repeat(accountNumber.length - 4) + accountNumber.slice(-4);
  }

  /**
   * Stores payment method information
   * This is a placeholder - integrate with your actual payment service
   */
  private async storePaymentMethod(userId: string, paymentMethod: any): Promise<void> {
    // TODO: Integrate with your PaymentMethodService or similar
    console.log(`🐷 Storing payment method for user ${userId}:`, paymentMethod);
    
    // For now, just log the event
    await auditLogger.logEvent({
      eventType: AuditEventType.ACCOUNT_SETUP_COMPLETED,
      severity: AuditSeverity.INFO,
      userId,
      details: {
        paymentMethodType: paymentMethod.type,
        isActive: paymentMethod.isActive,
      },
    });
  }
}


