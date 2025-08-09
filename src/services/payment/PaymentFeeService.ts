// PaymentFeeService handles fee calculations and payment processor interactions
import { PaymentMethodType } from '../../models/UserAccount';
import { createFeeBreakdown } from '../../models/Transaction';
import { PaymentProcessorFactory, DefaultPaymentProcessorFactory } from '../../processors/PaymentProcessorFactory';

export interface PaymentFeeService {
  calculateTransactionFees(
    amount: number,
    paymentMethodType: PaymentMethodType
  ): Promise<{ 
    processingFee: number; 
    escrowFee: number; 
    total: number 
  }>;

  getEscrowFeePercentage(): number;
}

export class PaymentFeeServiceImpl implements PaymentFeeService {
  private readonly paymentProcessorFactory: PaymentProcessorFactory;
  private readonly escrowFeePercentage = 0.01; // 1% escrow fee

  constructor(paymentProcessorFactory?: PaymentProcessorFactory) {
    this.paymentProcessorFactory = paymentProcessorFactory || new DefaultPaymentProcessorFactory();
  }

  async calculateTransactionFees(
    amount: number,
    paymentMethodType: PaymentMethodType
  ): Promise<{ 
    processingFee: number; 
    escrowFee: number; 
    total: number 
  }> {
    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }

    try {
      // Get payment processor to calculate processing fees
      const processor = this.paymentProcessorFactory.createProcessor(paymentMethodType);
      const processorFees = await processor.calculateFees(amount);

      // Calculate escrow fee
      const escrowFee = Math.round(amount * this.escrowFeePercentage * 100) / 100;

      // Use processing fee from processor
      const processingFee = processorFees.total || 0;

      return createFeeBreakdown(processingFee, escrowFee);
    } catch (error) {
      console.error('Error calculating fees:', error);
      // Fallback to default fees
      const processingFee = 0.50; // Default $0.50 processing fee
      const escrowFee = Math.round(amount * this.escrowFeePercentage * 100) / 100;
      return createFeeBreakdown(processingFee, escrowFee);
    }
  }

  getEscrowFeePercentage(): number {
    return this.escrowFeePercentage;
  }
}
