import { ButtonInteraction, EmbedBuilder } from 'discord.js';
import { PaymentRequestService } from '../../services/PaymentRequestService';

export class RequestInteractionHandler {
    /**
     * Handle payment request response (accept/decline)
     */
    public async handlePaymentRequestResponse(
        interaction: ButtonInteraction,
        paymentRequestService: PaymentRequestService
    ): Promise<void> {
        const action = interaction.customId;
        const requestId = interaction.message.embeds[0]?.footer?.text?.split(': ')[1];

        if (!requestId) {
            await interaction.reply({
                content: '❌ Could not identify payment request.',
                ephemeral: true
            });
            return;
        }

        try {
            if (action === 'accept_request') {
                await this.acceptRequest(interaction, requestId, paymentRequestService);
            } else if (action === 'decline_request') {
                await this.declineRequest(interaction, requestId, paymentRequestService);
            }
        } catch (error) {
            console.error('Error handling payment request response:', error);
            await interaction.reply({
                content: '❌ Failed to process request response.',
                ephemeral: true
            });
        }
    }

    private async acceptRequest(
        interaction: ButtonInteraction,
        requestId: string,
        paymentRequestService: PaymentRequestService
    ): Promise<void> {
        // For now, we'll just acknowledge the acceptance
        // In a real implementation, this would trigger the payment flow
        const embed = new EmbedBuilder()
            .setTitle('✅ Payment Request Accepted')
            .setDescription('The payment request has been accepted. Payment processing will begin shortly.')
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }

    private async declineRequest(
        interaction: ButtonInteraction,
        requestId: string,
        paymentRequestService: PaymentRequestService
    ): Promise<void> {
        // For now, we'll just acknowledge the decline
        // In a real implementation, this would update the request status
        const embed = new EmbedBuilder()
            .setTitle('❌ Payment Request Declined')
            .setDescription('The payment request has been declined.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
}
