// PaymentMethodSelectionHandler handles payment method selection
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  User
} from 'discord.js';
import { UserAccountService } from '../../services/UserAccountService';
import { PaymentMethodType } from '../../models/UserAccount';

export class PaymentMethodSelectionHandler {
  private userAccountService: UserAccountService;

  constructor(userAccountService: UserAccountService) {
    this.userAccountService = userAccountService;
  }

  /**
   * Shows payment method selection interface
   */
  async showPaymentMethodSelection(
    interaction: ChatInputCommandInteraction,
    recipient: User,
    amount: number,
    description: string
  ): Promise<void> {
    const senderAccount = await this.userAccountService.getAccount(interaction.user.id);
    const paymentMethods = senderAccount?.paymentMethods || [];

    const embed = new EmbedBuilder()
      .setTitle('💳 Select Payment Method')
      .setDescription(`Choose how you'd like to pay **${recipient.username}** $${amount.toFixed(2)}`)
      .setColor('#0099ff')
      .addFields(
        { name: 'Recipient', value: recipient.username, inline: true },
        { name: 'Amount', value: `$${amount.toFixed(2)}`, inline: true },
        { name: 'Description', value: description || 'No description', inline: true }
      );

    if (paymentMethods.length === 0) {
      await this.handleNoPaymentMethods(interaction);
      return;
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`payment_method_select_${recipient.id}_${amount}_${description}`)
      .setPlaceholder('Choose your payment method')
      .addOptions(
        paymentMethods.map(method => ({
          label: this.getPaymentMethodDisplayName(method.type),
          value: method.id,
          emoji: this.getPaymentMethodEmoji(method.type),
          description: this.getPaymentMethodDescription(method.type)
        }))
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  }

  /**
   * Handles case when user has no payment methods
   */
  async handleNoPaymentMethods(interaction: ChatInputCommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('❌ No Payment Methods Found')
      .setDescription('You need to set up a payment method before you can send payments.')
      .setColor('#ff0000')
      .addFields(
        { name: 'Next Steps', value: 'Use `/setup-payment` to configure your payment methods.' }
      );

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Gets display name for payment method type
   */
  private getPaymentMethodDisplayName(type: PaymentMethodType): string {
    switch (type) {
      case 'ACH':
        return 'ACH/Bank Transfer';
      case 'CRYPTO':
        return 'Cryptocurrency';
      case 'OTHER':
        return 'Alternative Payment';
      default:
        return 'Unknown Method';
    }
  }

  /**
   * Gets emoji for payment method type
   */
  private getPaymentMethodEmoji(type: PaymentMethodType): string {
    switch (type) {
      case 'ACH':
        return '💳';
      case 'CRYPTO':
        return '₿';
      case 'OTHER':
        return '🔧';
      default:
        return '❓';
    }
  }

  /**
   * Gets description for payment method type
   */
  private getPaymentMethodDescription(type: PaymentMethodType): string {
    switch (type) {
      case 'ACH':
        return 'Direct bank transfer';
      case 'CRYPTO':
        return 'Cryptocurrency payment';
      case 'OTHER':
        return 'Alternative payment method';
      default:
        return 'Unknown payment method';
    }
  }
}
