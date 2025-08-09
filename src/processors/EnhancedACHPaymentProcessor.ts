import { BasePaymentProcessor, PaymentMethodDetails, WithdrawalResult, DepositResult, ProcessingTimeEstimate, FeeCalculation } from './PaymentProcessor';
import { PaymentProcessorError, ErrorSeverity } from '../utils/ErrorHandler';
import { paymentRecoveryManager, PaymentRecoveryContext } from '../utils/PaymentRecovery';
import { logger } from '../utils/Logger';

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

    async initiateACHDebit(accountDetails: ACHAccountDetails, amount: number): Promise<string> {
        await this.simulateNetworkDelay();

        // Generate mock transaction ID
        return `ACH_DEBIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async initiateACHCredit(accountDetails: ACHAccountDetails, amount: number): Promise<string> {
        await this.simulateNetworkDelay();

        // Generate mock transaction ID
        return `ACH_CREDIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async getTransactionStatus(transactionId: string): Promise<ACHTransactionStatus> {
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

// Enhanced ACH payment processor implementation with comprehensive error handling
export class EnhancedACHPaymentProcessor extends BasePaymentProcessor {
    private readonly bankingAPI: BankingAPI;
    private readonly supportedAccountTypes: ACHAccountType[] = ['checking', 'savings'];

    // ACH transaction limits (in USD)
    private readonly dailyLimit = 25000;
    private readonly transactionLimit = 10000;

    constructor(bankingAPI?: BankingAPI) {
        super('ach');
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

        const context: PaymentRecoveryContext = {
            transactionId: 'validation',
            processorType: 'ach',
            operation: 'validate',
            attempt: 1,
            originalError: new Error('Validation operation'),
        };

        try {
            return await paymentRecoveryManager.executeWithRecovery(async () => {
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
            }, context);
        } catch (error) {
            logger.logPaymentProcessor(
                'error' as any,
                'Error validating ACH payment method',
                'ach',
                {
                    routingNumber: accountInfo.routingNumber,
                    bankName: accountInfo.bankName,
                },
                error instanceof Error ? error : new Error('Unknown error')
            );
            return false;
        }
    }

    async withdrawFunds(accountDetails: PaymentMethodDetails, amount: number): Promise<WithdrawalResult> {
        if (!this.validateAmount(amount)) {
            throw new PaymentProcessorError(
                'Invalid amount for ACH withdrawal',
                'INVALID_AMOUNT',
                ErrorSeverity.LOW,
                'ach',
                'Please enter a valid amount.',
                { amount }
            );
        }

        if (!await this.validatePaymentMethod(accountDetails)) {
            throw new PaymentProcessorError(
                'Invalid ACH account details',
                'INVALID_PAYMENT_METHOD',
                ErrorSeverity.LOW,
                'ach',
                'Please check your bank account details.',
                { accountDetails }
            );
        }

        const achDetails = accountDetails as ACHAccountDetails;
        const transactionId = `ach_withdraw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const context: PaymentRecoveryContext = {
            transactionId,
            processorType: 'ach',
            operation: 'withdraw',
            amount,
            attempt: 1,
            originalError: new Error('ACH withdrawal operation'),
        };

        try {
            return await paymentRecoveryManager.executeWithRecovery(async () => {
                // Check transaction limits
                if (amount > this.transactionLimit) {
                    throw new PaymentProcessorError(
                        `Transaction amount exceeds limit`,
                        'AMOUNT_LIMIT_EXCEEDED',
                        ErrorSeverity.MEDIUM,
                        'ach',
                        `Transaction amount exceeds limit of $${this.transactionLimit}`,
                        { amount, limit: this.transactionLimit }
                    );
                }

                // Check compliance requirements
                const complianceResult = await this.bankingAPI.checkComplianceRequirements(achDetails, amount);
                if (!complianceResult.approved) {
                    throw new PaymentProcessorError(
                        'Transaction failed compliance check',
                        'COMPLIANCE_FAILED',
                        ErrorSeverity.HIGH,
                        'ach',
                        'Transaction failed compliance check',
                        { complianceResult }
                    );
                }

                if (complianceResult.requiresAdditionalVerification) {
                    throw new PaymentProcessorError(
                        'Additional verification required',
                        'VERIFICATION_REQUIRED',
                        ErrorSeverity.MEDIUM,
                        'ach',
                        'Additional verification required for this transaction',
                        { complianceResult }
                    );
                }

                // Initiate ACH debit
                const achTransactionId = await this.bankingAPI.initiateACHDebit(achDetails, amount);

                logger.logTransaction(
                    'info' as any,
                    'ACH withdrawal initiated',
                    transactionId,
                    undefined,
                    {
                        amount,
                        bankName: achDetails.accountInfo.bankName,
                        accountType: achDetails.accountInfo.accountType,
                        achTransactionId,
                    }
                );

                return {
                    success: true,
                    transactionId: achTransactionId,
                };
            }, context);
        } catch (error) {
            if (error instanceof PaymentProcessorError) {
                throw error;
            }

            logger.logPaymentProcessor(
                'error' as any,
                'Error withdrawing ACH funds',
                'ach',
                {
                    transactionId,
                    amount,
                    bankName: achDetails.accountInfo.bankName,
                },
                error instanceof Error ? error : new Error('Unknown error')
            );

            throw new PaymentProcessorError(
                `ACH withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'WITHDRAWAL_FAILED',
                ErrorSeverity.HIGH,
                'ach',
                'ACH withdrawal failed. Please try again later.',
                { transactionId, amount, error: error instanceof Error ? error.message : 'Unknown' }
            );
        }
    }

    async depositFunds(accountDetails: PaymentMethodDetails, amount: number): Promise<DepositResult> {
        if (!this.validateAmount(amount)) {
            throw new PaymentProcessorError(
                'Invalid amount for ACH deposit',
                'INVALID_AMOUNT',
                ErrorSeverity.LOW,
                'ach',
                'Please enter a valid amount.',
                { amount }
            );
        }

        if (!await this.validatePaymentMethod(accountDetails)) {
            throw new PaymentProcessorError(
                'Invalid ACH account details',
                'INVALID_PAYMENT_METHOD',
                ErrorSeverity.LOW,
                'ach',
                'Please check your bank account details.',
                { accountDetails }
            );
        }

        const achDetails = accountDetails as ACHAccountDetails;
        const transactionId = `ach_deposit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const context: PaymentRecoveryContext = {
            transactionId,
            processorType: 'ach',
            operation: 'deposit',
            amount,
            attempt: 1,
            originalError: new Error('ACH deposit operation'),
        };

        try {
            return await paymentRecoveryManager.executeWithRecovery(async () => {
                // Check transaction limits
                if (amount > this.transactionLimit) {
                    throw new PaymentProcessorError(
                        `Transaction amount exceeds limit`,
                        'AMOUNT_LIMIT_EXCEEDED',
                        ErrorSeverity.MEDIUM,
                        'ach',
                        `Transaction amount exceeds limit of $${this.transactionLimit}`,
                        { amount, limit: this.transactionLimit }
                    );
                }

                // Check compliance requirements
                const complianceResult = await this.bankingAPI.checkComplianceRequirements(achDetails, amount);
                if (!complianceResult.approved) {
                    throw new PaymentProcessorError(
                        'Transaction failed compliance check',
                        'COMPLIANCE_FAILED',
                        ErrorSeverity.HIGH,
                        'ach',
                        'Transaction failed compliance check',
                        { complianceResult }
                    );
                }

                // Initiate ACH credit
                const achTransactionId = await this.bankingAPI.initiateACHCredit(achDetails, amount);

                logger.logTransaction(
                    'info' as any,
                    'ACH deposit initiated',
                    transactionId,
                    undefined,
                    {
                        amount,
                        bankName: achDetails.accountInfo.bankName,
                        accountType: achDetails.accountInfo.accountType,
                        achTransactionId,
                    }
                );

                return {
                    success: true,
                    transactionId: achTransactionId,
                };
            }, context);
        } catch (error) {
            if (error instanceof PaymentProcessorError) {
                throw error;
            }

            logger.logPaymentProcessor(
                'error' as any,
                'Error depositing ACH funds',
                'ach',
                {
                    transactionId,
                    amount,
                    bankName: achDetails.accountInfo.bankName,
                },
                error instanceof Error ? error : new Error('Unknown error')
            );

            throw new PaymentProcessorError(
                `ACH deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'DEPOSIT_FAILED',
                ErrorSeverity.HIGH,
                'ach',
                'ACH deposit failed. Please try again later.',
                { transactionId, amount, error: error instanceof Error ? error.message : 'Unknown' }
            );
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
            logger.logPaymentProcessor(
                'error' as any,
                'Error getting ACH transaction status',
                'ach',
                { transactionId },
                error instanceof Error ? error : new Error('Unknown error')
            );
            throw new PaymentProcessorError(
                `Failed to get transaction status: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'STATUS_CHECK_FAILED',
                ErrorSeverity.MEDIUM,
                'ach',
                'Unable to check transaction status. Please try again later.',
                { transactionId }
            );
        }
    }

    // Method to get bank information
    async getBankInfo(routingNumber: string): Promise<BankInfo> {
        try {
            return await this.bankingAPI.getBankInfo(routingNumber);
        } catch (error) {
            logger.logPaymentProcessor(
                'error' as any,
                'Error getting bank info',
                'ach',
                { routingNumber },
                error instanceof Error ? error : new Error('Unknown error')
            );
            throw new PaymentProcessorError(
                `Failed to get bank info: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'BANK_INFO_FAILED',
                ErrorSeverity.MEDIUM,
                'ach',
                'Unable to verify bank information. Please check your routing number.',
                { routingNumber }
            );
        }
    }

    // Method to check compliance for a transaction
    async checkCompliance(accountDetails: ACHAccountDetails, amount: number): Promise<ComplianceResult> {
        try {
            return await this.bankingAPI.checkComplianceRequirements(accountDetails, amount);
        } catch (error) {
            logger.logPaymentProcessor(
                'error' as any,
                'Error checking compliance',
                'ach',
                { amount, bankName: accountDetails.accountInfo.bankName },
                error instanceof Error ? error : new Error('Unknown error')
            );
            throw new PaymentProcessorError(
                `Failed to check compliance: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'COMPLIANCE_CHECK_FAILED',
                ErrorSeverity.HIGH,
                'ach',
                'Unable to verify transaction compliance. Please try again later.',
                { amount }
            );
        }
    }
}