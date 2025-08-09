// TransactionDisplayHandler handles creating embeds and UI components for transactions
import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} from 'discord.js';
import { Transaction, TransactionStatus } from '../../models/Transaction';

export class TransactionDisplayHandler {
    /**
     * Create transaction history embed
     */
    public async createTransactionHistoryEmbed(
        transactions: Transaction[],
        userId: string,
        limit: number,
        filterType?: string
    ): Promise<EmbedBuilder> {
        const embed = new EmbedBuilder()
            .setTitle('📊 Transaction History')
            .setDescription(`Showing your last ${transactions.length} transactions${filterType ? ` (${filterType})` : ''}`)
            .setColor(0x0099ff)
            .setTimestamp();

        // Add transaction fields
        for (let i = 0; i < Math.min(transactions.length, 10); i++) {
            const transaction = transactions[i];
            const statusEmoji = this.getStatusEmoji(transaction.status);
            const amount = transaction.amount >= 0 ? `+$${transaction.amount.toFixed(2)}` : `-$${Math.abs(transaction.amount).toFixed(2)}`;
            
            embed.addFields({
                name: `${statusEmoji} Transaction`,
                value: `**Amount:** ${amount}\n**Status:** ${transaction.status}\n**Date:** ${transaction.createdAt.toLocaleDateString()}`,
                inline: false
            });
        }

        if (transactions.length > 10) {
            embed.setFooter({ text: `And ${transactions.length - 10} more transactions...` });
        }

        return embed;
    }

    /**
     * Create transaction detail embed
     */
    public async createTransactionDetailEmbed(transaction: Transaction, userId: string): Promise<EmbedBuilder> {
        const embed = new EmbedBuilder()
            .setTitle('🔍 Transaction Details')
            .setColor(this.getStatusColor(transaction.status))
            .setTimestamp();

        const amount = transaction.amount >= 0 ? `+$${transaction.amount.toFixed(2)}` : `-$${Math.abs(transaction.amount).toFixed(2)}`;
        const statusEmoji = this.getStatusEmoji(transaction.status);

        embed.addFields(
            { name: 'Amount', value: `$${transaction.amount.toFixed(2)}`, inline: true },
            { name: 'Amount', value: amount, inline: true },
            { name: 'Status', value: `${statusEmoji} ${transaction.status}`, inline: true },
            { name: 'Transaction ID', value: transaction.id, inline: true },
            { name: 'Date', value: transaction.createdAt.toLocaleString(), inline: true },
            { name: 'Created', value: transaction.createdAt.toLocaleString(), inline: true }
        );



        return embed;
    }

    /**
     * Create transaction action buttons
     */
    public createTransactionActionButtons(userId: string): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
        const row = new ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>();

        // Add filter dropdown
        const filterMenu = new StringSelectMenuBuilder()
            .setCustomId(`transaction_filter_${userId}`)
            .setPlaceholder('Filter transactions')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('All Transactions')
                    .setValue('all')
                    .setDescription('Show all transactions'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Completed')
                    .setValue('completed')
                    .setDescription('Show only completed transactions'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Pending')
                    .setValue('pending')
                    .setDescription('Show only pending transactions'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Failed')
                    .setValue('failed')
                    .setDescription('Show only failed transactions'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Incoming')
                    .setValue('incoming')
                    .setDescription('Show only incoming transactions'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Outgoing')
                    .setValue('outgoing')
                    .setDescription('Show only outgoing transactions')
            ]);

        row.addComponents(filterMenu);

        // Add action buttons
        const buttonRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`transaction_export_${userId}`)
                    .setLabel('Export CSV')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`transaction_refresh_${userId}`)
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary)
            );

        return [row, buttonRow];
    }

    /**
     * Get status emoji
     */
    private getStatusEmoji(status: TransactionStatus): string {
        const emojiMap: { [key in TransactionStatus]: string } = {
            [TransactionStatus.PENDING]: '⏳',
            [TransactionStatus.ESCROWED]: '🔒',
            [TransactionStatus.COMPLETED]: '✅',
            [TransactionStatus.FAILED]: '❌',
            [TransactionStatus.CANCELLED]: '🚫'
        };

        return emojiMap[status] || '❓';
    }

    /**
     * Get status color
     */
    private getStatusColor(status: TransactionStatus): number {
        const colorMap: { [key in TransactionStatus]: number } = {
            [TransactionStatus.PENDING]: 0xffa500, // Orange
            [TransactionStatus.ESCROWED]: 0x0000ff, // Blue
            [TransactionStatus.COMPLETED]: 0x00ff00, // Green
            [TransactionStatus.FAILED]: 0xff0000, // Red
            [TransactionStatus.CANCELLED]: 0x808080 // Gray
        };

        return colorMap[status] || 0x0099ff; // Default blue
    }
}
