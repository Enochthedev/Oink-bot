import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    CryptoPaymentProcessor,
    CryptoAccountDetails,
    MockBlockchainAPI,
    BlockchainAPI,
    CryptocurrencyType,
    TransactionStatus
} from '../CryptoPaymentProcessor';

describe('CryptoPaymentProcessor', () => {
    let processor: CryptoPaymentProcessor;
    let mockBlockchainAPI: BlockchainAPI;

    beforeEach(() => {
        mockBlockchainAPI = new MockBlockchainAPI();
        processor = new CryptoPaymentProcessor(mockBlockchainAPI);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create processor with default MockBlockchainAPI', () => {
            const defaultProcessor = new CryptoPaymentProcessor();
            expect(defaultProcessor).toBeInstanceOf(CryptoPaymentProcessor);
        });

        it('should create processor with custom BlockchainAPI', () => {
            const customAPI = new MockBlockchainAPI();
            const customProcessor = new CryptoPaymentProcessor(customAPI);
            expect(customProcessor).toBeInstanceOf(CryptoPaymentProcessor);
        });
    });

    describe('getSupportedCryptocurrencies', () => {
        it('should return all supported cryptocurrency types', () => {
            const supported = processor.getSupportedCryptocurrencies();
            expect(supported).toEqual(['bitcoin', 'ethereum', 'litecoin', 'dogecoin']);
        });
    });

    describe('validatePaymentMethod', () => {
        it('should validate valid Bitcoin address', async () => {
            const validBitcoinDetails: CryptoAccountDetails = {
                type: 'crypto',
                accountInfo: {
                    cryptoType: 'bitcoin',
                    walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
                }
            };

            vi.spyOn(mockBlockchainAPI, 'validateAddress').mockResolvedValue(true);

            const result = await processor.validatePaymentMethod(validBitcoinDetails);
            expect(result).toBe(true);
            expect(mockBlockchainAPI.validateAddress).toHaveBeenCalledWith(
                '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
                'bitcoin'
            );
        });

        it('should validate valid Ethereum address', async () => {
            const validEthereumDetails: CryptoAccountDetails = {
                type: 'crypto',
                accountInfo: {
                    cryptoType: 'ethereum',
                    walletAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6'
                }
            };

            vi.spyOn(mockBlockchainAPI, 'validateAddress').mockResolvedValue(true);

            const result = await processor.validatePaymentMethod(validEthereumDetails);
            expect(result).toBe(true);
        });

        it('should reject invalid account details structure', async () => {
            const invalidDetails = {
                type: 'crypto',
                // Missing accountInfo
            };

            const result = await processor.validatePaymentMethod(invalidDetails as any);
            expect(result).toBe(false);
        });

        it('should reject unsupported cryptocurrency type', async () => {
            const unsupportedDetails: CryptoAccountDetails = {
                type: 'crypto',
                accountInfo: {
                    cryptoType: 'ripple' as CryptocurrencyType,
                    walletAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'
                }
            };

            const result = await processor.validatePaymentMethod(unsupportedDetails);
            expect(result).toBe(false);
        });

        it('should handle blockchain API validation errors', async () => {
            const validDetails: CryptoAccountDetails = {
                type: 'crypto',
                accountInfo: {
                    cryptoType: 'bitcoin',
                    walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
                }
            };

            vi.spyOn(mockBlockchainAPI, 'validateAddress').mockRejectedValue(new Error('Network error'));

            const result = await processor.validatePaymentMethod(validDetails);
            expect(result).toBe(false);
        });
    });

    describe('withdrawFunds', () => {
        const validCryptoDetails: CryptoAccountDetails = {
            type: 'crypto',
            accountInfo: {
                cryptoType: 'bitcoin',
                walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            }
        };

        it('should successfully withdraw funds with sufficient balance', async () => {
            const amount = 1.0;
            const mockTxId = 'bitcoin_tx_123456789';

            vi.spyOn(mockBlockchainAPI, 'validateAddress').mockResolvedValue(true);
            vi.spyOn(mockBlockchainAPI, 'getBalance').mockResolvedValue(5.0);
            vi.spyOn(mockBlockchainAPI, 'sendTransaction').mockResolvedValue(mockTxId);

            const result = await processor.withdrawFunds(validCryptoDetails, amount);

            expect(result.success).toBe(true);
            expect(result.transactionId).toBe(mockTxId);
            expect(mockBlockchainAPI.sendTransaction).toHaveBeenCalledWith(
                '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
                'escrow_wallet_address',
                amount,
                'bitcoin'
            );
        });



        it('should reject withdrawal with invalid amount', async () => {
            await expect(processor.withdrawFunds(validCryptoDetails, -10)).rejects.toThrow('Invalid amount for withdrawal');
        });

        it('should reject withdrawal with invalid payment method', async () => {
            const invalidDetails = { type: 'crypto' };

            await expect(processor.withdrawFunds(invalidDetails as any, 1.0)).rejects.toThrow('Invalid payment method details');
        });

        it('should handle blockchain transaction errors', async () => {
            const amount = 1.0;

            vi.spyOn(mockBlockchainAPI, 'validateAddress').mockResolvedValue(true);
            vi.spyOn(mockBlockchainAPI, 'sendTransaction').mockRejectedValue(new Error('Transaction failed'));

            await expect(processor.withdrawFunds(validCryptoDetails, amount)).rejects.toThrow('Crypto withdrawal failed: Transaction failed');
        });
    });

    describe('depositFunds', () => {
        const validCryptoDetails: CryptoAccountDetails = {
            type: 'crypto',
            accountInfo: {
                cryptoType: 'ethereum',
                walletAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6'
            }
        };

        it('should successfully deposit funds', async () => {
            const amount = 2.5;
            const mockTxId = 'ethereum_tx_987654321';

            vi.spyOn(mockBlockchainAPI, 'validateAddress').mockResolvedValue(true);
            vi.spyOn(mockBlockchainAPI, 'sendTransaction').mockResolvedValue(mockTxId);

            const result = await processor.depositFunds(validCryptoDetails, amount);

            expect(result.success).toBe(true);
            expect(result.transactionId).toBe(mockTxId);
            expect(mockBlockchainAPI.sendTransaction).toHaveBeenCalledWith(
                'escrow_wallet_address',
                '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
                amount,
                'ethereum'
            );
        });

        it('should reject deposit with invalid amount', async () => {
            const result = await processor.depositFunds(validCryptoDetails, 0);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid amount');
        });

        it('should reject deposit with invalid payment method', async () => {
            const invalidDetails = { type: 'crypto' };

            const result = await processor.depositFunds(invalidDetails as any, 1.0);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid payment method details');
        });

        it('should handle blockchain transaction errors', async () => {
            const amount = 1.0;

            vi.spyOn(mockBlockchainAPI, 'validateAddress').mockResolvedValue(true);
            vi.spyOn(mockBlockchainAPI, 'sendTransaction').mockRejectedValue(new Error('Network timeout'));

            const result = await processor.depositFunds(validCryptoDetails, amount);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Deposit failed');
        });
    });

    describe('getProcessingTime', () => {
        it('should return expected processing time range', async () => {
            const processingTime = await processor.getProcessingTime();

            expect(processingTime.minMinutes).toBe(10);
            expect(processingTime.maxMinutes).toBe(60);
        });
    });

    describe('calculateFees', () => {
        it('should calculate fees correctly for valid amounts', async () => {
            const amount = 100;
            const fees = await processor.calculateFees(amount);

            expect(fees.processingFee).toBe(0.25);
            expect(fees.percentage).toBe(1.5); // 1.5% of 100
            expect(fees.total).toBe(1.75); // 0.25 + 1.5
        });

        it('should calculate fees for small amounts', async () => {
            const amount = 10;
            const fees = await processor.calculateFees(amount);

            expect(fees.processingFee).toBe(0.25);
            expect(fees.percentage).toBe(0.15); // 1.5% of 10
            expect(fees.total).toBe(0.40); // 0.25 + 0.15
        });

        it('should throw error for invalid amounts', async () => {
            await expect(processor.calculateFees(-10)).rejects.toThrow('Invalid amount for fee calculation');
            await expect(processor.calculateFees(0)).rejects.toThrow('Invalid amount for fee calculation');
            await expect(processor.calculateFees(NaN)).rejects.toThrow('Invalid amount for fee calculation');
        });
    });

    describe('getTransactionStatus', () => {
        it('should return transaction status', async () => {
            const mockStatus: TransactionStatus = {
                confirmed: true,
                confirmations: 6,
                blockHeight: 750000
            };

            vi.spyOn(mockBlockchainAPI, 'getTransactionStatus').mockResolvedValue(mockStatus);

            const status = await processor.getTransactionStatus('tx_123', 'bitcoin');

            expect(status).toEqual(mockStatus);
            expect(mockBlockchainAPI.getTransactionStatus).toHaveBeenCalledWith('tx_123', 'bitcoin');
        });

        it('should handle API errors', async () => {
            vi.spyOn(mockBlockchainAPI, 'getTransactionStatus').mockRejectedValue(new Error('API error'));

            await expect(processor.getTransactionStatus('tx_123', 'bitcoin'))
                .rejects.toThrow('Failed to get transaction status');
        });
    });

    describe('estimateNetworkFee', () => {
        it('should return estimated network fee', async () => {
            const mockFee = 0.0005;

            vi.spyOn(mockBlockchainAPI, 'estimateTransactionFee').mockResolvedValue(mockFee);

            const fee = await processor.estimateNetworkFee(1.0, 'bitcoin');

            expect(fee).toBe(mockFee);
            expect(mockBlockchainAPI.estimateTransactionFee).toHaveBeenCalledWith(1.0, 'bitcoin');
        });

        it('should handle API errors', async () => {
            vi.spyOn(mockBlockchainAPI, 'estimateTransactionFee').mockRejectedValue(new Error('Fee estimation failed'));

            await expect(processor.estimateNetworkFee(1.0, 'bitcoin'))
                .rejects.toThrow('Failed to estimate network fee');
        });
    });
});

describe('MockBlockchainAPI', () => {
    let mockAPI: MockBlockchainAPI;

    beforeEach(() => {
        mockAPI = new MockBlockchainAPI();
    });

    describe('validateAddress', () => {
        it('should validate Bitcoin addresses correctly', async () => {
            // Valid Bitcoin addresses
            expect(await mockAPI.validateAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'bitcoin')).toBe(true);
            expect(await mockAPI.validateAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'bitcoin')).toBe(true);
            expect(await mockAPI.validateAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'bitcoin')).toBe(true);

            // Invalid Bitcoin addresses
            expect(await mockAPI.validateAddress('invalid_address', 'bitcoin')).toBe(false);
            expect(await mockAPI.validateAddress('', 'bitcoin')).toBe(false);
        });

        it('should validate Ethereum addresses correctly', async () => {
            // Valid Ethereum addresses
            expect(await mockAPI.validateAddress('0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6', 'ethereum')).toBe(true);
            expect(await mockAPI.validateAddress('0x0000000000000000000000000000000000000000', 'ethereum')).toBe(true);

            // Invalid Ethereum addresses
            expect(await mockAPI.validateAddress('742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6', 'ethereum')).toBe(false);
            expect(await mockAPI.validateAddress('0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b', 'ethereum')).toBe(false);
        });

        it('should validate Litecoin addresses correctly', async () => {
            // Valid Litecoin addresses
            expect(await mockAPI.validateAddress('LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL', 'litecoin')).toBe(true);
            expect(await mockAPI.validateAddress('MQMcJhpWHYVeQArcZR3sBgyPZxxRtnH441', 'litecoin')).toBe(true);

            // Invalid Litecoin addresses
            expect(await mockAPI.validateAddress('invalid_ltc_address', 'litecoin')).toBe(false);
        });

        it('should validate Dogecoin addresses correctly', async () => {
            // Valid Dogecoin addresses
            expect(await mockAPI.validateAddress('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L', 'dogecoin')).toBe(true);

            // Invalid Dogecoin addresses
            expect(await mockAPI.validateAddress('invalid_doge_address', 'dogecoin')).toBe(false);
        });
    });

    describe('getBalance', () => {
        it('should return a numeric balance', async () => {
            const balance = await mockAPI.getBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'bitcoin');
            expect(typeof balance).toBe('number');
            expect(balance).toBeGreaterThanOrEqual(0);
        });
    });

    describe('sendTransaction', () => {
        it('should return a transaction ID', async () => {
            const txId = await mockAPI.sendTransaction(
                '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
                '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                1.0,
                'bitcoin'
            );

            expect(typeof txId).toBe('string');
            expect(txId).toContain('bitcoin_tx_');
        });
    });

    describe('getTransactionStatus', () => {
        it('should return transaction status', async () => {
            const status = await mockAPI.getTransactionStatus('tx_123', 'bitcoin');

            expect(status).toHaveProperty('confirmed');
            expect(status).toHaveProperty('confirmations');
            expect(typeof status.confirmed).toBe('boolean');
            expect(typeof status.confirmations).toBe('number');
        });
    });

    describe('estimateTransactionFee', () => {
        it('should return estimated fee for different cryptocurrencies', async () => {
            const bitcoinFee = await mockAPI.estimateTransactionFee(1.0, 'bitcoin');
            const ethereumFee = await mockAPI.estimateTransactionFee(1.0, 'ethereum');
            const litecoinFee = await mockAPI.estimateTransactionFee(1.0, 'litecoin');
            const dogecoinFee = await mockAPI.estimateTransactionFee(1.0, 'dogecoin');

            expect(typeof bitcoinFee).toBe('number');
            expect(typeof ethereumFee).toBe('number');
            expect(typeof litecoinFee).toBe('number');
            expect(typeof dogecoinFee).toBe('number');

            expect(bitcoinFee).toBeGreaterThan(0);
            expect(ethereumFee).toBeGreaterThan(0);
            expect(litecoinFee).toBeGreaterThan(0);
            expect(dogecoinFee).toBeGreaterThan(0);
        });
    });
});