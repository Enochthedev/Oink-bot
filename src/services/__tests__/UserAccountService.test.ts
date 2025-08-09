// Comprehensive unit tests for UserAccountService
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserAccountServiceImpl } from '../UserAccountService';
import { PaymentMethodType } from '../../models/UserAccount';
import { PrismaClient } from '@prisma/client';

// Mock Prisma client
const mockPrismaClient = {
    userAccount: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
    },
    paymentMethodConfig: {
        create: vi.fn(),
        delete: vi.fn(),
    },
    transaction: {
        findMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
};

// Mock database module
vi.mock('../../models/database', () => ({
    getPrismaClient: () => mockPrismaClient,
    withTransaction: vi.fn((callback) => callback(mockPrismaClient)),
}));

describe('UserAccountService', () => {
    let userAccountService: UserAccountServiceImpl;
    const testEncryptionKey = 'test-encryption-key-32-characters-long';

    beforeEach(() => {
        userAccountService = new UserAccountServiceImpl(testEncryptionKey);
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('createAccount', () => {
        it('should create a new user account successfully', async () => {
            const discordId = '123456789012345678';
            const mockDbUser = {
                id: 'user_123',
                discordId,
                enableDMNotifications: true,
                enableChannelNotifications: false,
                isSetupComplete: false,
                isPublicProfile: false,
                lastActivityAt: undefined,
                createdAt: new Date(),
                updatedAt: new Date(),
                paymentMethods: [],
            };

            mockPrismaClient.userAccount.findUnique.mockResolvedValue(null);
            mockPrismaClient.userAccount.create.mockResolvedValue(mockDbUser);

            const result = await userAccountService.createAccount(discordId);

            expect(result).toEqual({
                id: 'user_123',
                discordId,
                paymentMethods: [],
                notificationPreferences: {
                    enableDMNotifications: true,
                    enableChannelNotifications: false,
                },
                isSetupComplete: false,
                isPublicProfile: false,
                lastActivityAt: undefined,
                createdAt: mockDbUser.createdAt,
                updatedAt: mockDbUser.updatedAt,
            });

            expect(mockPrismaClient.userAccount.create).toHaveBeenCalledWith({
                data: {
                    discordId,
                    transactionHistoryJson: '[]',
                    enableDMNotifications: true,
                    enableChannelNotifications: false,
                },
                include: { paymentMethods: true },
            });
        });

        it('should throw error for invalid Discord ID', async () => {
            const invalidDiscordId = 'invalid-id';

            await expect(userAccountService.createAccount(invalidDiscordId))
                .rejects.toThrow('Invalid Discord ID format');

            expect(mockPrismaClient.userAccount.findUnique).not.toHaveBeenCalled();
        });

        it('should throw error if account already exists', async () => {
            const discordId = '123456789012345678';
            const existingUser = { id: 'user_123', discordId };

            mockPrismaClient.userAccount.findUnique.mockResolvedValue(existingUser);

            await expect(userAccountService.createAccount(discordId))
                .rejects.toThrow('Account already exists for this Discord ID');

            expect(mockPrismaClient.userAccount.create).not.toHaveBeenCalled();
        });
    });

    describe('getAccount', () => {
        it('should retrieve user account successfully', async () => {
            const discordId = '123456789012345678';
            const mockDbUser = {
                id: 'user_123',
                discordId,
                transactionHistoryJson: '["tx1", "tx2"]',
                enableDMNotifications: true,
                enableChannelNotifications: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                paymentMethods: [
                    {
                        id: 'pm_123',
                        type: 'CRYPTO',
                        displayName: 'Bitcoin Wallet',
                        encryptedDetails: 'encrypted_data',
                        isActive: true,
                        addedAt: new Date(),
                    },
                ],
            };

            mockPrismaClient.userAccount.findUnique.mockResolvedValue(mockDbUser);

            const result = await userAccountService.getAccount(discordId);

            expect(result).toEqual({
                id: 'user_123',
                discordId,
                paymentMethods: [
                    {
                        id: 'pm_123',
                        type: 'CRYPTO',
                        displayName: 'Bitcoin Wallet',
                        encryptedDetails: 'encrypted_data',
                        isActive: true,
                        addedAt: mockDbUser.paymentMethods[0].addedAt,
                    },
                ],
                notificationPreferences: {
                    enableDMNotifications: true,
                    enableChannelNotifications: false,
                },
                isSetupComplete: false,
                isPublicProfile: false,
                lastActivityAt: undefined,
                createdAt: mockDbUser.createdAt,
                updatedAt: mockDbUser.updatedAt,
            });
        });

        it('should return null for non-existent user', async () => {
            const discordId = '123456789012345678';

            mockPrismaClient.userAccount.findUnique.mockResolvedValue(null);

            const result = await userAccountService.getAccount(discordId);

            expect(result).toBeNull();
        });

        it('should throw error for invalid Discord ID', async () => {
            const invalidDiscordId = 'invalid-id';

            await expect(userAccountService.getAccount(invalidDiscordId))
                .rejects.toThrow('Invalid Discord ID format');
        });
    });

    describe('addPaymentMethod', () => {
        it('should add crypto payment method successfully', async () => {
            const discordId = '123456789012345678';
            const paymentMethod = {
                type: 'CRYPTO' as PaymentMethodType,
                displayName: 'Bitcoin Wallet',
                encryptedDetails: {
                    cryptoType: 'BTC',
                    walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
                },
                isActive: true,
            };

            const mockUserAccount = {
                id: 'user_123',
                discordId,
                paymentMethods: [],
            };

            const mockCreatedPaymentMethod = {
                id: 'pm_123',
                userId: 'user_123',
                type: 'CRYPTO',
                displayName: 'Bitcoin Wallet',
                encryptedDetails: 'encrypted_data',
                isActive: true,
                addedAt: new Date(),
            };

            mockPrismaClient.userAccount.findUnique.mockResolvedValue(mockUserAccount);
            mockPrismaClient.paymentMethodConfig.create.mockResolvedValue(mockCreatedPaymentMethod);

            const result = await userAccountService.addPaymentMethod(discordId, paymentMethod);

            expect(result).toEqual({
                id: 'pm_123',
                type: 'CRYPTO',
                displayName: 'Bitcoin Wallet',
                encryptedDetails: 'encrypted_data',
                isActive: true,
                addedAt: mockCreatedPaymentMethod.addedAt,
            });
        });

        it('should add ACH payment method successfully', async () => {
            const discordId = '123456789012345678';
            const paymentMethod = {
                type: 'ACH' as PaymentMethodType,
                displayName: 'Checking Account',
                encryptedDetails: {
                    routingNumber: '123456789',
                    accountNumber: '1234567890',
                    accountType: 'checking',
                },
                isActive: true,
            };

            const mockUserAccount = {
                id: 'user_123',
                discordId,
                paymentMethods: [],
            };

            const mockCreatedPaymentMethod = {
                id: 'pm_124',
                userId: 'user_123',
                type: 'ACH',
                displayName: 'Checking Account',
                encryptedDetails: 'encrypted_data',
                isActive: true,
                addedAt: new Date(),
            };

            mockPrismaClient.userAccount.findUnique.mockResolvedValue(mockUserAccount);
            mockPrismaClient.paymentMethodConfig.create.mockResolvedValue(mockCreatedPaymentMethod);

            const result = await userAccountService.addPaymentMethod(discordId, paymentMethod);

            expect(result.type).toBe('ACH');
            expect(result.displayName).toBe('Checking Account');
        });

        it('should throw error for duplicate payment method', async () => {
            const discordId = '123456789012345678';
            const paymentMethod = {
                type: 'CRYPTO' as PaymentMethodType,
                displayName: 'Bitcoin Wallet',
                encryptedDetails: {
                    cryptoType: 'BTC',
                    walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
                },
                isActive: true,
            };

            const mockUserAccount = {
                id: 'user_123',
                discordId,
                paymentMethods: [
                    {
                        id: 'pm_existing',
                        type: 'CRYPTO',
                        displayName: 'Bitcoin Wallet',
                        encryptedDetails: 'existing_data',
                        isActive: true,
                        addedAt: new Date(),
                    },
                ],
            };

            mockPrismaClient.userAccount.findUnique.mockResolvedValue(mockUserAccount);

            await expect(userAccountService.addPaymentMethod(discordId, paymentMethod))
                .rejects.toThrow('Payment method with this name already exists');
        });

        it('should throw error for user not found', async () => {
            const discordId = '123456789012345678';
            const paymentMethod = {
                type: 'CRYPTO' as PaymentMethodType,
                displayName: 'Bitcoin Wallet',
                encryptedDetails: {
                    cryptoType: 'BTC',
                    walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
                },
                isActive: true,
            };

            mockPrismaClient.userAccount.findUnique.mockResolvedValue(null);

            await expect(userAccountService.addPaymentMethod(discordId, paymentMethod))
                .rejects.toThrow('User account not found');
        });
    });

    describe('removePaymentMethod', () => {
        it('should remove payment method successfully', async () => {
            const discordId = '123456789012345678';
            const methodId = 'pm_123';

            const mockUserAccount = {
                id: 'user_123',
                discordId,
                paymentMethods: [
                    {
                        id: 'pm_123',
                        type: 'CRYPTO',
                        displayName: 'Bitcoin Wallet',
                        encryptedDetails: 'encrypted_data',
                        isActive: true,
                        addedAt: new Date(),
                    },
                ],
            };

            mockPrismaClient.userAccount.findUnique.mockResolvedValue(mockUserAccount);
            mockPrismaClient.transaction.findMany.mockResolvedValue([]);
            mockPrismaClient.paymentMethodConfig.delete.mockResolvedValue({});

            await userAccountService.removePaymentMethod(discordId, methodId);

            expect(mockPrismaClient.paymentMethodConfig.delete).toHaveBeenCalledWith({
                where: { id: methodId },
            });
        });

        it('should throw error if payment method has active transactions', async () => {
            const discordId = '123456789012345678';
            const methodId = 'pm_123';

            const mockUserAccount = {
                id: 'user_123',
                discordId,
                paymentMethods: [
                    {
                        id: 'pm_123',
                        type: 'CRYPTO',
                        displayName: 'Bitcoin Wallet',
                        encryptedDetails: 'encrypted_data',
                        isActive: true,
                        addedAt: new Date(),
                    },
                ],
            };

            const mockActiveTransactions = [
                { id: 'tx_123', status: 'PENDING' },
            ];

            mockPrismaClient.userAccount.findUnique.mockResolvedValue(mockUserAccount);
            mockPrismaClient.transaction.findMany.mockResolvedValue(mockActiveTransactions);

            await expect(userAccountService.removePaymentMethod(discordId, methodId))
                .rejects.toThrow('Cannot remove payment method with active transactions');

            expect(mockPrismaClient.paymentMethodConfig.delete).not.toHaveBeenCalled();
        });

        it('should throw error if payment method not found', async () => {
            const discordId = '123456789012345678';
            const methodId = 'pm_nonexistent';

            const mockUserAccount = {
                id: 'user_123',
                discordId,
                paymentMethods: [],
            };

            mockPrismaClient.userAccount.findUnique.mockResolvedValue(mockUserAccount);

            await expect(userAccountService.removePaymentMethod(discordId, methodId))
                .rejects.toThrow('Payment method not found or does not belong to user');
        });
    });

    describe('updateNotificationPreferences', () => {
        it('should update notification preferences successfully', async () => {
            const discordId = '123456789012345678';
            const preferences = {
                enableDMNotifications: false,
                enableChannelNotifications: true,
            };

            const mockUpdatedUser = {
                id: 'user_123',
                discordId,
                enableDMNotifications: false,
                enableChannelNotifications: true,
            };

            mockPrismaClient.userAccount.update.mockResolvedValue(mockUpdatedUser);

            await userAccountService.updateNotificationPreferences(discordId, preferences);

            expect(mockPrismaClient.userAccount.update).toHaveBeenCalledWith({
                where: { discordId },
                data: {
                    enableDMNotifications: false,
                    enableChannelNotifications: true,
                },
            });
        });

        it('should update partial notification preferences', async () => {
            const discordId = '123456789012345678';
            const preferences = {
                enableDMNotifications: false,
            };

            const mockUpdatedUser = {
                id: 'user_123',
                discordId,
                enableDMNotifications: false,
            };

            mockPrismaClient.userAccount.update.mockResolvedValue(mockUpdatedUser);

            await userAccountService.updateNotificationPreferences(discordId, preferences);

            expect(mockPrismaClient.userAccount.update).toHaveBeenCalledWith({
                where: { discordId },
                data: {
                    enableDMNotifications: false,
                },
            });
        });

        it('should throw error for invalid Discord ID', async () => {
            const invalidDiscordId = 'invalid-id';
            const preferences = { enableDMNotifications: false };

            await expect(userAccountService.updateNotificationPreferences(invalidDiscordId, preferences))
                .rejects.toThrow('Invalid Discord ID format');
        });
    });

    describe('validatePaymentMethod', () => {
        it('should validate crypto payment method correctly', async () => {
            const validCryptoDetails = {
                cryptoType: 'BTC',
                walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
            };

            const result = await userAccountService.validatePaymentMethod('CRYPTO', validCryptoDetails);
            expect(result).toBe(true);
        });

        it('should reject invalid crypto payment method', async () => {
            const invalidCryptoDetails = {
                cryptoType: 'INVALID',
                walletAddress: 'short',
            };

            const result = await userAccountService.validatePaymentMethod('CRYPTO', invalidCryptoDetails);
            expect(result).toBe(false);
        });

        it('should validate ACH payment method correctly', async () => {
            const validACHDetails = {
                routingNumber: '123456789',
                accountNumber: '1234567890',
                accountType: 'checking',
            };

            const result = await userAccountService.validatePaymentMethod('ACH', validACHDetails);
            expect(result).toBe(true);
        });

        it('should reject invalid ACH payment method', async () => {
            const invalidACHDetails = {
                routingNumber: '12345', // Too short
                accountNumber: '123',   // Too short
                accountType: 'invalid',
            };

            const result = await userAccountService.validatePaymentMethod('ACH', invalidACHDetails);
            expect(result).toBe(false);
        });

        it('should validate other payment method correctly', async () => {
            const validOtherDetails = {
                provider: 'PayPal',
                accountId: 'user@example.com',
            };

            const result = await userAccountService.validatePaymentMethod('OTHER', validOtherDetails);
            expect(result).toBe(true);
        });

        it('should reject invalid other payment method', async () => {
            const invalidOtherDetails = {
                provider: 'P', // Too short
                accountId: 'ab', // Too short
            };

            const result = await userAccountService.validatePaymentMethod('OTHER', invalidOtherDetails);
            expect(result).toBe(false);
        });
    });

    describe('encryption and decryption', () => {
        it('should encrypt and decrypt payment details correctly', () => {
            const originalDetails = {
                cryptoType: 'BTC',
                walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
            };

            const encrypted = userAccountService.encryptPaymentDetails(originalDetails);
            expect(encrypted).toBeTruthy();
            expect(encrypted).not.toEqual(JSON.stringify(originalDetails));

            const decrypted = userAccountService.decryptPaymentDetails(encrypted);
            expect(decrypted).toEqual(originalDetails);
        });

        it('should throw error for invalid encrypted data format', () => {
            const invalidEncryptedData = 'invalid';

            expect(() => userAccountService.decryptPaymentDetails(invalidEncryptedData))
                .toThrow('Failed to decrypt payment details');
        });
    });

    describe('Payment Method Data Fetching', () => {
        beforeEach(async () => {
            // Set up mock for createAccount
            const mockDbUser = {
                id: 'user_123',
                discordId: '123456789012345678',
                enableDMNotifications: true,
                enableChannelNotifications: false,
                isSetupComplete: false,
                isPublicProfile: false,
                lastActivityAt: undefined,
                createdAt: new Date(),
                updatedAt: new Date(),
                paymentMethods: [],
            };

            mockPrismaClient.userAccount.findUnique.mockResolvedValue(null);
            mockPrismaClient.userAccount.create.mockResolvedValue(mockDbUser);

            const result = await userAccountService.createAccount('123456789012345678');

            expect(result).toEqual({
                id: 'user_123',
                discordId: '123456789012345678',
                paymentMethods: [],
                notificationPreferences: {
                    enableDMNotifications: true,
                    enableChannelNotifications: false,
                },
                isSetupComplete: false,
                isPublicProfile: false,
                lastActivityAt: undefined,
                createdAt: mockDbUser.createdAt,
                updatedAt: mockDbUser.updatedAt,
            });

            // Set up mock for addPaymentMethod calls
            const mockPaymentMethods = [
                {
                    id: 'pm_1',
                    userId: 'user_123',
                    type: 'CRYPTO',
                    displayName: 'My Bitcoin Wallet',
                    encryptedDetails: 'encrypted_crypto_data',
                    isActive: true,
                    addedAt: new Date(),
                },
                {
                    id: 'pm_2',
                    userId: 'user_123',
                    type: 'ACH',
                    displayName: 'My Bank Account',
                    encryptedDetails: 'encrypted_ach_data',
                    isActive: true,
                    addedAt: new Date(),
                },
                {
                    id: 'pm_3',
                    userId: 'user_123',
                    type: 'OTHER',
                    displayName: 'PayPal',
                    encryptedDetails: 'encrypted_paypal_data',
                    isActive: false,
                    addedAt: new Date(),
                }
            ];

            // Mock the findUnique calls for addPaymentMethod
            mockPrismaClient.userAccount.findUnique.mockResolvedValue({
                ...mockDbUser,
                paymentMethods: mockPaymentMethods
            });

            // Mock the create calls for addPaymentMethod
            mockPrismaClient.paymentMethodConfig.create
                .mockResolvedValueOnce(mockPaymentMethods[0])
                .mockResolvedValueOnce(mockPaymentMethods[1])
                .mockResolvedValueOnce(mockPaymentMethods[2]);

            // Add test payment methods
            await userAccountService.addPaymentMethod('123456789012345678', {
                type: 'CRYPTO',
                displayName: 'My Bitcoin Wallet',
                encryptedDetails: { walletAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', network: 'bitcoin' },
                isActive: true,
            });

            await userAccountService.addPaymentMethod('123456789012345678', {
                type: 'ACH',
                displayName: 'My Bank Account',
                encryptedDetails: { accountNumber: '1234567890', routingNumber: '123456789', accountType: 'checking' },
                isActive: true,
            });

            await userAccountService.addPaymentMethod('123456789012345678', {
                type: 'OTHER',
                displayName: 'PayPal',
                encryptedDetails: { provider: 'PayPal', accountId: 'user@example.com' },
                isActive: false,
            });
        });

        describe('getPaymentMethods', () => {
            it('should return all payment methods for a user', async () => {
                const paymentMethods = await userAccountService.getPaymentMethods('123456789012345678');

                expect(paymentMethods).toHaveLength(3);
                expect(paymentMethods.map(pm => pm.displayName)).toEqual([
                    'My Bitcoin Wallet',
                    'My Bank Account',
                    'PayPal'
                ]);
            });

            it('should throw error for invalid Discord ID', async () => {
                await expect(userAccountService.getPaymentMethods('invalid-id'))
                    .rejects.toThrow('Invalid Discord ID format');
            });

            it('should throw error for non-existent user', async () => {
                await expect(userAccountService.getPaymentMethods('987654321098765432'))
                    .rejects.toThrow('User account not found');
            });
        });

        describe('getPaymentMethod', () => {
            it('should return a specific payment method by ID', async () => {
                const allMethods = await userAccountService.getPaymentMethods('123456789012345678');
                const firstMethod = allMethods[0];

                const paymentMethod = await userAccountService.getPaymentMethod('123456789012345678', firstMethod.id);

                expect(paymentMethod).toBeDefined();
                expect(paymentMethod?.id).toBe(firstMethod.id);
                expect(paymentMethod?.displayName).toBe(firstMethod.displayName);
            });

            it('should return null for non-existent payment method ID', async () => {
                const paymentMethod = await userAccountService.getPaymentMethod('123456789012345678', 'non-existent-id');
                expect(paymentMethod).toBeNull();
            });

            it('should throw error for invalid Discord ID', async () => {
                await expect(userAccountService.getPaymentMethod('invalid-id', 'some-id'))
                    .rejects.toThrow('Invalid Discord ID format');
            });

            it('should throw error for invalid method ID', async () => {
                await expect(userAccountService.getPaymentMethod('123456789012345678', ''))
                    .rejects.toThrow('Invalid payment method ID');
            });
        });

        describe('listActivePaymentMethods', () => {
            it('should return only active payment methods', async () => {
                const activeMethods = await userAccountService.listActivePaymentMethods('123456789012345678');

                expect(activeMethods).toHaveLength(2);
                expect(activeMethods.map(pm => pm.displayName)).toEqual([
                    'My Bitcoin Wallet',
                    'My Bank Account'
                ]);

                // Should not include inactive PayPal method
                expect(activeMethods.find(pm => pm.displayName === 'PayPal')).toBeUndefined();
            });

            it('should return empty array for user with no active payment methods', async () => {
                // Deactivate all payment methods
                const allMethods = await userAccountService.getPaymentMethods('123456789012345678');
                for (const method of allMethods) {
                    await userAccountService.removePaymentMethod('123456789012345678', method.id);
                }

                const activeMethods = await userAccountService.listActivePaymentMethods('123456789012345678');
                expect(activeMethods).toHaveLength(0);
            });

            it('should throw error for invalid Discord ID', async () => {
                await expect(userAccountService.listActivePaymentMethods('invalid-id'))
                    .rejects.toThrow('Invalid Discord ID format');
            });

            it('should throw error for non-existent user', async () => {
                await expect(userAccountService.listActivePaymentMethods('987654321098765432'))
                    .rejects.toThrow('User account not found');
            });
        });
    });
});