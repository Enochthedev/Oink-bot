import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    ACHPaymentProcessor,
    ACHAccountDetails,
    MockBankingAPI,
    BankingAPI,
    ACHAccountType,
    ACHTransactionStatus,
    BankInfo,
    ComplianceResult
} from '../ACHPaymentProcessor';

describe('ACHPaymentProcessor', () => {
    let processor: ACHPaymentProcessor;
    let mockBankingAPI: BankingAPI;

    beforeEach(() => {
        mockBankingAPI = new MockBankingAPI();
        processor = new ACHPaymentProcessor(mockBankingAPI);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create processor with default MockBankingAPI', () => {
            const defaultProcessor = new ACHPaymentProcessor();
            expect(defaultProcessor).toBeInstanceOf(ACHPaymentProcessor);
        });

        it('should create processor with custom BankingAPI', () => {
            const customAPI = new MockBankingAPI();
            const customProcessor = new ACHPaymentProcessor(customAPI);
            expect(customProcessor).toBeInstanceOf(ACHPaymentProcessor);
        });
    });

    describe('getSupportedAccountTypes', () => {
        it('should return all supported account types', () => {
            const supported = processor.getSupportedAccountTypes();
            expect(supported).toEqual(['checking', 'savings']);
        });
    });

    describe('getTransactionLimits', () => {
        it('should return transaction limits', () => {
            const limits = processor.getTransactionLimits();
            expect(limits).toEqual({
                daily: 25000,
                transaction: 10000
            });
        });
    });

    describe('validatePaymentMethod', () => {
        const validACHDetails: ACHAccountDetails = {
            type: 'ach',
            accountInfo: {
                routingNumber: '021000021',
                accountNumber: '1234567890',
                accountType: 'checking',
                bankName: 'JPMorgan Chase Bank',
                accountHolderName: 'John Doe'
            }
        };

        it('should validate valid ACH account details', async () => {
            vi.spyOn(mockBankingAPI, 'validateRoutingNumber').mockResolvedValue(true);
            vi.spyOn(mockBankingAPI, 'validateAccountNumber').mockResolvedValue(true);
            vi.spyOn(mockBankingAPI, 'getBankInfo').mockResolvedValue({
                bankName: 'JPMorgan Chase Bank',
                routingNumber: '021000021',
                isActive: true,
                achParticipant: true
            });

            const result = await processor.validatePaymentMethod(validACHDetails);
            expect(result).toBe(true);
            expect(mockBankingAPI.validateRoutingNumber).toHaveBeenCalledWith('021000021');
            expect(mockBankingAPI.validateAccountNumber).toHaveBeenCalledWith('1234567890', '021000021');
        });

        it('should reject invalid account details structure', async () => {
            const invalidDetails = {
                type: 'ach',
                // Missing accountInfo
            };

            const result = await processor.validatePaymentMethod(invalidDetails as any);
            expect(result).toBe(false);
        });

        it('should reject missing required fields', async () => {
            const incompleteDetails: ACHAccountDetails = {
                type: 'ach',
                accountInfo: {
                    routingNumber: '021000021',
                    accountNumber: '1234567890',
                    accountType: 'checking',
                    bankName: '', // Missing bank name
                    accountHolderName: 'John Doe'
                }
            };

            const result = await processor.validatePaymentMethod(incompleteDetails);
            expect(result).toBe(false);
        });

        it('should reject unsupported account type', async () => {
            const unsupportedDetails: ACHAccountDetails = {
                type: 'ach',
                accountInfo: {
                    routingNumber: '021000021',
                    accountNumber: '1234567890',
                    accountType: 'business' as ACHAccountType,
                    bankName: 'JPMorgan Chase Bank',
                    accountHolderName: 'John Doe'
                }
            };

            const result = await processor.validatePaymentMethod(unsupportedDetails);
            expect(result).toBe(false);
        });

        it('should reject invalid account holder name', async () => {
            const invalidNameDetails: ACHAccountDetails = {
                type: 'ach',
                accountInfo: {
                    routingNumber: '021000021',
                    accountNumber: '1234567890',
                    accountType: 'checking',
                    bankName: 'JPMorgan Chase Bank',
                    accountHolderName: 'A' // Too short
                }
            };

            const result = await processor.validatePaymentMethod(invalidNameDetails);
            expect(result).toBe(false);
        });

        it('should reject invalid routing number', async () => {
            vi.spyOn(mockBankingAPI, 'validateRoutingNumber').mockResolvedValue(false);

            const result = await processor.validatePaymentMethod(validACHDetails);
            expect(result).toBe(false);
        });

        it('should reject invalid account number', async () => {
            vi.spyOn(mockBankingAPI, 'validateRoutingNumber').mockResolvedValue(true);
            vi.spyOn(mockBankingAPI, 'validateAccountNumber').mockResolvedValue(false);

            const result = await processor.validatePaymentMethod(validACHDetails);
            expect(result).toBe(false);
        });

        it('should reject inactive bank', async () => {
            vi.spyOn(mockBankingAPI, 'validateRoutingNumber').mockResolvedValue(true);
            vi.spyOn(mockBankingAPI, 'validateAccountNumber').mockResolvedValue(true);
            vi.spyOn(mockBankingAPI, 'getBankInfo').mockResolvedValue({
                bankName: 'Inactive Bank',
                routingNumber: '021000021',
                isActive: false,
                achParticipant: true
            });

            const result = await processor.validatePaymentMethod(validACHDetails);
            expect(result).toBe(false);
        });

        it('should reject non-ACH participant bank', async () => {
            vi.spyOn(mockBankingAPI, 'validateRoutingNumber').mockResolvedValue(true);
            vi.spyOn(mockBankingAPI, 'validateAccountNumber').mockResolvedValue(true);
            vi.spyOn(mockBankingAPI, 'getBankInfo').mockResolvedValue({
                bankName: 'Non-ACH Bank',
                routingNumber: '021000021',
                isActive: true,
                achParticipant: false
            });

            const result = await processor.validatePaymentMethod(validACHDetails);
            expect(result).toBe(false);
        });

        it('should handle banking API validation errors', async () => {
            vi.spyOn(mockBankingAPI, 'validateRoutingNumber').mockRejectedValue(new Error('Network error'));

            const result = await processor.validatePaymentMethod(validACHDetails);
            expect(result).toBe(false);
        });
    });

    describe('withdrawFunds', () => {
        const validACHDetails: ACHAccountDetails = {
            type: 'ach',
            accountInfo: {
                routingNumber: '021000021',
                accountNumber: '1234567890',
                accountType: 'checking',
                bankName: 'JPMorgan Chase Bank',
                accountHolderName: 'John Doe'
            }
        };

        beforeEach(() => {
            // Setup default mocks for successful validation
            vi.spyOn(mockBankingAPI, 'validateRoutingNumber').mockResolvedValue(true);
            vi.spyOn(mockBankingAPI, 'validateAccountNumber').mockResolvedValue(true);
            vi.spyOn(mockBankingAPI, 'getBankInfo').mockResolvedValue({
                bankName: 'JPMorgan Chase Bank',
                routingNumber: '021000021',
                isActive: true,
                achParticipant: true
            });
        });

        it('should successfully withdraw funds with valid details', async () => {
            const amount = 1000;
            const mockTxId = 'ACH_DEBIT_123456789';

            vi.spyOn(mockBankingAPI, 'checkComplianceRequirements').mockResolvedValue({
                approved: true,
                requiresAdditionalVerification: false,
                riskLevel: 'low'
            });
            vi.spyOn(mockBankingAPI, 'initiateACHDebit').mockResolvedValue(mockTxId);

            const result = await processor.withdrawFunds(validACHDetails, amount);

            expect(result.success).toBe(true);
            expect(result.transactionId).toBe(mockTxId);
            expect(mockBankingAPI.initiateACHDebit).toHaveBeenCalledWith(validACHDetails, amount);
        });

        it('should reject withdrawal exceeding transaction limit', async () => {
            const amount = 15000; // Exceeds $10,000 limit

            const result = await processor.withdrawFunds(validACHDetails, amount);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Transaction amount exceeds limit');
        });

        it('should reject withdrawal with invalid amount', async () => {
            const result = await processor.withdrawFunds(validACHDetails, -100);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid amount');
        });

        it('should reject withdrawal with invalid payment method', async () => {
            const invalidDetails = { type: 'ach' };

            const result = await processor.withdrawFunds(invalidDetails as any, 1000);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid payment method details');
        });

        it('should reject withdrawal failing compliance check', async () => {
            const amount = 1000;

            vi.spyOn(mockBankingAPI, 'checkComplianceRequirements').mockResolvedValue({
                approved: false,
                requiresAdditionalVerification: false,
                riskLevel: 'high'
            });

            const result = await processor.withdrawFunds(validACHDetails, amount);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Transaction failed compliance check');
        });

        it('should reject withdrawal requiring additional verification', async () => {
            const amount = 1000;

            vi.spyOn(mockBankingAPI, 'checkComplianceRequirements').mockResolvedValue({
                approved: true,
                requiresAdditionalVerification: true,
                riskLevel: 'high'
            });

            const result = await processor.withdrawFunds(validACHDetails, amount);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Additional verification required for this transaction');
        });

        it('should handle banking API transaction errors', async () => {
            const amount = 1000;

            vi.spyOn(mockBankingAPI, 'checkComplianceRequirements').mockResolvedValue({
                approved: true,
                requiresAdditionalVerification: false,
                riskLevel: 'low'
            });
            vi.spyOn(mockBankingAPI, 'initiateACHDebit').mockRejectedValue(new Error('Transaction failed'));

            const result = await processor.withdrawFunds(validACHDetails, amount);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Withdrawal failed');
        });
    });

    describe('depositFunds', () => {
        const validACHDetails: ACHAccountDetails = {
            type: 'ach',
            accountInfo: {
                routingNumber: '026009593',
                accountNumber: '9876543210',
                accountType: 'savings',
                bankName: 'Bank of America',
                accountHolderName: 'Jane Smith'
            }
        };

        beforeEach(() => {
            // Setup default mocks for successful validation
            vi.spyOn(mockBankingAPI, 'validateRoutingNumber').mockResolvedValue(true);
            vi.spyOn(mockBankingAPI, 'validateAccountNumber').mockResolvedValue(true);
            vi.spyOn(mockBankingAPI, 'getBankInfo').mockResolvedValue({
                bankName: 'Bank of America',
                routingNumber: '026009593',
                isActive: true,
                achParticipant: true
            });
        });

        it('should successfully deposit funds', async () => {
            const amount = 2500;
            const mockTxId = 'ACH_CREDIT_987654321';

            vi.spyOn(mockBankingAPI, 'checkComplianceRequirements').mockResolvedValue({
                approved: true,
                requiresAdditionalVerification: false,
                riskLevel: 'medium'
            });
            vi.spyOn(mockBankingAPI, 'initiateACHCredit').mockResolvedValue(mockTxId);

            const result = await processor.depositFunds(validACHDetails, amount);

            expect(result.success).toBe(true);
            expect(result.transactionId).toBe(mockTxId);
            expect(mockBankingAPI.initiateACHCredit).toHaveBeenCalledWith(validACHDetails, amount);
        });

        it('should reject deposit exceeding transaction limit', async () => {
            const amount = 12000; // Exceeds $10,000 limit

            const result = await processor.depositFunds(validACHDetails, amount);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Transaction amount exceeds limit');
        });

        it('should reject deposit with invalid amount', async () => {
            const result = await processor.depositFunds(validACHDetails, 0);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid amount');
        });

        it('should reject deposit with invalid payment method', async () => {
            const invalidDetails = { type: 'ach' };

            const result = await processor.depositFunds(invalidDetails as any, 1000);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid payment method details');
        });

        it('should reject deposit failing compliance check', async () => {
            const amount = 1000;

            vi.spyOn(mockBankingAPI, 'checkComplianceRequirements').mockResolvedValue({
                approved: false,
                requiresAdditionalVerification: false,
                riskLevel: 'high'
            });

            const result = await processor.depositFunds(validACHDetails, amount);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Transaction failed compliance check');
        });

        it('should handle banking API transaction errors', async () => {
            const amount = 1000;

            vi.spyOn(mockBankingAPI, 'checkComplianceRequirements').mockResolvedValue({
                approved: true,
                requiresAdditionalVerification: false,
                riskLevel: 'low'
            });
            vi.spyOn(mockBankingAPI, 'initiateACHCredit').mockRejectedValue(new Error('Network timeout'));

            const result = await processor.depositFunds(validACHDetails, amount);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Deposit failed');
        });
    });

    describe('getProcessingTime', () => {
        it('should return expected ACH processing time range', async () => {
            const processingTime = await processor.getProcessingTime();

            expect(processingTime.minMinutes).toBe(1440); // 1 day
            expect(processingTime.maxMinutes).toBe(4320); // 3 days
        });
    });

    describe('calculateFees', () => {
        it('should calculate fees correctly for valid amounts', async () => {
            const amount = 1000;
            const fees = await processor.calculateFees(amount);

            expect(fees.processingFee).toBe(0.50);
            expect(fees.percentage).toBe(8.0); // 0.8% of 1000
            expect(fees.total).toBe(8.50); // 0.50 + 8.0
        });

        it('should calculate fees for small amounts', async () => {
            const amount = 50;
            const fees = await processor.calculateFees(amount);

            expect(fees.processingFee).toBe(0.50);
            expect(fees.percentage).toBe(0.40); // 0.8% of 50
            expect(fees.total).toBe(0.90); // 0.50 + 0.40
        });

        it('should throw error for invalid amounts', async () => {
            await expect(processor.calculateFees(-10)).rejects.toThrow('Invalid amount for fee calculation');
            await expect(processor.calculateFees(0)).rejects.toThrow('Invalid amount for fee calculation');
            await expect(processor.calculateFees(NaN)).rejects.toThrow('Invalid amount for fee calculation');
        });
    });

    describe('getTransactionStatus', () => {
        it('should return transaction status', async () => {
            const mockStatus: ACHTransactionStatus = {
                status: 'completed',
                effectiveDate: new Date()
            };

            vi.spyOn(mockBankingAPI, 'getTransactionStatus').mockResolvedValue(mockStatus);

            const status = await processor.getTransactionStatus('ACH_123');

            expect(status).toEqual(mockStatus);
            expect(mockBankingAPI.getTransactionStatus).toHaveBeenCalledWith('ACH_123');
        });

        it('should handle API errors', async () => {
            vi.spyOn(mockBankingAPI, 'getTransactionStatus').mockRejectedValue(new Error('API error'));

            await expect(processor.getTransactionStatus('ACH_123'))
                .rejects.toThrow('Failed to get transaction status');
        });
    });

    describe('getBankInfo', () => {
        it('should return bank information', async () => {
            const mockBankInfo: BankInfo = {
                bankName: 'JPMorgan Chase Bank',
                routingNumber: '021000021',
                isActive: true,
                achParticipant: true
            };

            vi.spyOn(mockBankingAPI, 'getBankInfo').mockResolvedValue(mockBankInfo);

            const bankInfo = await processor.getBankInfo('021000021');

            expect(bankInfo).toEqual(mockBankInfo);
            expect(mockBankingAPI.getBankInfo).toHaveBeenCalledWith('021000021');
        });

        it('should handle API errors', async () => {
            vi.spyOn(mockBankingAPI, 'getBankInfo').mockRejectedValue(new Error('Bank lookup failed'));

            await expect(processor.getBankInfo('021000021'))
                .rejects.toThrow('Failed to get bank info');
        });
    });

    describe('checkCompliance', () => {
        const validACHDetails: ACHAccountDetails = {
            type: 'ach',
            accountInfo: {
                routingNumber: '021000021',
                accountNumber: '1234567890',
                accountType: 'checking',
                bankName: 'JPMorgan Chase Bank',
                accountHolderName: 'John Doe'
            }
        };

        it('should return compliance result', async () => {
            const mockCompliance: ComplianceResult = {
                approved: true,
                requiresAdditionalVerification: false,
                riskLevel: 'low'
            };

            vi.spyOn(mockBankingAPI, 'checkComplianceRequirements').mockResolvedValue(mockCompliance);

            const compliance = await processor.checkCompliance(validACHDetails, 1000);

            expect(compliance).toEqual(mockCompliance);
            expect(mockBankingAPI.checkComplianceRequirements).toHaveBeenCalledWith(validACHDetails, 1000);
        });

        it('should handle API errors', async () => {
            vi.spyOn(mockBankingAPI, 'checkComplianceRequirements').mockRejectedValue(new Error('Compliance check failed'));

            await expect(processor.checkCompliance(validACHDetails, 1000))
                .rejects.toThrow('Failed to check compliance');
        });
    });
});

describe('MockBankingAPI', () => {
    let mockAPI: MockBankingAPI;

    beforeEach(() => {
        mockAPI = new MockBankingAPI();
    });

    describe('validateRoutingNumber', () => {
        it('should validate known routing numbers', async () => {
            expect(await mockAPI.validateRoutingNumber('021000021')).toBe(true); // Chase
            expect(await mockAPI.validateRoutingNumber('026009593')).toBe(true); // Bank of America
            expect(await mockAPI.validateRoutingNumber('121000248')).toBe(true); // Wells Fargo
        });

        it('should reject invalid format routing numbers', async () => {
            expect(await mockAPI.validateRoutingNumber('12345')).toBe(false); // Too short
            expect(await mockAPI.validateRoutingNumber('1234567890')).toBe(false); // Too long
            expect(await mockAPI.validateRoutingNumber('12345678a')).toBe(false); // Contains letter
        });

        it('should validate routing numbers with valid checksum', async () => {
            // Test with a routing number that has valid checksum but isn't in known list
            expect(await mockAPI.validateRoutingNumber('011401533')).toBe(true); // Valid checksum
        });

        it('should reject routing numbers with invalid checksum', async () => {
            expect(await mockAPI.validateRoutingNumber('123456789')).toBe(false); // Invalid checksum
        });
    });

    describe('validateAccountNumber', () => {
        it('should validate account numbers with correct format', async () => {
            expect(await mockAPI.validateAccountNumber('1234567890', '021000021')).toBe(true);
            expect(await mockAPI.validateAccountNumber('12345678901234567', '021000021')).toBe(true); // Max length
            expect(await mockAPI.validateAccountNumber('1234', '021000021')).toBe(true); // Min length
        });

        it('should reject account numbers with invalid format', async () => {
            expect(await mockAPI.validateAccountNumber('123', '021000021')).toBe(false); // Too short
            expect(await mockAPI.validateAccountNumber('123456789012345678', '021000021')).toBe(false); // Too long
            expect(await mockAPI.validateAccountNumber('123456789a', '021000021')).toBe(false); // Contains letter
        });

        it('should reject account numbers with invalid routing numbers', async () => {
            expect(await mockAPI.validateAccountNumber('1234567890', '999999999')).toBe(false);
        });
    });

    describe('getBankInfo', () => {
        it('should return bank info for known routing numbers', async () => {
            const bankInfo = await mockAPI.getBankInfo('021000021');
            expect(bankInfo.bankName).toBe('JPMorgan Chase Bank');
            expect(bankInfo.routingNumber).toBe('021000021');
            expect(bankInfo.isActive).toBe(true);
            expect(bankInfo.achParticipant).toBe(true);
        });

        it('should return unknown bank for unrecognized routing numbers', async () => {
            const bankInfo = await mockAPI.getBankInfo('999999999');
            expect(bankInfo.bankName).toBe('Unknown Bank');
            expect(bankInfo.routingNumber).toBe('999999999');
        });
    });

    describe('initiateACHDebit', () => {
        it('should return transaction ID for ACH debit', async () => {
            const accountDetails: ACHAccountDetails = {
                type: 'ach',
                accountInfo: {
                    routingNumber: '021000021',
                    accountNumber: '1234567890',
                    accountType: 'checking',
                    bankName: 'JPMorgan Chase Bank',
                    accountHolderName: 'John Doe'
                }
            };

            const txId = await mockAPI.initiateACHDebit(accountDetails, 1000);
            expect(typeof txId).toBe('string');
            expect(txId).toContain('ACH_DEBIT_');
        });
    });

    describe('initiateACHCredit', () => {
        it('should return transaction ID for ACH credit', async () => {
            const accountDetails: ACHAccountDetails = {
                type: 'ach',
                accountInfo: {
                    routingNumber: '021000021',
                    accountNumber: '1234567890',
                    accountType: 'checking',
                    bankName: 'JPMorgan Chase Bank',
                    accountHolderName: 'John Doe'
                }
            };

            const txId = await mockAPI.initiateACHCredit(accountDetails, 1000);
            expect(typeof txId).toBe('string');
            expect(txId).toContain('ACH_CREDIT_');
        });
    });

    describe('getTransactionStatus', () => {
        it('should return transaction status', async () => {
            const status = await mockAPI.getTransactionStatus('ACH_123');

            expect(status).toHaveProperty('status');
            expect(['pending', 'processing', 'completed']).toContain(status.status);
        });
    });

    describe('checkComplianceRequirements', () => {
        const accountDetails: ACHAccountDetails = {
            type: 'ach',
            accountInfo: {
                routingNumber: '021000021',
                accountNumber: '1234567890',
                accountType: 'checking',
                bankName: 'JPMorgan Chase Bank',
                accountHolderName: 'John Doe'
            }
        };

        it('should return low risk for small amounts', async () => {
            const compliance = await mockAPI.checkComplianceRequirements(accountDetails, 500);
            expect(compliance.riskLevel).toBe('low');
            expect(compliance.approved).toBe(true);
            expect(compliance.requiresAdditionalVerification).toBe(false);
        });

        it('should return medium risk for moderate amounts', async () => {
            const compliance = await mockAPI.checkComplianceRequirements(accountDetails, 5000);
            expect(compliance.riskLevel).toBe('medium');
        });

        it('should return high risk for large amounts', async () => {
            const compliance = await mockAPI.checkComplianceRequirements(accountDetails, 15000);
            expect(compliance.riskLevel).toBe('high');
            expect(compliance.requiresAdditionalVerification).toBe(true);
        });

        it('should include restrictions for high risk transactions', async () => {
            const compliance = await mockAPI.checkComplianceRequirements(accountDetails, 15000);
            if (compliance.riskLevel === 'high') {
                expect(compliance.restrictions).toBeDefined();
                expect(compliance.restrictions).toContain('Daily limit: $10,000');
            }
        });
    });
});