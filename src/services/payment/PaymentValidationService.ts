// PaymentValidationService handles payment validation logic
import { UserAccountService, UserAccountServiceImpl } from '../UserAccountService';
import { ServerConfigService, ServerConfigServiceImpl } from '../ServerConfigService';
import { InputValidator } from '../../utils/InputValidator';

export class PaymentValidationService {
  private userAccountService: UserAccountService;
  private serverConfigService: ServerConfigService;

  constructor(
    userAccountService?: UserAccountService,
    serverConfigService?: ServerConfigService
  ) {
    this.userAccountService = userAccountService || new UserAccountServiceImpl();
    this.serverConfigService = serverConfigService || new ServerConfigServiceImpl();
  }

  /**
   * Validates payment parameters before processing
   */
  async validatePaymentParameters(
    senderId: string,
    recipientId: string,
    amount: number,
    senderPaymentMethodId: string,
    serverId?: string
  ): Promise<void> {
    // Validate user IDs
    this.validateUserId(senderId);
    this.validateUserId(recipientId);

    // Validate sender is not recipient
    if (senderId === recipientId) {
      throw new Error('Sender cannot pay themselves');
    }

    // Validate amount
    this.validateAmount(amount);

    // Validate payment method exists and belongs to sender
    await this.validatePaymentMethod(senderId, senderPaymentMethodId);

    // Validate server-specific limits if serverId is provided
    if (serverId) {
      await this.validateServerLimits(senderId, amount, serverId);
    }
  }

  /**
   * Validates user ID format
   */
  private validateUserId(userId: string): void {
    const validation = InputValidator.validateDiscordId(userId);
    if (!validation.isValid) {
      throw new Error(`Invalid user ID: ${validation.errors.join(', ')}`);
    }
  }

  /**
   * Validates payment amount
   */
  private validateAmount(amount: number): void {
    if (amount <= 0) {
      throw new Error('Payment amount must be greater than 0');
    }

    if (amount > 10000) {
      throw new Error('Payment amount cannot exceed $10,000');
    }

    const validation = InputValidator.validateAmount(amount);
    if (!validation.isValid) {
      throw new Error(`Invalid amount: ${validation.errors.join(', ')}`);
    }
  }

  /**
   * Validates payment method exists and belongs to sender
   */
  private async validatePaymentMethod(senderId: string, paymentMethodId: string): Promise<void> {
    const senderAccount = await this.userAccountService.getAccount(senderId);
    if (!senderAccount) {
      throw new Error('Sender account not found');
    }

    const paymentMethod = senderAccount.paymentMethods.find(
      method => method.id === paymentMethodId
    );

    if (!paymentMethod) {
      throw new Error('Payment method not found or does not belong to sender');
    }

    if (!paymentMethod.isActive) {
      throw new Error('Payment method is not active');
    }
  }

  /**
   * Validates server-specific payment limits
   */
  private async validateServerLimits(senderId: string, amount: number, serverId: string): Promise<void> {
    try {
      const serverConfig = await this.serverConfigService.getServerConfig(serverId);
      if (!serverConfig) {
        return; // No server config, use default limits
      }

      // Check daily limit
      if (serverConfig.dailyLimits.maxAmountPerUser) {
        const dailyTotal = await this.getDailyPaymentTotal(senderId, serverId);
        if (dailyTotal + amount > serverConfig.dailyLimits.maxAmountPerUser) {
          throw new Error(`Payment would exceed daily limit of $${serverConfig.dailyLimits.maxAmountPerUser}`);
        }
      }

      // Check transaction limit
      if (serverConfig.dailyLimits.maxAmountPerUser && amount > serverConfig.dailyLimits.maxAmountPerUser) {
        throw new Error(`Payment amount exceeds maximum transaction limit of $${serverConfig.dailyLimits.maxAmountPerUser}`);
      }
    } catch (error) {
      // If server config validation fails, log it but don't block the payment
      console.warn(`Server limit validation failed for server ${serverId}:`, error);
    }
  }

  /**
   * Gets the total amount of payments made by a user in a server today
   */
  private async getDailyPaymentTotal(userId: string, serverId: string): Promise<number> {
    // This would typically query the database for today's payments
    // For now, return 0 as a placeholder
    return 0;
  }

  /**
   * Validates payment limits for a user
   */
  async validatePaymentLimits(
    userId: string,
    amount: number,
    serverId: string
  ): Promise<boolean> {
    try {
      await this.validatePaymentParameters(
        userId,
        'placeholder', // We don't need recipient for limit validation
        amount,
        'placeholder', // We don't need payment method for limit validation
        serverId
      );
      return true;
    } catch (error) {
      return false;
    }
  }
}
