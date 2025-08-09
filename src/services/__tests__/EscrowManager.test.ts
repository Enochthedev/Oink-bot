// EscrowManager unit tests
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import {
    EscrowManagerImpl,
    EscrowError,
    EscrowTimeoutError,
    EscrowNotFoundError,
    EscrowStatusError
} from '../EscrowManager';
import { EscrowStatus } from '../../models/EscrowRecord';
import { TransactionStatus } from '../../models/Transaction';
import { PaymentMethodType } from '@prisma/client';
import { PaymentProcessorFactory } from '../../processors/PaymentProcessorFactory';
import { PaymentProcessor } from '../../processors/PaymentProcessor';

// Mock Prisma client
const mockPrisma = {
    escrowRecord: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
    },
    transaction: {
        findUnique: vi.fn(),
        update: vi.fn(),
    },
    $transaction: vi.fn(),
};

// Mock payment processor
const mockPaymentProcessor: PaymentProcessor = {
    validatePaymentMethod: vi.fn(),
    withdrawFunds: vi.fn(),
    depositFunds: vi.fn(),
    getProcessingTime: vi.fn(),
    calculateFees: vi.fn(),
};

// Mock payment processor factory
const mockPaymentProcessorFactory: PaymentProcessorFactory = {
    getProcessor: vi.fn().mockReturnValue(mockPaymentProcessor),
    getSupportedMethods: vi.fn(),
};

// Mock database module
vi.mock('../../models/database', () => ({
    getPrismaClient: () => mockPrisma,
    withTransaction: vi.fn((callback) => callback(mockPrisma)),
}));

describe('EscrowManager', () => {
    let escrowManager: EscrowManagerImpl;

    beforeEach(() => {
        vi.clearAllMocks();
        (mockPaymentProcessorFactory.getProcessor as Mock).mockReturnValue(mockPaymentProcessor);
        escrowManager = new EscrowManagerImpl(mockPaymentProcessorFactory, 24);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('holdFunds', () => {
        const mockTransaction = {
            id: 'trans-123',
            senderId: 'user-1',
            recipientId: 'user-2',
            amount: 100,
            currency: 'USD',
            status: TransactionStatus.PENDING,
            senderPaymentMethod: {
                id: 'pm-1',
                type: PaymentMethodType.CRYPTO,
                encryptedDetails: JSON.stringify({ wallet: 'test-wallet' }),
            },
        };

        it('should successfully hold funds in escrow', async () => {
            // Setup mocks
            mockPrisma.escrowRecord.findUnique.mockResolvedValue(null);
            mockPrisma.transaction.findUnique.mockResolvedValue(mockTransaction);
            (mockPaymentProcessor.withdrawFunds as Mock).mockResolvedValue({
                success: true,
                transactionId: 'ext-123',
            });
            mockPrisma.escrowRecord.create.mockResolvedValue({
                id: 'escrow-123',
                transactionId: 'trans-123',
                amount: 100,
                currency: 'USD',
                paymentMethod: PaymentMethodType.CRYPTO,
                externalTransactionId: 'ext-123',
                status: EscrowStatus.HOLDING,
                createdAt: new Date(),
                releaseAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            });

            const result = await escrowManager.holdFunds('trans-123', 100, PaymentMethodType.CRYPTO);

            expect(result.transactionId).toBe('trans-123');
            expect(result.amount).toBe(100);
            expect(result.status).toBe(EscrowStatus.HOLDING);
            expect(mockPaymentProcessor.withdrawFunds).toHaveBeenCalledWith(
                { type: PaymentMethodType.CRYPTO, accountInfo: { wallet: 'test-wallet' } },
                100
            );
            expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
                where: { id: 'trans-123' },
                data: { status: TransactionStatus.ESCROWED },
            });
        });

        it('should throw error for invalid transaction ID', async () => {
            await expect(escrowManager.holdFunds('', 100, PaymentMethodType.CRYPTO))
                .rejects.toThrow('Invalid transaction ID');
        });

        it('should throw error for invalid amount', async () => {
            await expect(escrowManager.holdFunds('trans-123', 0, PaymentMethodType.CRYPTO))
                .rejects.toThrow('Invalid amount for escrow');

            await expect(escrowManager.holdFunds('trans-123', -100, PaymentMethodType.CRYPTO))
                .rejects.toThrow('Invalid amount for escrow');
        });

        it('should throw error if escrow record already exists', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue({
                id: 'existing-escrow',
                transactionId: 'trans-123',
            });

            await expect(escrowManager.holdFunds('trans-123', 100, PaymentMethodType.CRYPTO))
                .rejects.toThrow('Escrow record already exists for transaction trans-123');
        });

        it('should throw error if transaction not found', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue(null);
            mockPrisma.transaction.findUnique.mockResolvedValue(null);

            await expect(escrowManager.holdFunds('trans-123', 100, PaymentMethodType.CRYPTO))
                .rejects.toThrow('Transaction trans-123 not found');
        });

        it('should throw error if transaction not in pending status', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue(null);
            mockPrisma.transaction.findUnique.mockResolvedValue({
                ...mockTransaction,
                status: TransactionStatus.COMPLETED,
            });

            await expect(escrowManager.holdFunds('trans-123', 100, PaymentMethodType.CRYPTO))
                .rejects.toThrow('Transaction trans-123 is not in pending status');
        });

        it('should throw error if withdrawal fails', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue(null);
            mockPrisma.transaction.findUnique.mockResolvedValue(mockTransaction);
            (mockPaymentProcessor.withdrawFunds as Mock).mockResolvedValue({
                success: false,
                error: 'Insufficient funds',
            });

            await expect(escrowManager.holdFunds('trans-123', 100, PaymentMethodType.CRYPTO))
                .rejects.toThrow('Failed to withdraw funds: Insufficient funds');
        });
    });

    describe('releaseFunds', () => {
        const mockEscrowRecord = {
            id: 'escrow-123',
            transactionId: 'trans-123',
            amount: 100,
            currency: 'USD',
            paymentMethod: PaymentMethodType.CRYPTO,
            externalTransactionId: 'ext-123',
            status: EscrowStatus.HOLDING,
            createdAt: new Date(),
            transaction: {
                id: 'trans-123',
                recipientPaymentMethod: {
                    id: 'pm-2',
                    type: PaymentMethodType.ACH,
                    encryptedDetails: JSON.stringify({ account: 'test-account' }),
                },
            },
        };

        it('should successfully release funds to recipient', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue(mockEscrowRecord);
            (mockPaymentProcessor.depositFunds as Mock).mockResolvedValue({
                success: true,
                transactionId: 'deposit-123',
            });

            await escrowManager.releaseFunds('trans-123', PaymentMethodType.ACH);

            expect(mockPaymentProcessor.depositFunds).toHaveBeenCalledWith(
                { type: PaymentMethodType.ACH, accountInfo: { account: 'test-account' } },
                100
            );
            expect(mockPrisma.escrowRecord.update).toHaveBeenCalledWith({
                where: { transactionId: 'trans-123' },
                data: {
                    status: EscrowStatus.RELEASED,
                    releaseAt: expect.any(Date)
                },
            });
            expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
                where: { id: 'trans-123' },
                data: {
                    status: TransactionStatus.COMPLETED,
                    completedAt: expect.any(Date)
                },
            });
        });

        it('should throw error for invalid transaction ID', async () => {
            await expect(escrowManager.releaseFunds('', PaymentMethodType.ACH))
                .rejects.toThrow('Invalid transaction ID');
        });

        it('should throw error if escrow record not found', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue(null);

            await expect(escrowManager.releaseFunds('trans-123', PaymentMethodType.ACH))
                .rejects.toThrow('Escrow record not found for transaction trans-123');
        });

        it('should throw error if escrow not in holding status', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue({
                ...mockEscrowRecord,
                status: EscrowStatus.RELEASED,
            });

            await expect(escrowManager.releaseFunds('trans-123', PaymentMethodType.ACH))
                .rejects.toThrow('Escrow is not in holding status: RELEASED');
        });

        it('should throw error if recipient payment method not found', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue({
                ...mockEscrowRecord,
                transaction: {
                    ...mockEscrowRecord.transaction,
                    recipientPaymentMethod: null,
                },
            });

            await expect(escrowManager.releaseFunds('trans-123', PaymentMethodType.ACH))
                .rejects.toThrow('Recipient payment method not found for transaction trans-123');
        });

        it('should throw error if deposit fails', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue(mockEscrowRecord);
            (mockPaymentProcessor.depositFunds as Mock).mockResolvedValue({
                success: false,
                error: 'Invalid account',
            });

            await expect(escrowManager.releaseFunds('trans-123', PaymentMethodType.ACH))
                .rejects.toThrow('Failed to deposit funds: Invalid account');
        });
    });

    describe('returnFunds', () => {
        const mockEscrowRecord = {
            id: 'escrow-123',
            transactionId: 'trans-123',
            amount: 100,
            currency: 'USD',
            paymentMethod: PaymentMethodType.CRYPTO,
            externalTransactionId: 'ext-123',
            status: EscrowStatus.HOLDING,
            createdAt: new Date(),
            transaction: {
                id: 'trans-123',
                senderPaymentMethod: {
                    id: 'pm-1',
                    type: PaymentMethodType.CRYPTO,
                    encryptedDetails: JSON.stringify({ wallet: 'test-wallet' }),
                },
            },
        };

        it('should successfully return funds to sender', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue(mockEscrowRecord);
            (mockPaymentProcessor.depositFunds as Mock).mockResolvedValue({
                success: true,
                transactionId: 'return-123',
            });

            await escrowManager.returnFunds('trans-123');

            expect(mockPaymentProcessor.depositFunds).toHaveBeenCalledWith(
                { type: PaymentMethodType.CRYPTO, accountInfo: { wallet: 'test-wallet' } },
                100
            );
            expect(mockPrisma.escrowRecord.update).toHaveBeenCalledWith({
                where: { transactionId: 'trans-123' },
                data: {
                    status: EscrowStatus.RETURNED,
                    releaseAt: expect.any(Date)
                },
            });
            expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
                where: { id: 'trans-123' },
                data: {
                    status: TransactionStatus.FAILED,
                    failureReason: 'Funds returned from escrow'
                },
            });
        });

        it('should throw error for invalid transaction ID', async () => {
            await expect(escrowManager.returnFunds(''))
                .rejects.toThrow('Invalid transaction ID');
        });

        it('should throw error if escrow record not found', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue(null);

            await expect(escrowManager.returnFunds('trans-123'))
                .rejects.toThrow('Escrow record not found for transaction trans-123');
        });

        it('should throw error if escrow not in holding status', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue({
                ...mockEscrowRecord,
                status: EscrowStatus.RETURNED,
            });

            await expect(escrowManager.returnFunds('trans-123'))
                .rejects.toThrow('Escrow is not in holding status: RETURNED');
        });

        it('should throw error if return deposit fails', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue(mockEscrowRecord);
            (mockPaymentProcessor.depositFunds as Mock).mockResolvedValue({
                success: false,
                error: 'Network error',
            });

            await expect(escrowManager.returnFunds('trans-123'))
                .rejects.toThrow('Failed to return funds: Network error');
        });
    });

    describe('getEscrowStatus', () => {
        it('should return escrow status', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue({
                id: 'escrow-123',
                transactionId: 'trans-123',
                status: EscrowStatus.HOLDING,
            });

            const status = await escrowManager.getEscrowStatus('trans-123');

            expect(status).toBe(EscrowStatus.HOLDING);
        });

        it('should throw error for invalid transaction ID', async () => {
            await expect(escrowManager.getEscrowStatus(''))
                .rejects.toThrow('Invalid transaction ID');
        });

        it('should throw error if escrow record not found', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue(null);

            await expect(escrowManager.getEscrowStatus('trans-123'))
                .rejects.toThrow('Escrow record not found for transaction trans-123');
        });
    });

    describe('getEscrowRecord', () => {
        it('should return escrow record', async () => {
            const mockDbRecord = {
                id: 'escrow-123',
                transactionId: 'trans-123',
                amount: 100,
                currency: 'USD',
                paymentMethod: PaymentMethodType.CRYPTO,
                externalTransactionId: 'ext-123',
                status: EscrowStatus.HOLDING,
                createdAt: new Date(),
                releaseAt: null,
            };

            mockPrisma.escrowRecord.findUnique.mockResolvedValue(mockDbRecord);

            const record = await escrowManager.getEscrowRecord('trans-123');

            expect(record).toEqual(mockDbRecord);
        });

        it('should return null if escrow record not found', async () => {
            mockPrisma.escrowRecord.findUnique.mockResolvedValue(null);

            const record = await escrowManager.getEscrowRecord('trans-123');

            expect(record).toBeNull();
        });

        it('should throw error for invalid transaction ID', async () => {
            await expect(escrowManager.getEscrowRecord(''))
                .rejects.toThrow('Invalid transaction ID');
        });
    });

    describe('processExpiredEscrows', () => {
        it('should process expired escrows and return funds', async () => {
            const expiredEscrows = [
                {
                    id: 'escrow-1',
                    transactionId: 'trans-1',
                    amount: 100,
                    status: EscrowStatus.HOLDING,
                    releaseAt: new Date(Date.now() - 1000),
                    transaction: { id: 'trans-1' },
                },
                {
                    id: 'escrow-2',
                    transactionId: 'trans-2',
                    amount: 200,
                    status: EscrowStatus.HOLDING,
                    releaseAt: new Date(Date.now() - 2000),
                    transaction: { id: 'trans-2' },
                },
            ];

            mockPrisma.escrowRecord.findMany.mockResolvedValue(expiredEscrows);

            // Mock successful return for first escrow
            mockPrisma.escrowRecord.findUnique
                .mockResolvedValueOnce({
                    ...expiredEscrows[0],
                    transaction: {
                        id: 'trans-1',
                        senderPaymentMethod: {
                            type: PaymentMethodType.CRYPTO,
                            encryptedDetails: JSON.stringify({ wallet: 'wallet-1' }),
                        },
                    },
                })
                .mockResolvedValueOnce({
                    ...expiredEscrows[1],
                    transaction: {
                        id: 'trans-2',
                        senderPaymentMethod: {
                            type: PaymentMethodType.ACH,
                            encryptedDetails: JSON.stringify({ account: 'account-2' }),
                        },
                    },
                });

            (mockPaymentProcessor.depositFunds as Mock).mockResolvedValue({
                success: true,
                transactionId: 'return-123',
            });

            await escrowManager.processExpiredEscrows();

            expect(mockPrisma.escrowRecord.findMany).toHaveBeenCalledWith({
                where: {
                    status: EscrowStatus.HOLDING,
                    releaseAt: {
                        lte: expect.any(Date),
                    },
                },
                include: {
                    transaction: true,
                },
            });
        });

        it('should handle errors when returning expired escrow funds', async () => {
            const expiredEscrows = [
                {
                    id: 'escrow-1',
                    transactionId: 'trans-1',
                    amount: 100,
                    status: EscrowStatus.HOLDING,
                    releaseAt: new Date(Date.now() - 1000),
                    transaction: { id: 'trans-1' },
                },
            ];

            mockPrisma.escrowRecord.findMany.mockResolvedValue(expiredEscrows);
            mockPrisma.escrowRecord.findUnique.mockResolvedValue({
                ...expiredEscrows[0],
                transaction: {
                    id: 'trans-1',
                    senderPaymentMethod: {
                        type: PaymentMethodType.CRYPTO,
                        encryptedDetails: JSON.stringify({ wallet: 'wallet-1' }),
                    },
                },
            });

            (mockPaymentProcessor.depositFunds as Mock).mockResolvedValue({
                success: false,
                error: 'Network error',
            });

            await escrowManager.processExpiredEscrows();

            expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
                where: { id: 'trans-1' },
                data: {
                    status: TransactionStatus.FAILED,
                    failureReason: expect.stringContaining('Escrow timeout - failed to return funds'),
                },
            });
        });
    });

    describe('cleanupCompletedEscrows', () => {
        it('should cleanup old completed escrows', async () => {
            mockPrisma.escrowRecord.deleteMany.mockResolvedValue({ count: 5 });

            const deletedCount = await escrowManager.cleanupCompletedEscrows(30);

            expect(deletedCount).toBe(5);
            expect(mockPrisma.escrowRecord.deleteMany).toHaveBeenCalledWith({
                where: {
                    status: {
                        in: [EscrowStatus.RELEASED, EscrowStatus.RETURNED],
                    },
                    releaseAt: {
                        lte: expect.any(Date),
                    },
                },
            });
        });

        it('should throw error for invalid olderThanDays parameter', async () => {
            await expect(escrowManager.cleanupCompletedEscrows(0))
                .rejects.toThrow('olderThanDays must be positive');

            await expect(escrowManager.cleanupCompletedEscrows(-5))
                .rejects.toThrow('olderThanDays must be positive');
        });
    });

    describe('Error Classes', () => {
        it('should create EscrowError with message and transaction ID', () => {
            const error = new EscrowError('Test error', 'trans-123');
            expect(error.message).toBe('Test error');
            expect(error.transactionId).toBe('trans-123');
            expect(error.name).toBe('EscrowError');
        });

        it('should create EscrowTimeoutError', () => {
            const error = new EscrowTimeoutError('trans-123');
            expect(error.message).toBe('Escrow timeout for transaction trans-123');
            expect(error.transactionId).toBe('trans-123');
            expect(error.name).toBe('EscrowTimeoutError');
        });

        it('should create EscrowNotFoundError', () => {
            const error = new EscrowNotFoundError('trans-123');
            expect(error.message).toBe('Escrow record not found for transaction trans-123');
            expect(error.transactionId).toBe('trans-123');
            expect(error.name).toBe('EscrowNotFoundError');
        });

        it('should create EscrowStatusError', () => {
            const error = new EscrowStatusError('trans-123', EscrowStatus.RELEASED, EscrowStatus.HOLDING);
            expect(error.message).toBe('Invalid escrow status for transaction trans-123: expected HOLDING, got RELEASED');
            expect(error.transactionId).toBe('trans-123');
            expect(error.name).toBe('EscrowStatusError');
        });
    });
});