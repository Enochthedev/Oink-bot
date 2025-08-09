import { BasePaymentProcessor, PaymentMethodDetails, WithdrawalResult, DepositResult, ProcessingTimeEstimate, FeeCalculation } from './PaymentProcessor';

// ACH account types
export type ACHAccountType = 'checking' | 'savings';

// ACH account details interface
export interface ACHAccountDetails extends PaymentMethodDetails {
  type: 'ACH';
  accountInfo: {
    routingNumber: string;
    accountNumber: string;
    accountType: ACHAccountType;
    bankName: string;
    accountHolderName: string;
  };
}

// Banking API interfaces for external service integration
export interface BankingAPI {
  validateRoutingNumber(routingNumber: string): Promise<boolean>;
  validateAccountNumber(accountNumber: string, routingNumber: string): Promise<boolean>;
  getBankInfo(routingNumber: string): Promise<BankInfo>;
  initiateACHDebit(accountDetails: ACHAccountDetails, amount: number): Promise<string>;
  initiateACHCredit(accountDetails: ACHAccountDetails, amount: number): Promise<string>;
  getTransactionStatus(transactionId: string): Promise<ACHTransactionStatus>;
  checkComplianceRequirements(accountDetails: ACHAccountDetails, amount: number): Promise<ComplianceResult>;
}

export interface BankInfo {
  bankName: string;
  routingNumber: string;
  isActive: boolean;
  achParticipant: boolean;
}

export interface ACHTransactionStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'returned';
  returnCode?: string;
  returnReason?: string;
  effectiveDate?: Date;
}

export interface ComplianceResult {
  approved: boolean;
  requiresAdditionalVerification: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  restrictions?: string[];
}

// Mock banking API for testing and development
export class MockBankingAPI implements BankingAPI {
  private readonly validRoutingNumbers = new Set([
    '021000021', // Chase
    '026009593', // Bank of America
    '121000248', // Wells Fargo
    '111000025', // Federal Reserve Bank
    '122000247', // Wells Fargo (CA)
  ]);

  async validateRoutingNumber(routingNumber: string): Promise<boolean> {
    await this.simulateNetworkDelay();

    // Basic format validation (9 digits)
    if (!/^\d{9}$/.test(routingNumber)) {
      return false;
    }

    // Check against known valid routing numbers or use checksum validation
    return this.validRoutingNumbers.has(routingNumber) || this.validateRoutingNumberChecksum(routingNumber);
  }

  async validateAccountNumber(accountNumber: string, routingNumber: string): Promise<boolean> {
    await this.simulateNetworkDelay();

    // Basic validation - account number should be 4-17 digits
    if (!/^\d{4,17}$/.test(accountNumber)) {
      return false;
    }

    // Mock validation - in real implementation, this would verify with the bank
    return await this.validateRoutingNumber(routingNumber);
  }

  async getBankInfo(routingNumber: string): Promise<BankInfo> {
    await this.simulateNetworkDelay();

    const bankNames: Record<string, string> = {
      '021000021': 'JPMorgan Chase Bank',
      '026009593': 'Bank of America',
      '121000248': 'Wells Fargo Bank',
      '111000025': 'Federal Reserve Bank',
      '122000247': 'Wells Fargo Bank (CA)',
    };

    return {
      bankName: bankNames[routingNumber] || 'Unknown Bank',
      routingNumber,
      isActive: await this.validateRoutingNumber(routingNumber),
      achParticipant: true,
    };
  }

  async initiateACHDebit(_accountDetails: ACHAccountDetails, _amount: number): Promise<string> {
    await this.simulateNetworkDelay();

    // Generate mock transaction ID
    return `ACH_DEBIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async initiateACHCredit(_accountDetails: ACHAccountDetails, _amount: number): Promise<string> {
    await this.simulateNetworkDelay();

    // Generate mock transaction ID
    return `ACH_CREDIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getTransactionStatus(_transactionId: string): Promise<ACHTransactionStatus> {
    await this.simulateNetworkDelay();

    // Mock status based on transaction age
    const statuses: ACHTransactionStatus['status'][] = ['pending', 'processing', 'completed'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    return {
      status: randomStatus,
      effectiveDate: randomStatus === 'completed' ? new Date() : undefined,
    };
  }

  async checkComplianceRequirements(accountDetails: ACHAccountDetails, amount: number): Promise<ComplianceResult> {
    await this.simulateNetworkDelay();

    // Mock compliance check
    const riskLevel: ComplianceResult['riskLevel'] = amount > 10000 ? 'high' : amount > 1000 ? 'medium' : 'low';

    return {
      approved: riskLevel !== 'high' || Math.random() > 0.3, // 70% approval for high risk
      requiresAdditionalVerification: riskLevel === 'high',
      riskLevel,
      restrictions: riskLevel === 'high' ? ['Daily limit: $10,000', 'Monthly limit: $50,000'] : undefined,
    };
  }

  private validateRoutingNumberChecksum(routingNumber: string): boolean {
    // ABA routing number checksum validation
    const digits = routingNumber.split('').map(Number);
    const checksum = (
      3 * (digits[0] + digits[3] + digits[6]) +
      7 * (digits[1] + digits[4] + digits[7]) +
      1 * (digits[2] + digits[5] + digits[8])
    ) % 10;

    return checksum === 0;
  }

  private async simulateNetworkDelay(): Promise<void> {
    // Simulate network latency for banking operations
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
  }
}

// ACH payment processor implementation
export class ACHPaymentProcessor extends BasePaymentProcessor {
  private readonly bankingAPI: BankingAPI;
  private readonly supportedAccountTypes: ACHAccountType[] = ['checking', 'savings'];

  // ACH transaction limits (in USD)
  private readonly dailyLimit = 25000;
  private readonly transactionLimit = 10000;

  constructor(bankingAPI?: BankingAPI) {
    super('ACH');
    this.bankingAPI = bankingAPI || new MockBankingAPI();
  }

  async validatePaymentMethod(accountDetails: PaymentMethodDetails): Promise<boolean> {
    if (!this.validateAccountDetails(accountDetails)) {
      return false;
    }

    const achDetails = accountDetails as ACHAccountDetails;
    const accountInfo = achDetails.accountInfo;

    // Validate required fields
    if (!accountInfo.routingNumber || !accountInfo.accountNumber ||
      !accountInfo.accountType || !accountInfo.bankName ||
      !accountInfo.accountHolderName) {
      return false;
    }

    // Validate account type
    if (!this.supportedAccountTypes.includes(accountInfo.accountType)) {
      return false;
    }

    // Validate account holder name (basic check)
    if (accountInfo.accountHolderName.trim().length < 2) {
      return false;
    }

    try {
      // Validate routing number
      const isValidRouting = await this.bankingAPI.validateRoutingNumber(accountInfo.routingNumber);
      if (!isValidRouting) {
        return false;
      }

      // Validate account number
      const isValidAccount = await this.bankingAPI.validateAccountNumber(
        accountInfo.accountNumber,
        accountInfo.routingNumber
      );
      if (!isValidAccount) {
        return false;
      }

      // Get bank info to ensure it's ACH participant
      const bankInfo = await this.bankingAPI.getBankInfo(accountInfo.routingNumber);
      return bankInfo.isActive && bankInfo.achParticipant;

    } catch (error) {
              console.error('❌ Oink... error validating ACH payment method:', error);
      return false;
    }
  }

  async withdrawFunds(accountDetails: PaymentMethodDetails, amount: number): Promise<WithdrawalResult> {
    if (!this.validateAmount(amount)) {
      return this.createErrorResult('Invalid amount');
    }

    if (!await this.validatePaymentMethod(accountDetails)) {
      return this.createErrorResult('Invalid payment method details');
    }

    const achDetails = accountDetails as ACHAccountDetails;

    try {
      // Check transaction limits
      if (amount > this.transactionLimit) {
        return this.createErrorResult(`Transaction amount exceeds limit of $${this.transactionLimit}`);
      }

      // Check compliance requirements
      const complianceResult = await this.bankingAPI.checkComplianceRequirements(achDetails, amount);
      if (!complianceResult.approved) {
        return this.createErrorResult('Transaction failed compliance check');
      }

      if (complianceResult.requiresAdditionalVerification) {
        return this.createErrorResult('Additional verification required for this transaction');
      }

      // Initiate ACH debit
      const transactionId = await this.bankingAPI.initiateACHDebit(achDetails, amount);

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
              console.error('❌ Oink... error withdrawing ACH funds:', error);
      return this.createErrorResult(`Withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async depositFunds(accountDetails: PaymentMethodDetails, amount: number): Promise<DepositResult> {
    if (!this.validateAmount(amount)) {
      return this.createErrorResult('Invalid amount');
    }

    if (!await this.validatePaymentMethod(accountDetails)) {
      return this.createErrorResult('Invalid payment method details');
    }

    const achDetails = accountDetails as ACHAccountDetails;

    try {
      // Check transaction limits
      if (amount > this.transactionLimit) {
        return this.createErrorResult(`Transaction amount exceeds limit of $${this.transactionLimit}`);
      }

      // Check compliance requirements
      const complianceResult = await this.bankingAPI.checkComplianceRequirements(achDetails, amount);
      if (!complianceResult.approved) {
        return this.createErrorResult('Transaction failed compliance check');
      }

      // Initiate ACH credit
      const transactionId = await this.bankingAPI.initiateACHCredit(achDetails, amount);

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
              console.error('❌ Oink... error depositing ACH funds:', error);
      return this.createErrorResult(`Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getProcessingTime(): Promise<ProcessingTimeEstimate> {
    // ACH transactions typically take 1-3 business days
    return {
      minMinutes: 1440,  // 1 day
      maxMinutes: 4320,  // 3 days
    };
  }

  async calculateFees(amount: number): Promise<FeeCalculation> {
    if (!this.validateAmount(amount)) {
      throw new Error('Invalid amount for fee calculation');
    }

    // ACH processing fees
    const processingFee = 0.50; // $0.50 base fee

    // Percentage fee (typically lower than card payments)
    const percentageRate = 0.008; // 0.8%
    const percentageFee = amount * percentageRate;

    return {
      processingFee,
      percentage: percentageFee,
      total: processingFee + percentageFee,
    };
  }

  // Helper methods
  public getSupportedAccountTypes(): ACHAccountType[] {
    return [...this.supportedAccountTypes];
  }

  public getTransactionLimits(): { daily: number; transaction: number } {
    return {
      daily: this.dailyLimit,
      transaction: this.transactionLimit,
    };
  }

  // Method to get transaction status
  async getTransactionStatus(transactionId: string): Promise<ACHTransactionStatus> {
    try {
      return await this.bankingAPI.getTransactionStatus(transactionId);
    } catch (error) {
              console.error('❌ Oink... error getting ACH transaction status:', error);
      throw new Error(`Failed to get transaction status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Method to get bank information
  async getBankInfo(routingNumber: string): Promise<BankInfo> {
    try {
      return await this.bankingAPI.getBankInfo(routingNumber);
    } catch (error) {
              console.error('❌ Oink... error getting bank info:', error);
      throw new Error(`Failed to get bank info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Method to check compliance for a transaction
  async checkCompliance(accountDetails: ACHAccountDetails, amount: number): Promise<ComplianceResult> {
    try {
      return await this.bankingAPI.checkComplianceRequirements(accountDetails, amount);
    } catch (error) {
              console.error('❌ Oink... error checking compliance:', error);
      throw new Error(`Failed to check compliance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}