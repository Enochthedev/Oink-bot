// PaymentResultHandler handles payment results and error cases
import {
  ChatInputCommandInteraction,
  EmbedBuilder
} from 'discord.js';

export class PaymentResultHandler {
  /**
   * Handles case when payment limit is exceeded
   */
  async handlePaymentLimitExceeded(
    interaction: ChatInputCommandInteraction,
    amount: number
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('❌ Payment Limit Exceeded')
      .setDescription(`Your payment of $${amount.toFixed(2)} exceeds the allowed limit.`)
      .setColor('#ff0000')
      .addFields(
        { name: 'Amount', value: `$${amount.toFixed(2)}`, inline: true },
        { name: 'Status', value: 'Blocked', inline: true }
      )
      .setFooter({ text: 'Please contact an administrator to increase your limits' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handles case when rate limit is exceeded
   */
  async handleRateLimitExceeded(interaction: ChatInputCommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('⏰ Rate Limit Exceeded')
      .setDescription('You are making payments too frequently. Please wait a moment before trying again.')
      .setColor('#ff9900')
      .addFields(
        { name: 'Status', value: 'Rate Limited', inline: true },
        { name: 'Action', value: 'Wait and retry', inline: true }
      )
      .setFooter({ text: 'Rate limits help prevent abuse and ensure system stability' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handles payment errors
   */
  async handlePaymentError(
    interaction: ChatInputCommandInteraction,
    error: Error
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('❌ Payment Error')
      .setDescription('An error occurred while processing your payment.')
      .setColor('#ff0000')
      .addFields(
        { name: 'Error', value: error.message, inline: false },
        { name: 'Status', value: 'Failed', inline: true }
      )
      .setFooter({ text: 'Please try again or contact support if the problem persists' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handles payment cancellation
   */
  async handlePaymentCancellation(interaction: ChatInputCommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🚫 Payment Cancelled')
      .setDescription('Your payment has been cancelled.')
      .setColor('#808080')
      .addFields(
        { name: 'Status', value: 'Cancelled', inline: true },
        { name: 'Action', value: 'No charges made', inline: true }
      )
      .setFooter({ text: 'You can initiate a new payment when ready' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Shows payment processing status
   */
  async showPaymentProcessing(
    interaction: ChatInputCommandInteraction,
    amount: number,
    recipient: string
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('⏳ Processing Payment')
      .setDescription('Your payment is being processed. Please wait...')
      .setColor('#0099ff')
      .addFields(
        { name: 'Amount', value: `$${amount.toFixed(2)}`, inline: true },
        { name: 'Recipient', value: recipient, inline: true },
        { name: 'Status', value: 'Processing', inline: true }
      )
      .setFooter({ text: 'This may take a few moments' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Shows payment verification required
   */
  async showPaymentVerificationRequired(
    interaction: ChatInputCommandInteraction,
    amount: number,
    recipient: string
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🔒 Verification Required')
      .setDescription('Your payment requires additional verification before it can be processed.')
      .setColor('#ff9900')
      .addFields(
        { name: 'Amount', value: `$${amount.toFixed(2)}`, inline: true },
        { name: 'Recipient', value: recipient, inline: true },
        { name: 'Status', value: 'Pending Verification', inline: true }
      )
      .setFooter({ text: 'You will receive a notification when verification is complete' });

    await interaction.editReply({ embeds: [embed] });
  }
}
