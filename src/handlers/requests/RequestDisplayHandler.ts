import { EmbedBuilder, User } from 'discord.js';
import { PaymentRequest } from '../../models/PaymentRequest';

export class RequestDisplayHandler {
    /**
     * Create an embed for a newly created payment request
     */
    public createRequestCreatedEmbed(
        paymentRequest: PaymentRequest,
        payer: User,
        amount: number,
        description: string
    ): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle('💰 Payment Request Created')
            .setDescription(`A payment request has been created for you.`)
            .addFields(
                { name: 'From', value: `<@${payer.id}>`, inline: true },
                { name: 'Amount', value: `$${amount.toFixed(2)}`, inline: true },
                { name: 'Description', value: description, inline: false },
                { name: 'Request ID', value: paymentRequest.id, inline: true }
            )
            .setColor(0x00ff00)
            .setTimestamp();
    }

    /**
     * Create an embed for payment request details
     */
    public createRequestDetailsEmbed(paymentRequest: PaymentRequest): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle('📋 Payment Request Details')
            .addFields(
                { name: 'Request ID', value: paymentRequest.id, inline: true },
                { name: 'Amount', value: `$${paymentRequest.amount.toFixed(2)}`, inline: true },
                { name: 'Status', value: paymentRequest.status, inline: true },
                { name: 'Description', value: paymentRequest.description, inline: false },
                { name: 'Created', value: paymentRequest.createdAt.toLocaleString(), inline: true }
            )
            .setColor(0x0099ff)
            .setTimestamp();
    }
}
