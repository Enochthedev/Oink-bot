// Core PaymentCommandHandler that orchestrates payment flows
import {
  ChatInputCommandInteraction
} from 'discord.js';
import { BaseCommandHandler } from '../CommandHandler';
import { PaymentService, PaymentServiceImpl } from '../../services/PaymentService';
import { UserAccountService, UserAccountServiceImpl } from '../../services/UserAccountService';
import { InputValidator } from '../../utils/InputValidator';
import { rateLimiters } from '../../utils/RateLimiter';
import { auditLogger, logPaymentInitiated } from '../../utils/AuditLogger';
import { errorHandler, ValidationError, RateLimitError } from '../../utils/ErrorHandler';
import { PaymentFlowOrchestrator } from './PaymentFlowOrchestrator';

export class PaymentCommandHandler extends BaseCommandHandler {
  private paymentService: PaymentService;
  private userAccountService: UserAccountService;
  private paymentFlowOrchestrator: PaymentFlowOrchestrator;

  constructor(
    paymentService?: PaymentService,
    userAccountService?: UserAccountService
  ) {
    super();
    this.paymentService = paymentService || new PaymentServiceImpl();
    this.userAccountService = userAccountService || new UserAccountServiceImpl();
    this.paymentFlowOrchestrator = new PaymentFlowOrchestrator(
      this.paymentService,
      this.userAccountService
    );
  }

  public getCommandName(): string {
    return 'pay';
  }

  public validateParameters(interaction: ChatInputCommandInteraction): boolean {
    if (!super.validateParameters(interaction)) {
      return false;
    }

    const recipient = interaction.options.getUser('recipient');
    const amount = interaction.options.getNumber('amount');
    const description = interaction.options.getString('description') || '';

    // Validate recipient exists and is not the sender
    if (!recipient || recipient.id === interaction.user.id) {
      return false;
    }

    // Validate recipient Discord ID format
    const recipientIdValidation = InputValidator.validateDiscordId(recipient.id);
    if (!recipientIdValidation.isValid) {
      return false;
    }

    // Validate sender Discord ID format
    const senderIdValidation = InputValidator.validateDiscordId(interaction.user.id);
    if (!senderIdValidation.isValid) {
      return false;
    }

    // Validate amount
    const amountValidation = InputValidator.validateAmount(amount || 0);
    if (!amountValidation.isValid) {
      return false;
    }

    // Validate description if provided
    if (description) {
      const descValidation = InputValidator.validateDescription(description);
      if (!descValidation.isValid) {
        return false;
      }
    }

    return true;
  }

  public async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await this.deferReply(interaction, true); // Ephemeral for privacy

      // Rate limiting check
      await rateLimiters.checkPaymentLimit(interaction.user.id);

      const recipient = interaction.options.getUser('recipient')!;
      const rawAmount = interaction.options.getNumber('amount')!;
      const rawDescription = interaction.options.getString('description') || '';

      // Validate and sanitize all inputs
      const validationResult = InputValidator.validateCommandParams({
        userId: interaction.user.id,
        recipientId: recipient.id,
        amount: rawAmount,
        description: rawDescription
      });

      if (!validationResult.isValid) {
        throw new ValidationError(
          'Invalid command parameters',
          'INVALID_PARAMS',
          validationResult.errors.join(', ') || 'Please check your input and try again'
        );
      }

      const { amount, description } = validationResult.sanitizedValue!;

      // Check if sender has payment methods
      const senderAccount = await this.userAccountService.getAccount(interaction.user.id);
      if (!senderAccount || senderAccount.paymentMethods.length === 0) {
        await this.paymentFlowOrchestrator.handleNoPaymentMethods(interaction);
        return;
      }

      // Check payment limits
      const canPay = await this.paymentService.validatePaymentLimits(
        interaction.user.id,
        amount,
        interaction.guildId || 'unknown'
      );

      if (!canPay) {
        await this.paymentFlowOrchestrator.handlePaymentLimitExceeded(interaction, amount);
        return;
      }

      // Log payment initiation
      await logPaymentInitiated(interaction.user.id, recipient.id, amount, description);

      // Delegate to payment flow orchestrator
      await this.paymentFlowOrchestrator.initiatePaymentFlow(
        interaction,
        recipient,
        amount,
        description
      );

    } catch (error) {
      if (error instanceof RateLimitError) {
        await this.paymentFlowOrchestrator.handleRateLimitExceeded(interaction);
      } else {
        await this.paymentFlowOrchestrator.handlePaymentError(interaction, error as Error);
      }
    }
  }
}
