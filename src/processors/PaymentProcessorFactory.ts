// Payment processor factory interface and implementation
import { PaymentProcessor } from './PaymentProcessor';
import { PaymentMethodType } from '../models/UserAccount';
import { CryptoPaymentProcessor } from './CryptoPaymentProcessor';
import { ACHPaymentProcessor } from './ACHPaymentProcessor';

export interface PaymentProcessorFactory {
  createProcessor(type: PaymentMethodType): PaymentProcessor;
  getSupportedMethods(): PaymentMethodType[];
}

// Concrete factory implementation
export class DefaultPaymentProcessorFactory implements PaymentProcessorFactory {
  private readonly supportedMethods: PaymentMethodType[] = ['CRYPTO', 'ACH', 'OTHER'];

  createProcessor(type: PaymentMethodType): PaymentProcessor {
    switch (type) {
      case 'CRYPTO':
        return new CryptoPaymentProcessor();

      case 'ACH':
        return new ACHPaymentProcessor();

      case 'OTHER':
        // For now, return mock processor for 'other' type
        return new MockPaymentProcessor('OTHER');

      default:
        throw new Error(`Unsupported payment method type: ${type}`);
    }
  }

  getSupportedMethods(): PaymentMethodType[] {
    return [...this.supportedMethods];
  }
}

// Mock payment processor for testing
export class MockPaymentProcessor implements PaymentProcessor {
  private readonly processorType: string;

  constructor(processorType: string = 'mock') {
    this.processorType = processorType;
  }

  async validatePaymentMethod(): Promise<boolean> {
    // Mock always validates successfully
    return true;
  }

  async withdrawFunds(accountDetails: any, amount: number): Promise<any> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      success: true,
      transactionId: `mock_withdrawal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  async depositFunds(accountDetails: any, amount: number): Promise<any> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      success: true,
      transactionId: `mock_deposit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  async getProcessingTime(): Promise<any> {
    return {
      minMinutes: 1,
      maxMinutes: 5,
    };
  }

  async calculateFees(amount: number): Promise<any> {
    const processingFee = 0.50; // Fixed $0.50 fee
    const percentage = 0.029; // 2.9% fee
    const percentageFee = amount * percentage;

    return {
      processingFee,
      percentage: percentageFee,
      total: processingFee + percentageFee,
    };
  }
}