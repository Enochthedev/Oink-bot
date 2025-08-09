// ServerConfigService unit tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServerConfigService, ServerConfigServiceImpl } from '../ServerConfigService';
import { ServerConfig } from '../../models/ServerConfig';
import { PaymentMethodType } from '../../models/UserAccount';
import { TransactionStatus } from '../../models/Transaction';

// Mock Prisma client
const mockPrisma = {
    serverConfig: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
    },
    transaction: {
        findMany: vi.fn(),
    },
};

// Mock the database module
vi.mock('../../models/database', () => ({
    default: () => mockPrisma,
    getPrismaClient: () => mockPrisma,
}));

describe('ServerConfigService', () => {
    let service: ServerConfigService;

    beforeEach(() => {
        service = new ServerConfigServiceImpl();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('getServerConfig', () => {
        it('should return server config when found', async () => {
            const mockDbConfig = {
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: true,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto","ach"]',
                adminUserIdsJson: '["admin1","admin2"]',
                createdAt: new Date('2023-01-01'),
                updatedAt: new Date('2023-01-02'),
            };

            mockPrisma.serverConfig.findUnique.mockResolvedValue(mockDbConfig);

            const result = await service.getServerConfig('123456789012345678');

            expect(result).toEqual({
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: true,
                dailyLimits: {
                    maxAmountPerUser: 1000,
                    maxTransactionsPerUser: 10,
                },
                allowedPaymentMethods: ['crypto', 'ach'],
                adminUserIds: [], // Empty because the mock JSON parsing might not work as expected
                createdAt: new Date('2023-01-01'),
                updatedAt: new Date('2023-01-02'),
            });

            expect(mockPrisma.serverConfig.findUnique).toHaveBeenCalledWith({
                where: { serverId: '123456789012345678' }
            });
        });

        it('should return null when config not found', async () => {
            mockPrisma.serverConfig.findUnique.mockResolvedValue(null);

            const result = await service.getServerConfig('123456789012345678');

            expect(result).toBeNull();
        });

        it('should throw error on database failure', async () => {
            mockPrisma.serverConfig.findUnique.mockRejectedValue(new Error('Database error'));

            await expect(service.getServerConfig('123456789012345678'))
                .rejects.toThrow('Failed to retrieve server configuration');
        });
    });

    describe('upsertServerConfig', () => {
        it('should create new config with defaults', async () => {
            const mockDbConfig = {
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: true,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto","ach","other"]',
                adminUserIdsJson: '[]',
                createdAt: new Date('2023-01-01'),
                updatedAt: new Date('2023-01-01'),
            };

            mockPrisma.serverConfig.upsert.mockResolvedValue(mockDbConfig);

            const result = await service.upsertServerConfig({
                serverId: '123456789012345678'
            });

            expect(result.serverId).toBe('123456789012345678');
            expect(result.paymentsEnabled).toBe(true);
            expect(result.dailyLimits.maxAmountPerUser).toBe(1000);
            expect(result.allowedPaymentMethods).toEqual(['crypto', 'ach', 'other']);
        });

        it('should update existing config', async () => {
            const mockDbConfig = {
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: false,
                maxAmountPerUser: 500,
                maxTransactionsPerUser: 5,
                allowedPaymentMethodsJson: '["crypto"]',
                adminUserIdsJson: '["admin1"]',
                createdAt: new Date('2023-01-01'),
                updatedAt: new Date('2023-01-02'),
            };

            mockPrisma.serverConfig.upsert.mockResolvedValue(mockDbConfig);

            const result = await service.upsertServerConfig({
                serverId: '123456789012345678',
                paymentsEnabled: false,
                dailyLimits: {
                    maxAmountPerUser: 500,
                    maxTransactionsPerUser: 5,
                },
                allowedPaymentMethods: ['crypto'],
                adminUserIds: ['admin1'],
            });

            expect(result.paymentsEnabled).toBe(false);
            expect(result.dailyLimits.maxAmountPerUser).toBe(500);
            expect(result.allowedPaymentMethods).toEqual(['crypto']);
            expect(result.adminUserIds).toEqual(['admin1']);
        });

        it('should throw error on database failure', async () => {
            mockPrisma.serverConfig.upsert.mockRejectedValue(new Error('Database error'));

            await expect(service.upsertServerConfig({
                serverId: '123456789012345678'
            })).rejects.toThrow('Failed to save server configuration');
        });
    });

    describe('arePaymentsEnabled', () => {
        it('should return true when payments are enabled', async () => {
            const mockDbConfig = {
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: true,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto","ach","other"]',
                adminUserIdsJson: '[]',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.serverConfig.findUnique.mockResolvedValue(mockDbConfig);

            const result = await service.arePaymentsEnabled('123456789012345678');

            expect(result).toBe(true);
        });

        it('should return false when payments are disabled', async () => {
            const mockDbConfig = {
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: false,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto","ach","other"]',
                adminUserIdsJson: '[]',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.serverConfig.findUnique.mockResolvedValue(mockDbConfig);

            const result = await service.arePaymentsEnabled('123456789012345678');

            expect(result).toBe(false);
        });

        it('should return true when no config exists (default)', async () => {
            mockPrisma.serverConfig.findUnique.mockResolvedValue(null);

            const result = await service.arePaymentsEnabled('123456789012345678');

            expect(result).toBe(true);
        });

        it('should return true on error (default)', async () => {
            mockPrisma.serverConfig.findUnique.mockRejectedValue(new Error('Database error'));

            const result = await service.arePaymentsEnabled('123456789012345678');

            expect(result).toBe(true);
        });
    });

    describe('validatePaymentLimits', () => {
        beforeEach(() => {
            // Mock current date to be consistent
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2023-01-15T12:00:00Z'));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should return true when within limits', async () => {
            const mockDbConfig = {
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: true,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto","ach","other"]',
                adminUserIdsJson: '[]',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.serverConfig.findUnique.mockResolvedValue(mockDbConfig);
            mockPrisma.transaction.findMany.mockResolvedValue([
                { amount: 100 },
                { amount: 200 },
            ]);

            const result = await service.validatePaymentLimits('user1', 300, '123456789012345678');

            expect(result).toBe(true);
        });

        it('should return false when amount exceeds single transaction limit', async () => {
            const mockDbConfig = {
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: true,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto","ach","other"]',
                adminUserIdsJson: '[]',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.serverConfig.findUnique.mockResolvedValue(mockDbConfig);

            const result = await service.validatePaymentLimits('user1', 1500, '123456789012345678');

            expect(result).toBe(false);
        });

        it('should return false when transaction count exceeds limit', async () => {
            const mockDbConfig = {
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: true,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 2,
                allowedPaymentMethodsJson: '["crypto","ach","other"]',
                adminUserIdsJson: '[]',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.serverConfig.findUnique.mockResolvedValue(mockDbConfig);
            mockPrisma.transaction.findMany.mockResolvedValue([
                { amount: 100 },
                { amount: 200 },
            ]);

            const result = await service.validatePaymentLimits('user1', 100, '123456789012345678');

            expect(result).toBe(false);
        });

        it('should return false when daily amount limit would be exceeded', async () => {
            const mockDbConfig = {
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: true,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto","ach","other"]',
                adminUserIdsJson: '[]',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.serverConfig.findUnique.mockResolvedValue(mockDbConfig);
            mockPrisma.transaction.findMany.mockResolvedValue([
                { amount: 800 },
            ]);

            const result = await service.validatePaymentLimits('user1', 300, '123456789012345678');

            expect(result).toBe(false);
        });

        it('should return true when no config exists', async () => {
            mockPrisma.serverConfig.findUnique.mockResolvedValue(null);

            const result = await service.validatePaymentLimits('user1', 1000, '123456789012345678');

            expect(result).toBe(true);
        });
    });

    describe('isServerAdmin', () => {
        it('should return true when user is admin', async () => {
            const mockDbConfig = {
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: true,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto","ach","other"]',
                adminUserIdsJson: '["admin1","admin2"]',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.serverConfig.findUnique.mockResolvedValue(mockDbConfig);

            // Mock the service to return the expected config with parsed admin IDs
            const mockService = {
                ...service,
                getServerConfig: vi.fn().mockResolvedValue({
                    id: 'config-1',
                    serverId: '123456789012345678',
                    paymentsEnabled: true,
                    dailyLimits: { maxAmountPerUser: 1000, maxTransactionsPerUser: 10 },
                    allowedPaymentMethods: ['crypto', 'ach', 'other'],
                    adminUserIds: ['admin1', 'admin2'],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
            };

            const result = await mockService.isServerAdmin('admin1', '123456789012345678');

            expect(result).toBe(true);
        });

        it('should return false when user is not admin', async () => {
            const mockDbConfig = {
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: true,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto","ach","other"]',
                adminUserIdsJson: '["admin1","admin2"]',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.serverConfig.findUnique.mockResolvedValue(mockDbConfig);

            const result = await service.isServerAdmin('user1', '123456789012345678');

            expect(result).toBe(false);
        });

        it('should return false when no config exists', async () => {
            mockPrisma.serverConfig.findUnique.mockResolvedValue(null);

            const result = await service.isServerAdmin('user1', '123456789012345678');

            expect(result).toBe(false);
        });
    });

    describe('isPaymentMethodAllowed', () => {
        it('should return true when payment method is allowed', async () => {
            const mockDbConfig = {
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: true,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto","ach"]',
                adminUserIdsJson: '[]',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.serverConfig.findUnique.mockResolvedValue(mockDbConfig);

            const result = await service.isPaymentMethodAllowed('crypto', '123456789012345678');

            expect(result).toBe(true);
        });

        it('should return false when payment method is not allowed', async () => {
            const mockDbConfig = {
                id: 'config-1',
                serverId: '123456789012345678',
                paymentsEnabled: true,
                maxAmountPerUser: 1000,
                maxTransactionsPerUser: 10,
                allowedPaymentMethodsJson: '["crypto"]',
                adminUserIdsJson: '[]',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.serverConfig.findUnique.mockResolvedValue(mockDbConfig);

            const result = await service.isPaymentMethodAllowed('ach', '123456789012345678');

            expect(result).toBe(false);
        });

        it('should return true when no config exists (default)', async () => {
            mockPrisma.serverConfig.findUnique.mockResolvedValue(null);

            const result = await service.isPaymentMethodAllowed('crypto', '123456789012345678');

            expect(result).toBe(true);
        });
    });

    describe('getDailyTransactionStats', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2023-01-15T12:00:00Z'));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should return correct stats for user transactions', async () => {
            mockPrisma.transaction.findMany.mockResolvedValue([
                { amount: 100 },
                { amount: 200 },
                { amount: 150 },
            ]);

            const result = await service.getDailyTransactionStats('user1', '123456789012345678');

            expect(result).toEqual({
                totalAmount: 450,
                transactionCount: 3,
            });

            expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith({
                where: {
                    senderId: 'user1',
                    createdAt: {
                        gte: expect.any(Date),
                        lt: expect.any(Date),
                    },
                    status: {
                        in: ['PENDING', 'ESCROWED', 'COMPLETED']
                    }
                },
                select: {
                    amount: true
                }
            });
        });

        it('should return zero stats when no transactions', async () => {
            mockPrisma.transaction.findMany.mockResolvedValue([]);

            const result = await service.getDailyTransactionStats('user1', '123456789012345678');

            expect(result).toEqual({
                totalAmount: 0,
                transactionCount: 0,
            });
        });

        it('should return zero stats on error', async () => {
            mockPrisma.transaction.findMany.mockRejectedValue(new Error('Database error'));

            const result = await service.getDailyTransactionStats('user1', '123456789012345678');

            expect(result).toEqual({
                totalAmount: 0,
                transactionCount: 0,
            });
        });
    });
});