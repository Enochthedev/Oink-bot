// PaymentService unit tests
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { PaymentServiceImpl } from '../PaymentService';
import { EscrowManager } from '../EscrowManager';
import { UserAccountService } from '../UserAccountService';
import { PaymentProcessorFactory } from '../../processors/PaymentProcessorFactory';
import { PaymentProcessor } from '../../processors/PaymentProcessor';
import { TransactionStatus } from '../../models/Transaction';
import { PaymentMethodType, PaymentMethodConfig } from '../../models/UserAccount';
import { EscrowRecord, EscrowStatus } from '../../models/EscrowRecord';
import * as database from '../../models/database';

// Mock dependencies
vi.mock('../../models/database');
vi.mock('uuid', () => ({
    v4: () => 'test-transaction-id'
}));

describe('PaymentService', () => {
    let paymentService: PaymentServiceImpl;
    let mockEscrowManager: EscrowManager;
    let mockUserAccountService: UserAccountService;
    let mockPaymentProcessorFactory: PaymentProcessorFactory;
    let mockPaymentProcessor: PaymentProcessor;
    let mockPrisma: any;
    let mockTransaction: any;

    const mockSenderPaymentMethod: PaymentMethodConfig = {
        id: 'sender-method-id',
        type: 'crypto',
        displayName: 'Bitcoin Wallet',
        encryptedDetails: 'encrypted-details',
        isActive: true,
        addedAt: new Date('2024-01-01')
    };

    const mockRecipientPaymentMethod: PaymentMethodConfig = {
        id: 'recipient-method-id',
        type: 'ach',
        displayName: 'Bank Account',
        encryptedDetails: 'encrypted-details',
        isActive: true,
        addedAt: new Date('2024-01-01')
    };

    const mockSenderAccount = {
        discordId: 'sender-123',
        paymentMethods: [mockSenderPaymentMethod],
        transactionHistory: [],
        notificationPreferences: {
            enableDMNotifications: true,
            enableChannelNotifications: false
        },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
    };

    const mockRecipientAccount = {
        discordId: 'recipient-456',
        paymentMethods: [mockRecipientPaymentMethod],
        transactionHistory: [],
        notificationPreferences: {
            enableDMNotifications: true,
            enableChannelNotifications: false
        },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
    };

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Mock Prisma client
        mockTransaction = {
            transaction: {
                create: vi.fn(),
                update: vi.fn(),
                findUnique: vi.fn(),
                findMany: vi.fn()
            },
            serverConfig: {
                findUnique: vi.fn()
            }
        };

        mockPrisma = {
            transaction: {
                create: vi.fn(),
                update: vi.fn(),
                findUnique: vi.fn(),
                findMany: vi.fn()
            },
            serverConfig: {
                findUnique: vi.fn()
            }
        };

        (database.getPrismaClient as Mock).mockReturnValue(mockPrisma);
        (database.withTransaction as Mock).mockImplementation(async (callback) => {
            return await callback(mockTransaction);
        });

        // Mock payment processor
        mockPaymentProcessor = {
            validatePaymentMethod: vi.fn().mockResolvedValue(true),
            withdrawFunds: vi.fn().mockResolvedValue({
                success: true,
                transactionId: 'external-tx-id'
            }),
            depositFunds: vi.fn().mockResolvedValue({
                success: true,
                transactionId: 'external-deposit-id'
            }),
            getProcessingTime: vi.fn().mockResolvedValue({
                minMinutes: 1,
                maxMinutes: 5
            }),
            calculateFees: vi.fn().mockResolvedValue({
                processingFee: 0.50,
                percentage: 0.029,
                total: 0.50
            })
        };

        // Mock payment processor factory
        mockPaymentProcessorFactory = {
            createProcessor: vi.fn().mockReturnValue(mockPaymentProcessor),
            getSupportedMethods: vi.fn().mockReturnValue(['crypto', 'ach', 'other'])
        };

        // Mock user account service
        mockUserAccountService = {
            createAccount: vi.fn(),
            getAccount: vi.fn(),
            addPaymentMethod: vi.fn(),
            removePaymentMethod: vi.fn(),
            updateNotificationPreferences: vi.fn(),
            validatePaymentMethod: vi.fn(),
            encryptPaymentDetails: vi.fn(),
            decryptPaymentDetails: vi.fn()
        };

        // Mock escrow manager
        mockEscrowManager = {
            holdFunds: vi.fn(),
            releaseFunds: vi.fn(),
            returnFunds: vi.fn(),
            getEscrowStatus: vi.fn(),
            getEscrowRecord: vi.fn(),
            processExpiredEscrows: vi.fn(),
            cleanupCompletedEscrows: vi.fn()
        };

        paymentService = new PaymentServiceImpl(
            mockEscrowManager,
            mockUserAccountService,
            mockPaymentProcessorFactory
        );
    });

    describe('initiatePayment', () => {
        it('should successfully initiate a payment with escrow', async () => {
            // Setup mocks
            (mockUserAccountService.getAccount as Mock)
                .mockResolvedValueOnce(mockSenderAccount)
                .mockResolvedValueOnce(mockRecipientAccount);

            const mockEscrowRecord: EscrowRecord = {
                transactionId: 'test-transaction-id',
                amount: 100,
                currency: 'USD',
                paymentMethod: 'crypto',
                externalTransactionId: 'external-tx-id',
                status: EscrowStatus.HOLDING,
                createdAt: new Date(),
                releaseAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            };

            (mockEscrowManager.holdFunds as Mock).mockResolvedValue(mockEscrowRecord);
            mockTransaction.transaction.create.mockResolvedValue({
                id: 'test-transaction-id',
                senderId: 'sender-123',
                recipientId: 'recipient-456',
                amount: 100,
                currency: 'USD',
                status: TransactionStatus.PENDING,
                createdAt: new Date()
            });

            // Execute
            const result = await paymentService.initiatePayment(
                'sender-123',
                'recipient-456',
                100,
                'sender-method-id',
                'recipient-method-id'
            );

            // Verify
            expect(result).toBeDefined();
            expect(result.id).toBe('test-transaction-id');
            expect(result.senderId).toBe('sender-123');
            expect(result.recipientId).toBe('recipient-456');
            expect(result.amount).toBe(100);
            expect(result.status).toBe(TransactionStatus.ESCROWED);
            expect(result.escrowRecord).toEqual(mockEscrowRecord);

            expect(mockUserAccountService.getAccount).toHaveBeenCalledWith('sender-123');
            expect(mockUserAccountService.getAccount).toHaveBeenCalledWith('recipient-456');
            expect(mockEscrowManager.holdFunds).toHaveBeenCalledWith(
                'test-transaction-id',
                100,
                'crypto'
            );
        });

        it('should throw error for invalid sender/recipient', async () => {
            await expect(
                paymentService.initiatePayment('', 'recipient-456', 100, 'method-id')
            ).rejects.toThrow('Invalid sender or recipient ID');

            await expect(
                paymentService.initiatePayment('sender-123', 'sender-123', 100, 'method-id')
            ).rejects.toThrow('Invalid sender or recipient ID');
        });

        it('should throw error for invalid amount', async () => {
            await expect(
                paymentService.initiatePayment('sender-123', 'recipient-456', 0, 'method-id')
            ).rejects.toThrow('Invalid payment amount');

            await expect(
                paymentService.initiatePayment('sender-123', 'recipient-456', -100, 'method-id')
            ).rejects.toThrow('Invalid payment amount');
        });

        it('should throw error when sender account not found', async () => {
            (mockUserAccountService.getAccount as Mock).mockResolvedValue(null);

            await expect(
                paymentService.initiatePayment('sender-123', 'recipient-456', 100, 'method-id')
            ).rejects.toThrow('Sender account not found');
        });

        it('should throw error when sender payment method not found', async () => {
            (mockUserAccountService.getAccount as Mock).mockResolvedValue({
                ...mockSenderAccount,
                paymentMethods: []
            });

            await expect(
                paymentService.initiatePayment('sender-123', 'recipient-456', 100, 'invalid-method-id')
            ).rejects.toThrow('Sender payment method not found or inactive');
        });

        it('should handle escrow failure and mark transaction as failed', async () => {
            (mockUserAccountService.getAccount as Mock)
                .mockResolvedValueOnce(mockSenderAccount)
                .mockResolvedValueOnce(mockRecipientAccount);

            mockTransaction.transaction.create.mockResolvedValue({
                id: 'test-transaction-id',
                status: TransactionStatus.PENDING
            });

            (mockEscrowManager.holdFunds as Mock).mockRejectedValue(new Error('Escrow failed'));

            await expect(
                paymentService.initiatePayment('sender-123', 'recipient-456', 100, 'sender-method-id')
            ).rejects.toThrow('Payment initiation failed: Escrow failed');

            expect(mockTransaction.transaction.update).toHaveBeenCalledWith({
                where: { id: 'test-transaction-id' },
                data: {
                    status: TransactionStatus.FAILED,
                    failureReason: 'Escrow failed: Escrow failed'
                }
            });
        });
    });

    describe('getTransactionHistory', () => {
        it('should return transaction history for user', async () => {
            const mockDbTransactions = [
                {
                    id: 'tx-1',
                    senderId: 'sender-123',
                    recipientId: 'recipient-456',
                    amount: 100,
                    currency: 'USD',
                    status: TransactionStatus.COMPLETED,
                    processingFee: 0.50,
                    escrowFee: 1.00,
                    totalFees: 1.50,
                    createdAt: new Date('2024-01-01'),
                    completedAt: new Date('2024-01-01'),
                    senderPaymentMethod: {
                        id: 'sender-method-id',
                        type: 'CRYPTO',
                        displayName: 'Bitcoin Wallet',
                        encryptedDetails: 'encrypted',
                        isActive: true,
                        addedAt: new Date('2024-01-01')
                    },
                    recipientPaymentMethod: {
                        id: 'recipient-method-id',
                        type: 'ACH',
                        displayName: 'Bank Account',
                        encryptedDetails: 'encrypted',
                        isActive: true,
                        addedAt: new Date('2024-01-01')
                    },
                    escrowRecord: null
                }
            ];

            mockPrisma.transaction.findMany.mockResolvedValue(mockDbTransactions);

            const result = await paymentService.getTransactionHistory('sender-123');

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('tx-1');
            expect(result[0].senderId).toBe('sender-123');
            expect(result[0].senderPaymentMethod.type).toBe('crypto');
            expect(result[0].recipientPaymentMethod?.type).toBe('ach');

            expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith({
                where: {
                    OR: [
                        { senderId: 'sender-123' },
                        { recipientId: 'sender-123' }
                    ]
                },
                include: {
                    senderPaymentMethod: true,
                    recipientPaymentMethod: true,
                    escrowRecord: true
                },
                orderBy: { createdAt: 'desc' },
                take: 50,
                skip: 0
            });
        });

        it('should throw error for invalid user ID', async () => {
            await expect(
                paymentService.getTransactionHistory('')
            ).rejects.toThrow('User ID is required');
        });

        it('should throw error for invalid limit', async () => {
            await expect(
                paymentService.getTransactionHistory('user-123', 0)
            ).rejects.toThrow('Limit must be between 1 and 100');

            await expect(
                paymentService.getTransactionHistory('user-123', 101)
            ).rejects.toThrow('Limit must be between 1 and 100');
        });
    });

    describe('validatePaymentLimits', () => {
        it('should return true when no server config exists', async () => {
            mockPrisma.serverConfig.findUnique.mockResolvedValue(null);

            const result = await paymentService.validatePaymentLimits('user-123', 100, 'server-456');

            expect(result).toBe(true);
        });

        it('should return false when payments are disabled', async () => {
            mockPrisma.serverConfig.findUnique.mockResolvedValue({
                id: 'config-id',
                serverId: 'server-456',
                paymentsEnabled: false,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto", "ach"]',
                adminUserIdsJson: '["admin-123"]',
                createdAt: new Date(),
                updatedAt: new Date()
            });

            const result = await paymentService.validatePaymentLimits('user-123', 100, 'server-456');

            expect(result).toBe(false);
        });

        it('should return false when amount exceeds limit', async () => {
            mockPrisma.serverConfig.findUnique.mockResolvedValue({
                id: 'config-id',
                serverId: 'server-456',
                paymentsEnabled: true,
                maxAmountPerUser: 50,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto", "ach"]',
                adminUserIdsJson: '["admin-123"]',
                createdAt: new Date(),
                updatedAt: new Date()
            });

            const result = await paymentService.validatePaymentLimits('user-123', 100, 'server-456');

            expect(result).toBe(false);
        });

        it('should return false when daily transaction count exceeds limit', async () => {
            mockPrisma.serverConfig.findUnique.mockResolvedValue({
                id: 'config-id',
                serverId: 'server-456',
                paymentsEnabled: true,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 1,
                allowedPaymentMethodsJson: '["crypto", "ach"]',
                adminUserIdsJson: '["admin-123"]',
                createdAt: new Date(),
                updatedAt: new Date()
            });

            mockPrisma.transaction.findMany.mockResolvedValue([
                { id: 'tx-1', amount: 50 }
            ]);

            const result = await paymentService.validatePaymentLimits('user-123', 100, 'server-456');

            expect(result).toBe(false);
        });

        it('should return true when all limits are satisfied', async () => {
            mockPrisma.serverConfig.findUnique.mockResolvedValue({
                id: 'config-id',
                serverId: 'server-456',
                paymentsEnabled: true,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto", "ach"]',
                adminUserIdsJson: '["admin-123"]',
                createdAt: new Date(),
                updatedAt: new Date()
            });

            mockPrisma.transaction.findMany.mockResolvedValue([]);

            const result = await paymentService.validatePaymentLimits('user-123', 100, 'server-456');

            expect(result).toBe(true);
        });
    });

    describe('getTransaction', () => {
        it('should return transaction by ID', async () => {
            const mockDbTransaction = {
                id: 'tx-1',
                senderId: 'sender-123',
                recipientId: 'recipient-456',
                amount: 100,
                currency: 'USD',
                status: TransactionStatus.COMPLETED,
                processingFee: 0.50,
                escrowFee: 1.00,
                totalFees: 1.50,
                createdAt: new Date('2024-01-01'),
                completedAt: new Date('2024-01-01'),
                senderPaymentMethod: {
                    id: 'sender-method-id',
                    type: 'CRYPTO',
                    displayName: 'Bitcoin Wallet',
                    encryptedDetails: 'encrypted',
                    isActive: true,
                    addedAt: new Date('2024-01-01')
                },
                recipientPaymentMethod: null,
                escrowRecord: null
            };

            mockPrisma.transaction.findUnique.mockResolvedValue(mockDbTransaction);

            const result = await paymentService.getTransaction('tx-1');

            expect(result).toBeDefined();
            expect(result!.id).toBe('tx-1');
            expect(result!.senderPaymentMethod.type).toBe('crypto');
            expect(result!.recipientPaymentMethod).toBeUndefined();
        });

        it('should return null when transaction not found', async () => {
            mockPrisma.transaction.findUnique.mockResolvedValue(null);

            const result = await paymentService.getTransaction('nonexistent-tx');

            expect(result).toBeNull();
        });
    });

    describe('updateTransactionStatus', () => {
        it('should update transaction status to completed', async () => {
            await paymentService.updateTransactionStatus('tx-1', TransactionStatus.COMPLETED);

            expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
                where: { id: 'tx-1' },
                data: {
                    status: TransactionStatus.COMPLETED,
                    completedAt: expect.any(Date)
                }
            });
        });

        it('should update transaction status to failed with reason', async () => {
            await paymentService.updateTransactionStatus(
                'tx-1',
                TransactionStatus.FAILED,
                'Payment processor error'
            );

            expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
                where: { id: 'tx-1' },
                data: {
                    status: TransactionStatus.FAILED,
                    failureReason: 'Payment processor error'
                }
            });
        });

        it('should throw error for invalid transaction ID', async () => {
            await expect(
                paymentService.updateTransactionStatus('', TransactionStatus.COMPLETED)
            ).rejects.toThrow('Transaction ID is required');
        });
    });

    describe('selectPaymentMethod', () => {
        it('should return payment method for valid user and method ID', async () => {
            (mockUserAccountService.getAccount as Mock).mockResolvedValue(mockSenderAccount);

            const result = await paymentService.selectPaymentMethod('sender-123', 'sender-method-id');

            expect(result).toEqual(mockSenderPaymentMethod);
        });

        it('should throw error when user account not found', async () => {
            (mockUserAccountService.getAccount as Mock).mockResolvedValue(null);

            await expect(
                paymentService.selectPaymentMethod('sender-123', 'method-id')
            ).rejects.toThrow('User account not found');
        });

        it('should throw error when payment method not found', async () => {
            (mockUserAccountService.getAccount as Mock).mockResolvedValue({
                ...mockSenderAccount,
                paymentMethods: []
            });

            await expect(
                paymentService.selectPaymentMethod('sender-123', 'invalid-method-id')
            ).rejects.toThrow('Payment method not found or inactive');
        });
    });

    describe('calculateTransactionFees', () => {
        it('should calculate fees using payment processor', async () => {
            const result = await paymentService.calculateTransactionFees(100, 'crypto');

            expect(result.processingFee).toBe(0.50);
            expect(result.escrowFee).toBe(1.00); // 1% of 100
            expect(result.total).toBe(1.50);

            expect(mockPaymentProcessorFactory.createProcessor).toHaveBeenCalledWith('crypto');
            expect(mockPaymentProcessor.calculateFees).toHaveBeenCalledWith(100);
        });

        it('should use fallback fees when processor fails', async () => {
            (mockPaymentProcessor.calculateFees as Mock).mockRejectedValue(new Error('Processor error'));

            const result = await paymentService.calculateTransactionFees(100, 'crypto');

            expect(result.processingFee).toBe(0.50); // Default fallback
            expect(result.escrowFee).toBe(1.00); // 1% of 100
            expect(result.total).toBe(1.50);
        });

        it('should throw error for invalid amount', async () => {
            await expect(
                paymentService.calculateTransactionFees(0, 'crypto')
            ).rejects.toThrow('Invalid amount');
        });
    });
});