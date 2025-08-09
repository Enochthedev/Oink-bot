// PaymentMethodService handles payment method operations
import { PaymentMethodConfig, PaymentMethodType } from '../../models/UserAccount';
import { UserAccountService, UserAccountServiceImpl } from '../UserAccountService';

export interface PaymentMethodService {
  selectPaymentMethod(
    userId: string,
    paymentMethodId: string
  ): Promise<PaymentMethodConfig>;

  validatePaymentMethod(
    type: PaymentMethodType,
    details: any
  ): Promise<boolean>;

  getActivePaymentMethods(userId: string): Promise<PaymentMethodConfig[]>;
}

export class PaymentMethodServiceImpl implements PaymentMethodService {
  private readonly userAccountService: UserAccountService;

  constructor(userAccountService?: UserAccountService) {
    this.userAccountService = userAccountService || new UserAccountServiceImpl();
  }

  async selectPaymentMethod(
    userId: string,
    paymentMethodId: string
  ): Promise<PaymentMethodConfig> {
    if (!userId || !paymentMethodId) {
      throw new Error('User ID and payment method ID are required');
    }

    const userAccount = await this.userAccountService.getAccount(userId);
    if (!userAccount) {
      throw new Error('User account not found');
    }

    const paymentMethod = userAccount.paymentMethods.find(
      pm => pm.id === paymentMethodId && pm.isActive
    );

    if (!paymentMethod) {
      throw new Error('Payment method not found or inactive');
    }

    return paymentMethod;
  }

  async validatePaymentMethod(
    type: PaymentMethodType,
    details: any
  ): Promise<boolean> {
    if (!type || !details) {
      return false;
    }

    try {
      return await this.userAccountService.validatePaymentMethod(type, details);
    } catch (error) {
      console.error('Error validating payment method:', error);
      return false;
    }
  }

  async getActivePaymentMethods(userId: string): Promise<PaymentMethodConfig[]> {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const userAccount = await this.userAccountService.getAccount(userId);
    if (!userAccount) {
      return [];
    }

    return userAccount.paymentMethods.filter(pm => pm.isActive);
  }
}
