// RequestOrchestrator manages the overall payment request flow
import {
    CommandInteraction,
    ButtonInteraction,
    User
} from 'discord.js';
import { PaymentRequestService } from '../../services/PaymentRequestService';
import { PaymentService } from '../../services/PaymentService';
import { UserAccountService } from '../../services/UserAccountService';
import { NotificationService } from '../../services/NotificationService';
import { RequestDisplayHandler } from './RequestDisplayHandler';
import { RequestInteractionHandler } from './RequestInteractionHandler';
import { RequestValidationHandler } from './RequestValidationHandler';

export class RequestOrchestrator {
    private paymentRequestService: PaymentRequestService;
    private paymentService: PaymentService;
    private userAccountService: UserAccountService;
    private notificationService: NotificationService;
    private displayHandler: RequestDisplayHandler;
    private interactionHandler: RequestInteractionHandler;
    private validationHandler: RequestValidationHandler;

    constructor(
        paymentRequestService: PaymentRequestService,
        paymentService: PaymentService,
        userAccountService: UserAccountService,
        notificationService: NotificationService
    ) {
        this.paymentRequestService = paymentRequestService;
        this.paymentService = paymentService;
        this.userAccountService = userAccountService;
        this.notificationService = notificationService;
        this.displayHandler = new RequestDisplayHandler();
        this.interactionHandler = new RequestInteractionHandler();
        this.validationHandler = new RequestValidationHandler();
    }

    /**
     * Handle the main request command
     */
    public async handleRequestCommand(interaction: CommandInteraction): Promise<void> {
        if (!interaction.isChatInputCommand()) return;
        
        try {
            const from = interaction.options.getUser('from', true);
            const amount = interaction.options.getNumber('amount', true);
            const description = interaction.options.getString('description', true);
            const requesterId = interaction.user.id;
            const payerId = from.id;
            const serverId = interaction.guildId;

            // Validate the request
            const validationResult = await this.validationHandler.validateRequest(
                interaction,
                requesterId,
                payerId,
                from,
                amount
            );

            if (!validationResult.isValid) {
                await interaction.reply({
                    content: validationResult.errorMessage,
                    ephemeral: true
                });
                return;
            }

            // Create the payment request
            const paymentRequest = await this.paymentRequestService.createPaymentRequest(
                requesterId,
                payerId,
                amount,
                description,
                serverId || undefined
            );

            // Send notifications
            await this.notificationService.sendPaymentNotification(
                payerId,
                'payment_request' as any,
                {
                    amount,
                    description,
                    requesterName: interaction.user.username,
                    transactionId: paymentRequest.id
                }
            );

            // Show success message
            const embed = this.displayHandler.createRequestCreatedEmbed(paymentRequest, from, amount, description);
            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error handling request command:', error);
            await interaction.reply({
                content: '❌ Failed to create payment request. Please try again.',
                ephemeral: true
            });
        }
    }

    /**
     * Handle payment request response
     */
    public async handlePaymentRequestResponse(interaction: ButtonInteraction): Promise<void> {
        await this.interactionHandler.handlePaymentRequestResponse(
            interaction,
            this.paymentRequestService
        );
    }

    // Getter methods for individual handlers
    public getDisplayHandler(): RequestDisplayHandler {
        return this.displayHandler;
    }

    public getInteractionHandler(): RequestInteractionHandler {
        return this.interactionHandler;
    }

    public getValidationHandler(): RequestValidationHandler {
        return this.validationHandler;
    }
}
