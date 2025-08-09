// TransactionOrchestrator manages the overall transaction flow
import {
    CommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction
} from 'discord.js';
import { PaymentService } from '../../services/PaymentService';
import { UserAccountService } from '../../services/UserAccountService';
import { TransactionDisplayHandler } from './TransactionDisplayHandler';
import { TransactionInteractionHandler } from './TransactionInteractionHandler';
import { TransactionDataHandler } from './TransactionDataHandler';

export class TransactionOrchestrator {
    private paymentService: PaymentService;
    private userAccountService: UserAccountService;
    private displayHandler: TransactionDisplayHandler;
    private interactionHandler: TransactionInteractionHandler;
    private dataHandler: TransactionDataHandler;
    private readonly defaultLimit = 10;

    constructor(
        paymentService: PaymentService,
        userAccountService: UserAccountService
    ) {
        this.paymentService = paymentService;
        this.userAccountService = userAccountService;
        this.displayHandler = new TransactionDisplayHandler();
        this.interactionHandler = new TransactionInteractionHandler();
        this.dataHandler = new TransactionDataHandler(paymentService, userAccountService);
    }

    /**
     * Handle the main transactions command
     */
    public async handleTransactionsCommand(interaction: CommandInteraction): Promise<void> {
        try {
            if (!interaction.isChatInputCommand()) return;
            await interaction.deferReply({ ephemeral: true });

            const userId = interaction.user.id;
            const limit = (interaction.options.get('limit')?.value as number) || this.defaultLimit;

            // Check if user has an account
            const userAccount = await this.userAccountService.getAccount(userId);
            if (!userAccount) {
                await interaction.editReply({
                    content: '❌ You don\'t have a payment account set up yet. Use `/setup-payment` to get started.',
                });
                return;
            }

            // Get transaction history
            const transactions = await this.paymentService.getTransactionHistory(userId, limit);

            if (transactions.length === 0) {
                await interaction.editReply({
                    content: '📊 You have no transaction history yet.',
                });
                return;
            }

            // Create transaction history embed and components
            const embed = await this.displayHandler.createTransactionHistoryEmbed(transactions, userId, limit);
            const actionRow = this.displayHandler.createTransactionActionButtons(userId);

            await interaction.editReply({
                embeds: [embed],
                components: actionRow,
            });

        } catch (error) {
            console.error('Error handling transactions command:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            await interaction.editReply({
                content: `❌ Error: ${errorMessage}`,
            });
        }
    }

    /**
     * Handle transaction detail view
     */
    public async handleTransactionDetailView(interaction: ButtonInteraction): Promise<void> {
        await this.interactionHandler.handleTransactionDetailView(interaction, this.paymentService, this.userAccountService);
    }

    /**
     * Handle transaction export
     */
    public async handleTransactionExport(interaction: ButtonInteraction): Promise<void> {
        await this.interactionHandler.handleTransactionExport(interaction, this.paymentService, this.userAccountService);
    }

    /**
     * Handle transaction filter
     */
    public async handleTransactionFilter(interaction: StringSelectMenuInteraction): Promise<void> {
        await this.interactionHandler.handleTransactionFilter(interaction, this.paymentService, this.userAccountService);
    }

    // Getter methods for individual handlers
    public getDisplayHandler(): TransactionDisplayHandler {
        return this.displayHandler;
    }

    public getInteractionHandler(): TransactionInteractionHandler {
        return this.interactionHandler;
    }

    public getDataHandler(): TransactionDataHandler {
        return this.dataHandler;
    }
}
