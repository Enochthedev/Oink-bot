// Core RequestCommandHandler that orchestrates payment request flows
import {
    CommandInteraction,
    ButtonInteraction
} from 'discord.js';
import { CommandHandler } from '../CommandHandler';
import { PaymentRequestService, PaymentRequestServiceImpl } from '../../services/PaymentRequestService';
import { PaymentService, PaymentServiceImpl } from '../../services/PaymentService';
import { UserAccountService, UserAccountServiceImpl } from '../../services/UserAccountService';
import { NotificationService, NotificationServiceImpl } from '../../services/NotificationService';
import { RequestOrchestrator } from './RequestOrchestrator';

export class RequestCommandHandler implements CommandHandler {
    private readonly paymentRequestService: PaymentRequestService;
    private readonly paymentService: PaymentService;
    private readonly userAccountService: UserAccountService;
    private readonly notificationService: NotificationService;
    private readonly requestOrchestrator: RequestOrchestrator;

    constructor(
        paymentRequestService?: PaymentRequestService,
        paymentService?: PaymentService,
        userAccountService?: UserAccountService,
        notificationService?: NotificationService
    ) {
        this.paymentService = paymentService || new PaymentServiceImpl();
        this.userAccountService = userAccountService || new UserAccountServiceImpl();
        this.paymentRequestService = paymentRequestService || new PaymentRequestServiceImpl(
            this.paymentService,
            this.userAccountService
        );
        this.notificationService = notificationService || new NotificationServiceImpl();
        this.requestOrchestrator = new RequestOrchestrator(
            this.paymentRequestService,
            this.paymentService,
            this.userAccountService,
            this.notificationService
        );
    }

    getCommandName(): string {
        return 'request';
    }

    validateParameters(interaction: CommandInteraction): boolean {
        if (!interaction.isChatInputCommand()) return false;
        const from = interaction.options.getUser('from');
        const amount = interaction.options.getNumber('amount');
        const description = interaction.options.getString('description');

        return !!(from && amount && description && amount > 0);
    }

    async handle(interaction: CommandInteraction): Promise<void> {
        if (!interaction.isChatInputCommand()) return;
        await this.handleRequestCommand(interaction);
    }

    async handleRequestCommand(interaction: CommandInteraction): Promise<void> {
        await this.requestOrchestrator.handleRequestCommand(interaction);
    }

    async handlePaymentRequestResponse(interaction: ButtonInteraction): Promise<void> {
        await this.requestOrchestrator.handlePaymentRequestResponse(interaction);
    }

    // Get the orchestrator for direct access if needed
    public getRequestOrchestrator(): RequestOrchestrator {
        return this.requestOrchestrator;
    }
}
