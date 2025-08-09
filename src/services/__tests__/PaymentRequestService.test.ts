// Payment request service tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaymentRequestServiceImpl } from '../PaymentRequestService';
import { PaymentService } from '../PaymentService';
import { UserAccountService } from '../UserAccountService';
import { PaymentRequestStatus } from '../../models/PaymentRequest';
import { UserAccount } from '../../models/UserAccount';
import { Transaction, TransactionStatus } from '../../models/Transaction';
import { getPrismaClient } from '../../models/database';

// Mock the database
vi.mock('../../models/database', () => ({
    getPrismaClient: vi.fn(),
    withTransaction: vi.fn((callback) => callback({
        paymentRequest: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            findMany: vi.fn(),
        }
    }))
}));

describe('PaymentRequestService', () => {
    let service: PaymentRequestServiceImpl;
    let mockPaymentService: PaymentService;
    let mockUserAccountService: UserAccountService;
    let mockPrisma: any;

    beforeEach(() => {
        mockPrisma = {
            paymentRequest: {
                create: vi.fn(),
                findUnique: vi.fn(),
                update: vi.fn(),
                updateMany: vi.fn(),
                findMany: vi.fn(),
            }
        };

        vi.mocked(getPrismaClient).mockReturnValue(mockPrisma);

        mockPaymentService = {
            initiatePayment: vi.fn(),
            processPaymentRequest: vi.fn(),
            getTransactionHistory: vi.fn(),
            validatePaymentLimits: vi.fn(),
            getTransaction: vi.fn(),
            updateTransactionStatus: vi.fn(),
            selectPaymentMethod: vi.fn(),
            calculateTransactionFees: vi.fn(),
        };

        mockUserAccountService = {
            createAccount: vi.fn(),
            getAccount: vi.fn(),
            updateAccount: vi.fn(),
            addPaymentMethod: vi.fn(),
            removePaymentMethod: vi.fn(),
            getPaymentMethods: vi.fn(),
            updateNotificationPreferences: vi.fn(),
        };

        service = new PaymentRequestServiceImpl(mockPaymentService, mockUserAccountService);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('createPaymentRequest', () => {
        const mockRequesterAccount: UserAccount = {
            discordId: 'requester123',
            paymentMethods: [],
            transactionHistory: [],
            notificationPreferences: {
                enableDMNotifications: true,
                enableChannelNotifications: false,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockPayerAccount: UserAccount = {
            discordId: 'payer456',
            paymentMethods: [],
            transactionHistory: [],
            notificationPreferences: {
                enableDMNotifications: true,
                enableChannelNotifications: false,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        beforeEach(() => {
            vi.mocked(mockUserAccountService.getAccount)
                .mockResolvedValueOnce(mockRequesterAccount)
                .mockResolvedValueOnce(mockPayerAccount);
        });

        it('should create payment request successfully', async () => {
            const mockDbRequest = {
                id: 'req123',
                requesterId: 'requester123',
                payerId: 'payer456',
                amount: 50.00,
                currency: 'USD',
                description: 'Test payment',
                status: PaymentRequestStatus.PENDING,
                serverId: 'guild789',
                expiresAt: expect.any(Date),
                createdAt: expect.any(Date),
                respondedAt: null,
                transactionId: null,
            };

            mockPrisma.paymentRequest.create.mockResolvedValue(mockDbRequest);

            const result = await service.createPaymentRequest(
                'requester123',
                'payer456',
                50.00,
                'Test payment',
                'guild789'
            );

            expect(result).toMatchObject({
                requesterId: 'requester123',
                payerId: 'payer456',
                amount: 50.00,
                description: 'Test payment',
                status: PaymentRequestStatus.PENDING,
                serverId: 'guild789',
            });

            expect(mockPrisma.paymentRequest.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    requesterId: 'requester123',
                    payerId: 'payer456',
                    amount: 50.00,
                    description: 'Test payment',
                    status: PaymentRequestStatus.PENDING,
                    serverId: 'guild789',
                })
            });
        });

        it('should reject invalid requester/payer IDs', async () => {
            await expect(service.createPaymentRequest('', 'payer456', 50.00, 'Test')).rejects.toThrow('Invalid requester or payer ID');
            await expect(service.createPaymentRequest('user123', '', 50.00, 'Test')).rejects.toThrow('Invalid requester or payer ID');
            await expect(service.createPaymentRequest('user123', 'user123', 50.00, 'Test')).rejects.toThrow('Invalid requester or payer ID');
        });

        it('should reject invalid amounts', async () => {
            await expect(service.createPaymentRequest('requester123', 'payer456', 0, 'Test')).rejects.toThrow('Invalid payment amount');
            await expect(service.createPaymentRequest('requester123', 'payer456', -10, 'Test')).rejects.toThrow('Invalid payment amount');
            await expect(service.createPaymentRequest('requester123', 'payer456', Infinity, 'Test')).rejects.toThrow('Invalid payment amount');
        });

        it('should reject invalid descriptions', async () => {
            await expect(service.createPaymentRequest('requester123', 'payer456', 50.00, '')).rejects.toThrow('Description is required');
            await expect(service.createPaymentRequest('requester123', 'payer456', 50.00, '   ')).rejects.toThrow('Description is required');
            await expect(service.createPaymentRequest('requester123', 'payer456', 50.00, 'a'.repeat(501))).rejects.toThrow('Description must be 500 characters or less');
        });

        it('should reject invalid expiration hours', async () => {
            await expect(service.createPaymentRequest('requester123', 'payer456', 50.00, 'Test', undefined, 0)).rejects.toThrow('Expiration hours must be between 1 and 168');
            await expect(service.createPaymentRequest('requester123', 'payer456', 50.00, 'Test', undefined, 200)).rejects.toThrow('Expiration hours must be between 1 and 168');
        });

        it('should handle missing requester account', async () => {
            // Create a new service instance with fresh mocks for this test
            const testUserAccountService = {
                createAccount: vi.fn(),
                getAccount: vi.fn().mockResolvedValueOnce(null),
                updateAccount: vi.fn(),
                addPaymentMethod: vi.fn(),
                removePaymentMethod: vi.fn(),
                getPaymentMethods: vi.fn(),
                updateNotificationPreferences: vi.fn(),
            };

            const testService = new PaymentRequestServiceImpl(mockPaymentService, testUserAccountService);

            await expect(testService.createPaymentRequest('requester123', 'payer456', 50.00, 'Test')).rejects.toThrow('Requester account not found');
        });

        it('should handle missing payer account', async () => {
            // Create a new service instance with fresh mocks for this test
            const testUserAccountService = {
                createAccount: vi.fn(),
                getAccount: vi.fn()
                    .mockResolvedValueOnce(mockRequesterAccount)
                    .mockResolvedValueOnce(null),
                updateAccount: vi.fn(),
                addPaymentMethod: vi.fn(),
                removePaymentMethod: vi.fn(),
                getPaymentMethods: vi.fn(),
                updateNotificationPreferences: vi.fn(),
            };

            const testService = new PaymentRequestServiceImpl(mockPaymentService, testUserAccountService);

            await expect(testService.createPaymentRequest('requester123', 'payer456', 50.00, 'Test')).rejects.toThrow('Payer account not found');
        });
    });

    describe('getPaymentRequest', () => {
        it('should return payment request when found', async () => {
            const mockDbRequest = {
                id: 'req123',
                requesterId: 'requester123',
                payerId: 'payer456',
                amount: 50.00,
                currency: 'USD',
                description: 'Test payment',
                status: PaymentRequestStatus.PENDING,
                serverId: 'guild789',
                expiresAt: new Date(),
                createdAt: new Date(),
                respondedAt: null,
                transactionId: null,
            };

            mockPrisma.paymentRequest.findUnique.mockResolvedValue(mockDbRequest);

            const result = await service.getPaymentRequest('req123');

            expect(result).toMatchObject({
                id: 'req123',
                requesterId: 'requester123',
                payerId: 'payer456',
                amount: 50.00,
                description: 'Test payment',
                status: PaymentRequestStatus.PENDING,
            });

            expect(mockPrisma.paymentRequest.findUnique).toHaveBeenCalledWith({
                where: { id: 'req123' }
            });
        });

        it('should return null when not found', async () => {
            mockPrisma.paymentRequest.findUnique.mockResolvedValue(null);

            const result = await service.getPaymentRequest('nonexistent');

            expect(result).toBeNull();
        });

        it('should reject empty request ID', async () => {
            await expect(service.getPaymentRequest('')).rejects.toThrow('Request ID is required');
        });
    });

    describe('approvePaymentRequest', () => {
        const mockPaymentRequest = {
            id: 'req123',
            requesterId: 'requester123',
            payerId: 'payer456',
            amount: 50.00,
            currency: 'USD',
            description: 'Test payment',
            status: PaymentRequestStatus.PENDING,
            serverId: 'guild789',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
            createdAt: new Date(),
            respondedAt: null,
            transactionId: null,
        };

        const mockTransaction: Transaction = {
            id: 'tx123',
            senderId: 'payer456',
            recipientId: 'requester123',
            amount: 50.00,
            currency: 'USD',
            senderPaymentMethod: {
                id: 'pm123',
                type: 'crypto',
                displayName: 'My Wallet',
                encryptedDetails: 'encrypted',
                isActive: true,
                addedAt: new Date(),
            },
            status: TransactionStatus.PENDING,
            fees: {
                processingFee: 1.00,
                escrowFee: 0.50,
                total: 1.50,
            },
            createdAt: new Date(),
        };

        it('should approve payment request successfully', async () => {
            const mockTx = {
                paymentRequest: {
                    findUnique: vi.fn().mockResolvedValue(mockPaymentRequest),
                    update: vi.fn().mockResolvedValue({
                        ...mockPaymentRequest,
                        status: PaymentRequestStatus.APPROVED,
                        respondedAt: expect.any(Date),
                        transactionId: 'tx123',
                    }),
                }
            };

            // Mock withTransaction to use our mock transaction
            const { withTransaction } = await import('../../models/database');
            vi.mocked(withTransaction).mockImplementation(async (callback) => callback(mockTx));

            vi.mocked(mockPaymentService.initiatePayment).mockResolvedValue(mockTransaction);

            const result = await service.approvePaymentRequest('req123', 'payer456', 'pm123');

            expect(result.status).toBe(PaymentRequestStatus.APPROVED);
            expect(result.transactionId).toBe('tx123');

            expect(mockPaymentService.initiatePayment).toHaveBeenCalledWith(
                'payer456',
                'requester123',
                50.00,
                'pm123',
                undefined,
                'guild789'
            );
        });

        it('should reject approval by unauthorized user', async () => {
            const mockTx = {
                paymentRequest: {
                    findUnique: vi.fn().mockResolvedValue(mockPaymentRequest),
                }
            };

            const { withTransaction } = await import('../../models/database');
            vi.mocked(withTransaction).mockImplementation(async (callback) => callback(mockTx));

            await expect(service.approvePaymentRequest('req123', 'unauthorized', 'pm123')).rejects.toThrow('Unauthorized to approve this payment request');
        });

        it('should reject approval of expired request', async () => {
            const expiredRequest = {
                ...mockPaymentRequest,
                expiresAt: new Date(Date.now() - 1000), // 1 second ago
            };

            const mockTx = {
                paymentRequest: {
                    findUnique: vi.fn().mockResolvedValue(expiredRequest),
                }
            };

            const { withTransaction } = await import('../../models/database');
            vi.mocked(withTransaction).mockImplementation(async (callback) => callback(mockTx));

            await expect(service.approvePaymentRequest('req123', 'payer456', 'pm123')).rejects.toThrow('Payment request cannot be approved');
        });

        it('should handle non-existent request', async () => {
            const mockTx = {
                paymentRequest: {
                    findUnique: vi.fn().mockResolvedValue(null),
                }
            };

            const { withTransaction } = await import('../../models/database');
            vi.mocked(withTransaction).mockImplementation(async (callback) => callback(mockTx));

            await expect(service.approvePaymentRequest('nonexistent', 'payer456', 'pm123')).rejects.toThrow('Payment request not found');
        });
    });

    describe('declinePaymentRequest', () => {
        const mockPaymentRequest = {
            id: 'req123',
            requesterId: 'requester123',
            payerId: 'payer456',
            amount: 50.00,
            currency: 'USD',
            description: 'Test payment',
            status: PaymentRequestStatus.PENDING,
            serverId: 'guild789',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdAt: new Date(),
            respondedAt: null,
            transactionId: null,
        };

        it('should decline payment request successfully', async () => {
            const mockTx = {
                paymentRequest: {
                    findUnique: vi.fn().mockResolvedValue(mockPaymentRequest),
                    update: vi.fn().mockResolvedValue({
                        ...mockPaymentRequest,
                        status: PaymentRequestStatus.DECLINED,
                        respondedAt: expect.any(Date),
                    }),
                }
            };

            const { withTransaction } = await import('../../models/database');
            vi.mocked(withTransaction).mockImplementation(async (callback) => callback(mockTx));

            const result = await service.declinePaymentRequest('req123', 'payer456');

            expect(result.status).toBe(PaymentRequestStatus.DECLINED);
            expect(mockTx.paymentRequest.update).toHaveBeenCalledWith({
                where: { id: 'req123' },
                data: {
                    status: PaymentRequestStatus.DECLINED,
                    respondedAt: expect.any(Date),
                }
            });
        });

        it('should reject decline by unauthorized user', async () => {
            const mockTx = {
                paymentRequest: {
                    findUnique: vi.fn().mockResolvedValue(mockPaymentRequest),
                }
            };

            const { withTransaction } = await import('../../models/database');
            vi.mocked(withTransaction).mockImplementation(async (callback) => callback(mockTx));

            await expect(service.declinePaymentRequest('req123', 'unauthorized')).rejects.toThrow('Unauthorized to decline this payment request');
        });
    });

    describe('expireOldRequests', () => {
        it('should expire old pending requests', async () => {
            mockPrisma.paymentRequest.updateMany.mockResolvedValue({ count: 3 });

            const result = await service.expireOldRequests();

            expect(result).toBe(3);
            expect(mockPrisma.paymentRequest.updateMany).toHaveBeenCalledWith({
                where: {
                    status: PaymentRequestStatus.PENDING,
                    expiresAt: {
                        lt: expect.any(Date)
                    }
                },
                data: {
                    status: PaymentRequestStatus.EXPIRED,
                    respondedAt: expect.any(Date),
                }
            });
        });

        it('should return 0 when no requests to expire', async () => {
            mockPrisma.paymentRequest.updateMany.mockResolvedValue({ count: 0 });

            const result = await service.expireOldRequests();

            expect(result).toBe(0);
        });
    });

    describe('getUserPendingRequests', () => {
        it('should return pending requests for user', async () => {
            const mockRequests = [
                {
                    id: 'req1',
                    requesterId: 'requester123',
                    payerId: 'user123',
                    amount: 50.00,
                    currency: 'USD',
                    description: 'Test 1',
                    status: PaymentRequestStatus.PENDING,
                    serverId: null,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    createdAt: new Date(),
                    respondedAt: null,
                    transactionId: null,
                },
                {
                    id: 'req2',
                    requesterId: 'requester456',
                    payerId: 'user123',
                    amount: 25.00,
                    currency: 'USD',
                    description: 'Test 2',
                    status: PaymentRequestStatus.PENDING,
                    serverId: null,
                    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
                    createdAt: new Date(),
                    respondedAt: null,
                    transactionId: null,
                }
            ];

            mockPrisma.paymentRequest.findMany.mockResolvedValue(mockRequests);

            const result = await service.getUserPendingRequests('user123');

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('req1');
            expect(result[1].id).toBe('req2');

            expect(mockPrisma.paymentRequest.findMany).toHaveBeenCalledWith({
                where: {
                    payerId: 'user123',
                    status: PaymentRequestStatus.PENDING,
                    expiresAt: {
                        gt: expect.any(Date)
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
        });

        it('should reject empty user ID', async () => {
            await expect(service.getUserPendingRequests('')).rejects.toThrow('User ID is required');
        });
    });
});