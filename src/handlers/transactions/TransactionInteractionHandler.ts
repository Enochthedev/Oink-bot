// TransactionInteractionHandler handles button and select menu interactions for transactions
import {
    ButtonInteraction,
    StringSelectMenuInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { PaymentService } from '../../services/PaymentService';
import { UserAccountService } from '../../services/UserAccountService';
import { TransactionDisplayHandler } from './TransactionDisplayHandler';

export class TransactionInteractionHandler {
    private displayHandler: TransactionDisplayHandler;

    constructor() {
        this.displayHandler = new TransactionDisplayHandler();
    }

    /**
     * Handle transaction detail view
     */
    public async handleTransactionDetailView(
        interaction: ButtonInteraction,
        paymentService: PaymentService,
        userAccountService: UserAccountService
    ): Promise<void> {
        try {
            const customId = interaction.customId;
            const transactionId = customId.replace('transaction_detail_', '');

            const transaction = await paymentService.getTransaction(transactionId);
            if (!transaction) {
                await interaction.reply({
                    content: '❌ Transaction not found.',
                    ephemeral: true
                });
                return;
            }

            // Check if user owns this transaction
            const userId = interaction.user.id;
            if (transaction.senderId !== userId && transaction.recipientId !== userId) {
                await interaction.reply({
                    content: '❌ You can only view your own transactions.',
                    ephemeral: true
                });
                return;
            }

            const embed = await this.displayHandler.createTransactionDetailEmbed(transaction, userId);
            const actionRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('transaction_back_to_list')
                        .setLabel('Back to List')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.update({
                embeds: [embed],
                components: [actionRow]
            });

        } catch (error) {
            console.error('Error handling transaction detail view:', error);
            await interaction.reply({
                content: '❌ Failed to load transaction details. Please try again.',
                ephemeral: true
            });
        }
    }

    /**
     * Handle transaction export
     */
    public async handleTransactionExport(
        interaction: ButtonInteraction,
        paymentService: PaymentService,
        userAccountService: UserAccountService
    ): Promise<void> {
        try {
            const userId = interaction.user.id;
            const transactions = await paymentService.getTransactionHistory(userId, 1000); // Get all transactions

            if (transactions.length === 0) {
                await interaction.reply({
                    content: '❌ No transactions to export.',
                    ephemeral: true
                });
                return;
            }

            const csvContent = this.createTransactionCSV(transactions, userId);
            const buffer = Buffer.from(csvContent, 'utf-8');

            const embed = new EmbedBuilder()
                .setTitle('📊 Transaction Export')
                .setDescription(`Exported ${transactions.length} transactions to CSV format.`)
                .setColor(0x00ff00)
                .setTimestamp();

            const actionRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('transaction_back_to_list')
                        .setLabel('Back to List')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.update({
                embeds: [embed],
                components: [actionRow]
            });

            // Send the CSV file as a follow-up
            await interaction.followUp({
                files: [{
                    attachment: buffer,
                    name: `transactions_${userId}_${new Date().toISOString().split('T')[0]}.csv`
                }],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error handling transaction export:', error);
            await interaction.reply({
                content: '❌ Failed to export transactions. Please try again.',
                ephemeral: true
            });
        }
    }

    /**
     * Handle transaction filter
     */
    public async handleTransactionFilter(
        interaction: StringSelectMenuInteraction,
        paymentService: PaymentService,
        userAccountService: UserAccountService
    ): Promise<void> {
        try {
            const userId = interaction.user.id;
            const filterType = interaction.values[0];

            const filteredTransactions = await this.getFilteredTransactions(userId, filterType, paymentService);

            if (filteredTransactions.length === 0) {
                await interaction.update({
                    content: `📊 No transactions found for filter: ${filterType}`,
                    embeds: [],
                    components: []
                });
                return;
            }

            const embed = await this.displayHandler.createTransactionHistoryEmbed(
                filteredTransactions,
                userId,
                filteredTransactions.length,
                filterType
            );

            const actionRow = this.displayHandler.createTransactionActionButtons(userId);

            await interaction.update({
                embeds: [embed],
                components: actionRow
            });

        } catch (error) {
            console.error('Error handling transaction filter:', error);
            await interaction.reply({
                content: '❌ Failed to filter transactions. Please try again.',
                ephemeral: true
            });
        }
    }

    /**
     * Get filtered transactions based on filter type
     */
    private async getFilteredTransactions(
        userId: string,
        filterType: string,
        paymentService: PaymentService
    ): Promise<any[]> {
        const allTransactions = await paymentService.getTransactionHistory(userId, 1000);

        switch (filterType) {
            case 'completed':
                return allTransactions.filter(t => t.status === 'COMPLETED');
            case 'pending':
                return allTransactions.filter(t => t.status === 'PENDING');
            case 'failed':
                return allTransactions.filter(t => t.status === 'FAILED');
            case 'incoming':
                return allTransactions.filter(t => t.amount > 0);
            case 'outgoing':
                return allTransactions.filter(t => t.amount < 0);
            default:
                return allTransactions;
        }
    }

    /**
     * Create transaction CSV content
     */
    private createTransactionCSV(transactions: any[], userId: string): string {
        const headers = ['ID', 'Description', 'Amount', 'Status', 'Created At', 'Updated At'];
        const rows = transactions.map(t => [
            t.id,
            t.description || '',
            t.amount,
            t.status,
            t.createdAt.toISOString(),
            t.updatedAt.toISOString()
        ]);

        return [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
    }
}
