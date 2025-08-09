// PaymentFlowOrchestrator manages the overall payment flow
import {
  ChatInputCommandInteraction,
  User
} from 'discord.js';
import { PaymentService } from '../../services/PaymentService';
import { UserAccountService } from '../../services/UserAccountService';
import { PaymentMethodSelectionHandler } from './PaymentMethodSelectionHandler';
import { PaymentConfirmationHandler } from './PaymentConfirmationHandler';
import { PaymentResultHandler } from './PaymentResultHandler';

export class PaymentFlowOrchestrator {
  private paymentService: PaymentService;
  private userAccountService: UserAccountService;
  private methodSelectionHandler: PaymentMethodSelectionHandler;
  private confirmationHandler: PaymentConfirmationHandler;
  private resultHandler: PaymentResultHandler;

  constructor(paymentService: PaymentService, userAccountService: UserAccountService) {
    this.paymentService = paymentService;
    this.userAccountService = userAccountService;
    this.methodSelectionHandler = new PaymentMethodSelectionHandler(userAccountService);
    this.confirmationHandler = new PaymentConfirmationHandler(paymentService);
    this.resultHandler = new PaymentResultHandler();
  }

  /**
   * Initiates the payment flow
   */
  async initiatePaymentFlow(
    interaction: ChatInputCommandInteraction,
    recipient: User,
    amount: number,
    description: string
  ): Promise<void> {
    await this.methodSelectionHandler.showPaymentMethodSelection(
      interaction,
      recipient,
      amount,
      description
    );
  }

  /**
   * Handles case when user has no payment methods
   */
  async handleNoPaymentMethods(interaction: ChatInputCommandInteraction): Promise<void> {
    await this.methodSelectionHandler.handleNoPaymentMethods(interaction);
  }

  /**
   * Handles case when payment limit is exceeded
   */
  async handlePaymentLimitExceeded(
    interaction: ChatInputCommandInteraction,
    amount: number
  ): Promise<void> {
    await this.resultHandler.handlePaymentLimitExceeded(interaction, amount);
  }

  /**
   * Handles case when rate limit is exceeded
   */
  async handleRateLimitExceeded(interaction: ChatInputCommandInteraction): Promise<void> {
    await this.resultHandler.handleRateLimitExceeded(interaction);
  }

  /**
   * Handles payment errors
   */
  async handlePaymentError(
    interaction: ChatInputCommandInteraction,
    error: Error
  ): Promise<void> {
    await this.resultHandler.handlePaymentError(interaction, error);
  }

  /**
   * Gets the method selection handler
   */
  getMethodSelectionHandler(): PaymentMethodSelectionHandler {
    return this.methodSelectionHandler;
  }

  /**
   * Gets the confirmation handler
   */
  getConfirmationHandler(): PaymentConfirmationHandler {
    return this.confirmationHandler;
  }

  /**
   * Gets the result handler
   */
  getResultHandler(): PaymentResultHandler {
    return this.resultHandler;
  }
}
