// PaymentConfirmationHandler handles payment confirmation flows
import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { PaymentService } from '../../services/PaymentService';
import { Transaction } from '../../models/Transaction';
import { User } from 'discord.js';

export class PaymentConfirmationHandler {
  private paymentService: PaymentService;

  constructor(paymentService: PaymentService) {
    this.paymentService = paymentService;
  }

  /**
   * Shows payment confirmation interface
   */
  async showPaymentConfirmation(
    interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
    recipient: User,
    amount: number,
    description: string,
    senderPaymentMethod: any
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('💳 Confirm Payment')
      .setDescription('Please review your payment details before confirming.')
      .setColor('#ff9900')
      .addFields(
        { name: 'Recipient', value: recipient.username, inline: true },
        { name: 'Amount', value: `$${amount.toFixed(2)}`, inline: true },
        { name: 'Description', value: description || 'No description', inline: true },
        { name: 'Payment Method', value: this.getPaymentMethodDisplayName(senderPaymentMethod.type), inline: true },
        { name: 'Processing Fee', value: `$${(amount * 0.029 + 0.30).toFixed(2)}`, inline: true },
        { name: 'Escrow Fee', value: `$${(amount * 0.01).toFixed(2)}`, inline: true },
        { name: 'Total Amount', value: `$${(amount * 1.039 + 0.30).toFixed(2)}`, inline: true }
      )
      .setFooter({ text: 'Click Confirm to proceed with the payment' });

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_payment_${recipient.id}_${amount}_${senderPaymentMethod.id}`)
          .setLabel('✅ Confirm Payment')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`cancel_payment_${recipient.id}_${amount}`)
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Danger)
      );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  }

  /**
   * Handles payment confirmation button click
   */
  async handlePaymentConfirmation(interaction: ButtonInteraction): Promise<void> {
    const { customId } = interaction;
    
    if (!customId.startsWith('confirm_payment_')) {
      return;
    }

    try {
      const [, , recipientId, amount, paymentMethodId] = customId.split('_');
      
      // Process the payment
      const transaction = await this.paymentService.initiatePayment(
        interaction.user.id,
        recipientId,
        parseFloat(amount),
        paymentMethodId
      );

      // Show success message
      await this.showPaymentSuccess(interaction, transaction, recipientId, amount);

    } catch (error) {
      await this.handlePaymentError(interaction, error as Error);
    }
  }

  /**
   * Shows payment success message
   */
  async showPaymentSuccess(
    interaction: ButtonInteraction,
    transaction: Transaction,
    recipientId: string,
    amount: string
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('✅ Payment Successful!')
      .setDescription(`Your payment of $${amount} has been processed successfully.`)
      .setColor('#00ff00')
      .addFields(
        { name: 'Transaction ID', value: transaction.id, inline: true },
        { name: 'Status', value: 'Processing', inline: true },
        { name: 'Recipient', value: `<@${recipientId}>`, inline: true }
      )
      .setFooter({ text: 'The recipient will be notified shortly' });

    await interaction.update({
      embeds: [embed],
      components: []
    });
  }

  /**
   * Handles payment errors
   */
  async handlePaymentError(
    interaction: ButtonInteraction,
    error: Error
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('❌ Payment Failed')
      .setDescription(`There was an error processing your payment: ${error.message}`)
      .setColor('#ff0000')
      .setFooter({ text: 'Please try again or contact support' });

    await interaction.update({
      embeds: [embed],
      components: []
    });
  }

  /**
   * Gets display name for payment method type
   */
  private getPaymentMethodDisplayName(type: string): string {
    switch (type) {
      case 'ach':
        return 'ACH/Bank Transfer';
      case 'crypto':
        return 'Cryptocurrency';
      case 'other':
        return 'Alternative Payment';
      default:
        return 'Unknown Method';
    }
  }
}
