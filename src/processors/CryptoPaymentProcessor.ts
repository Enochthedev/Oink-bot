import { BasePaymentProcessor, PaymentMethodDetails, WithdrawalResult, DepositResult, ProcessingTimeEstimate, FeeCalculation } from './PaymentProcessor';
import { PaymentProcessorError, ErrorSeverity } from '../utils/ErrorHandler';
import { paymentRecoveryManager, PaymentRecoveryContext } from '../utils/PaymentRecovery';
import { logger } from '../utils/Logger';

// Supported cryptocurrency types
export type CryptocurrencyType = 'bitcoin' | 'ethereum' | 'litecoin' | 'dogecoin';

// Cryptocurrency account details interface
export interface CryptoAccountDetails extends PaymentMethodDetails {
  type: 'CRYPTO';
  accountInfo: {
    cryptoType: CryptocurrencyType;
    walletAddress: string;
    publicKey?: string;
  };
}

// Blockchain API interfaces for external service integration
export interface BlockchainAPI {
  validateAddress(address: string, cryptoType: CryptocurrencyType): Promise<boolean>;
  getBalance(address: string, cryptoType: CryptocurrencyType): Promise<number>;
  sendTransaction(fromAddress: string, toAddress: string, amount: number, cryptoType: CryptocurrencyType): Promise<string>;
  getTransactionStatus(txId: string, cryptoType: CryptocurrencyType): Promise<TransactionStatus>;
  estimateTransactionFee(amount: number, cryptoType: CryptocurrencyType): Promise<number>;
}

export interface TransactionStatus {
  confirmed: boolean;
  confirmations: number;
  blockHeight?: number;
}

// Mock blockchain API for testing and development
export class MockBlockchainAPI implements BlockchainAPI {
  async validateAddress(address: string, cryptoType: CryptocurrencyType): Promise<boolean> {
    // Basic format validation for different crypto types
    const patterns: Record<CryptocurrencyType, RegExp> = {
      bitcoin: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
      ethereum: /^0x[a-fA-F0-9]{40}$/,
      litecoin: /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$|^ltc1[a-z0-9]{39,59}$/,
      dogecoin: /^D{1}[5-9A-HJ-NP-U]{1}[1-9A-HJ-NP-Za-km-z]{32}$/
    };

    return patterns[cryptoType]?.test(address) ?? false;
  }

  async getBalance(_address: string, _cryptoType: CryptocurrencyType): Promise<number> {
    // Mock balance - in real implementation, this would query blockchain
    await this.simulateNetworkDelay();
    return Math.random() * 10; // Random balance for testing
  }

  async sendTransaction(fromAddress: string, toAddress: string, amount: number, cryptoType: CryptocurrencyType): Promise<string> {
    await this.simulateNetworkDelay();
    // Generate mock transaction ID
    return `${cryptoType}_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getTransactionStatus(_txId: string, _cryptoType: CryptocurrencyType): Promise<TransactionStatus> {
    await this.simulateNetworkDelay();
    // Mock transaction status
    return {
      confirmed: Math.random() > 0.3, // 70% chance of being confirmed
      confirmations: Math.floor(Math.random() * 10),
      blockHeight: Math.floor(Math.random() * 1000000)
    };
  }

  async estimateTransactionFee(amount: number, cryptoType: CryptocurrencyType): Promise<number> {
    await this.simulateNetworkDelay();
    // Mock fee estimation based on crypto type
    const baseFees: Record<CryptocurrencyType, number> = {
      bitcoin: 0.0001,
      ethereum: 0.002,
      litecoin: 0.0001,
      dogecoin: 1.0
    };

    return baseFees[cryptoType] * (1 + Math.random() * 0.5); // Add some variance
  }

  private async simulateNetworkDelay(): Promise<void> {
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
  }
}

// Cryptocurrency payment processor implementation
export class CryptoPaymentProcessor extends BasePaymentProcessor {
  private readonly blockchainAPI: BlockchainAPI;
  private readonly supportedCryptos: CryptocurrencyType[] = ['bitcoin', 'ethereum', 'litecoin', 'dogecoin'];

  constructor(blockchainAPI?: BlockchainAPI) {
    super('CRYPTO');
    this.blockchainAPI = blockchainAPI || new MockBlockchainAPI();
  }

  async validatePaymentMethod(accountDetails: PaymentMethodDetails): Promise<boolean> {
    if (!this.validateAccountDetails(accountDetails)) {
      return false;
    }

    const cryptoDetails = accountDetails as CryptoAccountDetails;

    // Validate crypto type is supported
    if (!this.isSupportedCryptocurrency(cryptoDetails.accountInfo.cryptoType)) {
      return false;
    }

    // Validate wallet address format with recovery
    const context: PaymentRecoveryContext = {
      transactionId: 'validation',
      processorType: 'crypto',
      operation: 'validate',
      attempt: 1,
      originalError: new Error('Validation operation'),
    };

    try {
      return await paymentRecoveryManager.executeWithRecovery(
        () => this.blockchainAPI.validateAddress(
          cryptoDetails.accountInfo.walletAddress,
          cryptoDetails.accountInfo.cryptoType
        ),
        context
      );
    } catch (error) {
      logger.logPaymentProcessor(
        'error' as any,
        'Error validating crypto address',
        'crypto',
        {
          walletAddress: cryptoDetails.accountInfo.walletAddress,
          cryptoType: cryptoDetails.accountInfo.cryptoType,
        },
        error instanceof Error ? error : new Error('Unknown error')
      );
      return false;
    }
  }

  async withdrawFunds(accountDetails: PaymentMethodDetails, amount: number): Promise<WithdrawalResult> {
    if (!this.validateAmount(amount)) {
      throw new PaymentProcessorError(
        'Invalid amount for withdrawal',
        'INVALID_AMOUNT',
        ErrorSeverity.LOW,
        'crypto',
        'Please enter a valid amount.',
        { amount }
      );
    }

    if (!await this.validatePaymentMethod(accountDetails)) {
      throw new PaymentProcessorError(
        'Invalid payment method details',
        'INVALID_PAYMENT_METHOD',
        ErrorSeverity.LOW,
        'crypto',
        'Please check your wallet details.',
        { accountDetails }
      );
    }

    const cryptoDetails = accountDetails as CryptoAccountDetails;
    const transactionId = `crypto_withdraw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const context: PaymentRecoveryContext = {
      transactionId,
      processorType: 'crypto',
      operation: 'withdraw',
      amount,
      attempt: 1,
      originalError: new Error('Withdrawal operation'),
    };

    try {
      return await paymentRecoveryManager.executeWithRecovery(async () => {
        // Note: In non-custodial system, balance checks are handled by the user's wallet
        // The user will sign the transaction only if they have sufficient funds

        // Initiate withdrawal transaction
        const txId = await this.blockchainAPI.sendTransaction(
          cryptoDetails.accountInfo.walletAddress,
          'escrow_wallet_address', // In real implementation, this would be the escrow wallet
          amount,
          cryptoDetails.accountInfo.cryptoType
        );

        logger.logTransaction(
          'info' as any,
          'Crypto withdrawal initiated',
          transactionId,
          undefined,
          {
            cryptoType: cryptoDetails.accountInfo.cryptoType,
            amount,
            blockchainTxId: txId,
          }
        );

        return {
          success: true,
          transactionId: txId,
        };
      }, context);
    } catch (error) {
      if (error instanceof PaymentProcessorError) {
        throw error;
      }

      logger.logPaymentProcessor(
        'error' as any,
        'Error withdrawing crypto funds',
        'crypto',
        {
          transactionId,
          amount,
          cryptoType: cryptoDetails.accountInfo.cryptoType,
        },
        error instanceof Error ? error : new Error('Unknown error')
      );

      throw new PaymentProcessorError(
        `Crypto withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'WITHDRAWAL_FAILED',
        ErrorSeverity.HIGH,
        'crypto',
        'Withdrawal failed. Please try again later.',
        { transactionId, amount, error: error instanceof Error ? error.message : 'Unknown' }
      );
    }
  }

  async depositFunds(accountDetails: PaymentMethodDetails, amount: number): Promise<DepositResult> {
    if (!this.validateAmount(amount)) {
      return this.createErrorResult('Invalid amount');
    }

    if (!await this.validatePaymentMethod(accountDetails)) {
      return this.createErrorResult('Invalid payment method details');
    }

    const cryptoDetails = accountDetails as CryptoAccountDetails;

    try {
      // Initiate deposit transaction from escrow to user wallet
      const transactionId = await this.blockchainAPI.sendTransaction(
        'escrow_wallet_address', // In real implementation, this would be the escrow wallet
        cryptoDetails.accountInfo.walletAddress,
        amount,
        cryptoDetails.accountInfo.cryptoType
      );

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
              console.error('❌ Oink... error depositing crypto funds:', error);
      return this.createErrorResult(`Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getProcessingTime(): Promise<ProcessingTimeEstimate> {
    // Cryptocurrency processing times vary by network congestion
    // These are typical confirmation times
    return {
      minMinutes: 10,  // Fast confirmation
      maxMinutes: 60,  // During network congestion
    };
  }

  async calculateFees(amount: number): Promise<FeeCalculation> {
    if (!this.validateAmount(amount)) {
      throw new Error('Invalid amount for fee calculation');
    }

    // Base processing fee for crypto transactions
    const processingFee = 0.25; // $0.25 base fee

    // Percentage fee (lower than traditional payment methods)
    const percentageRate = 0.015; // 1.5%
    const percentageFee = amount * percentageRate;

    return {
      processingFee,
      percentage: percentageFee,
      total: processingFee + percentageFee,
    };
  }

  // Helper methods
  private isSupportedCryptocurrency(cryptoType: string): cryptoType is CryptocurrencyType {
    return this.supportedCryptos.includes(cryptoType as CryptocurrencyType);
  }

  public getSupportedCryptocurrencies(): CryptocurrencyType[] {
    return [...this.supportedCryptos];
  }

  // Method to get transaction status (useful for monitoring)
  async getTransactionStatus(transactionId: string, cryptoType: CryptocurrencyType): Promise<TransactionStatus> {
    try {
      return await this.blockchainAPI.getTransactionStatus(transactionId, cryptoType);
    } catch (error) {
              console.error('❌ Oink... error getting transaction status:', error);
      throw new Error(`Failed to get transaction status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Method to estimate network fees before transaction
  async estimateNetworkFee(amount: number, cryptoType: CryptocurrencyType): Promise<number> {
    try {
      return await this.blockchainAPI.estimateTransactionFee(amount, cryptoType);
    } catch (error) {
              console.error('❌ Oink... error estimating network fee:', error);
      throw new Error(`Failed to estimate network fee: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}