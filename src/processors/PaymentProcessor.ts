// Payment processor interface
export interface PaymentProcessor {
  validatePaymentMethod(accountDetails: PaymentMethodDetails): Promise<boolean>;

  withdrawFunds(
    accountDetails: PaymentMethodDetails,
    amount: number
  ): Promise<WithdrawalResult>;

  depositFunds(
    accountDetails: PaymentMethodDetails,
    amount: number
  ): Promise<DepositResult>;

  getProcessingTime(): Promise<ProcessingTimeEstimate>;

  calculateFees(amount: number): Promise<FeeCalculation>;
}

// Abstract base class for payment processors
export abstract class BasePaymentProcessor implements PaymentProcessor {
  protected readonly processorType: string;

  constructor(processorType: string) {
    this.processorType = processorType;
  }

  abstract validatePaymentMethod(accountDetails: PaymentMethodDetails): Promise<boolean>;
  abstract withdrawFunds(accountDetails: PaymentMethodDetails, amount: number): Promise<WithdrawalResult>;
  abstract depositFunds(accountDetails: PaymentMethodDetails, amount: number): Promise<DepositResult>;
  abstract getProcessingTime(): Promise<ProcessingTimeEstimate>;
  abstract calculateFees(amount: number): Promise<FeeCalculation>;

  // Common validation methods
  protected validateAmount(amount: number): boolean {
    return amount > 0 && Number.isFinite(amount);
  }

  protected validateAccountDetails(accountDetails: PaymentMethodDetails): boolean {
    return (
      accountDetails !== null &&
      accountDetails !== undefined &&
      typeof accountDetails.type === 'string' &&
      accountDetails.accountInfo !== null &&
      accountDetails.accountInfo !== undefined &&
      typeof accountDetails.accountInfo === 'object'
    );
  }

  // Common error handling
  protected createErrorResult(error: string): WithdrawalResult | DepositResult {
    return {
      success: false,
      transactionId: '',
      error
    };
  }
}

export interface PaymentMethodDetails {
  type: string;
  accountInfo: Record<string, unknown>;
}

export interface WithdrawalResult {
  success: boolean;
  transactionId: string;
  error?: string;
}

export interface DepositResult {
  success: boolean;
  transactionId: string;
  error?: string;
}

export interface ProcessingTimeEstimate {
  minMinutes: number;
  maxMinutes: number;
}

export interface FeeCalculation {
  processingFee: number;
  percentage: number;
  total: number;
}