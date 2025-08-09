// Core TransactionCommandHandler that orchestrates transaction flows
import {
    CommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction
} from 'discord.js';
import { CommandHandler } from '../CommandHandler';
import { PaymentService, PaymentServiceImpl } from '../../services/PaymentService';
import { UserAccountService, UserAccountServiceImpl } from '../../services/UserAccountService';
import { TransactionOrchestrator } from './TransactionOrchestrator';

export interface TransactionCommandHandler extends CommandHandler {
    handleTransactionsCommand(interaction: CommandInteraction): Promise<void>;
    handleTransactionDetailView(interaction: ButtonInteraction): Promise<void>;
    handleTransactionExport(interaction: ButtonInteraction): Promise<void>;
    handleTransactionFilter(interaction: StringSelectMenuInteraction): Promise<void>;
}

export class TransactionCommandHandlerImpl implements TransactionCommandHandler {
    private readonly paymentService: PaymentService;
    private readonly userAccountService: UserAccountService;
    private readonly transactionOrchestrator: TransactionOrchestrator;
    private readonly defaultLimit = 10;
    private readonly maxLimit = 50;

    constructor(
        paymentService?: PaymentService,
        userAccountService?: UserAccountService
    ) {
        this.paymentService = paymentService || new PaymentServiceImpl();
        this.userAccountService = userAccountService || new UserAccountServiceImpl();
        this.transactionOrchestrator = new TransactionOrchestrator(
            this.paymentService,
            this.userAccountService
        );
    }

    getCommandName(): string {
        return 'transactions';
    }

    validateParameters(interaction: CommandInteraction): boolean {
        if (!interaction.isChatInputCommand()) return true;
        const limit = interaction.options.get('limit')?.value as number | undefined;

        if (limit !== undefined) {
            if (!Number.isInteger(limit) || limit < 1 || limit > this.maxLimit) {
                return false;
            }
        }

        return true;
    }

    async handle(interaction: CommandInteraction): Promise<void> {
        await this.handleTransactionsCommand(interaction);
    }

    async handleTransactionsCommand(interaction: CommandInteraction): Promise<void> {
        await this.transactionOrchestrator.handleTransactionsCommand(interaction);
    }

    async handleTransactionDetailView(interaction: ButtonInteraction): Promise<void> {
        await this.transactionOrchestrator.handleTransactionDetailView(interaction);
    }

    async handleTransactionExport(interaction: ButtonInteraction): Promise<void> {
        await this.transactionOrchestrator.handleTransactionExport(interaction);
    }

    async handleTransactionFilter(interaction: StringSelectMenuInteraction): Promise<void> {
        await this.transactionOrchestrator.handleTransactionFilter(interaction);
    }

    // Get the orchestrator for direct access if needed
    public getTransactionOrchestrator(): TransactionOrchestrator {
        return this.transactionOrchestrator;
    }
}
