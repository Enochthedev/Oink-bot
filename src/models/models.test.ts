// Comprehensive tests for data models and validation functions
import { describe, it, expect } from 'vitest';
import {
    PaymentMethodConfig,
    isValidPaymentMethodType,
    isValidDiscordId,
    isValidPaymentMethodConfig,
    parseTransactionHistory,
    stringifyTransactionHistory,
    dbToUserAccount,
    userAccountToDb,
} from './UserAccount';
import {
    ServerConfig,
    isValidServerId,
    isValidServerConfig,
    parseAllowedPaymentMethods,
    parseAdminUserIds,
    dbToServerConfig,
    serverConfigToDb,
} from './ServerConfig';
import {
    isValidTransactionStatus,
    isValidAmount,
    isValidCurrency,
    isValidFeeBreakdown,
    calculateTotalFees,
    createFeeBreakdown,
    dbToTransaction,
    transactionToDb,
} from './Transaction';
import {
    EscrowRecord,
    EscrowStatus,
    isValidEscrowStatus,
    isValidExternalTransactionId,
    isEscrowExpired,
    dbToEscrowRecord,
    escrowRecordToDb,
} from './EscrowRecord';

describe('UserAccount Model', () => {
    describe('Validation Functions', () => {
        it('should validate payment method types', () => {
            expect(isValidPaymentMethodType('crypto')).toBe(true);
            expect(isValidPaymentMethodType('ach')).toBe(true);
            expect(isValidPaymentMethodType('other')).toBe(true);
            expect(isValidPaymentMethodType('invalid')).toBe(false);
            expect(isValidPaymentMethodType('')).toBe(false);
        });

        it('should validate Discord IDs', () => {
            expect(isValidDiscordId('123456789012345678')).toBe(true);
            expect(isValidDiscordId('1234567890123456789')).toBe(true);
            expect(isValidDiscordId('12345678901234567')).toBe(true);
            expect(isValidDiscordId('123456789012345')).toBe(false);
            expect(isValidDiscordId('12345678901234567890')).toBe(false);
            expect(isValidDiscordId('invalid')).toBe(false);
        });

        it('should validate payment method config', () => {
            const validConfig: PaymentMethodConfig = {
                id: 'pm_123',
                type: 'crypto',
                displayName: 'Bitcoin Wallet',
                encryptedDetails: 'encrypted_data',
                isActive: true,
                addedAt: new Date(),
            };
            expect(isValidPaymentMethodConfig(validConfig)).toBe(true);
            expect(isValidPaymentMethodConfig({ ...validConfig, type: 'invalid' })).toBe(false);
            expect(isValidPaymentMethodConfig({ ...validConfig, id: 123 })).toBe(false);
        });
    });

    describe('JSON Array Helpers', () => {
        it('should parse transaction history correctly', () => {
            expect(parseTransactionHistory('["tx1", "tx2"]')).toEqual(['tx1', 'tx2']);
            expect(parseTransactionHistory('[]')).toEqual([]);
            expect(parseTransactionHistory('invalid')).toEqual([]);
            expect(parseTransactionHistory('["tx1", 123, "tx2"]')).toEqual(['tx1', 'tx2']);
        });

        it('should stringify transaction history correctly', () => {
            expect(stringifyTransactionHistory(['tx1', 'tx2'])).toBe('["tx1","tx2"]');
            expect(stringifyTransactionHistory([])).toBe('[]');
        });
    });
});

describe('ServerConfig Model', () => {
    describe('Validation Functions', () => {
        it('should validate server IDs', () => {
            expect(isValidServerId('123456789012345678')).toBe(true);
            expect(isValidServerId('invalid')).toBe(false);
        });

        it('should validate server config', () => {
            const validConfig: ServerConfig = {
                id: 'sc_123',
                serverId: '123456789012345678',
                paymentsEnabled: true,
                dailyLimits: {
                    maxAmountPerUser: 1000,
                    maxTransactionsPerUser: 10,
                },
                allowedPaymentMethods: ['crypto', 'ach'],
                adminUserIds: ['123456789012345678'],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            expect(isValidServerConfig(validConfig)).toBe(true);
            expect(isValidServerConfig({ ...validConfig, serverId: 'invalid' })).toBe(false);
        });
    });

    describe('JSON Array Helpers', () => {
        it('should parse allowed payment methods correctly', () => {
            expect(parseAllowedPaymentMethods('["crypto", "ach"]')).toEqual(['crypto', 'ach']);
            expect(parseAllowedPaymentMethods('invalid')).toEqual(['crypto', 'ach', 'other']);
        });

        it('should parse admin user IDs correctly', () => {
            expect(parseAdminUserIds('["123456789012345678"]')).toEqual(['123456789012345678']);
            expect(parseAdminUserIds('invalid')).toEqual([]);
        });
    });
});

describe('Transaction Model', () => {
    describe('Validation Functions', () => {
        it('should validate transaction status', () => {
            expect(isValidTransactionStatus('PENDING')).toBe(true);
            expect(isValidTransactionStatus('COMPLETED')).toBe(true);
            expect(isValidTransactionStatus('invalid')).toBe(false);
        });

        it('should validate amounts', () => {
            expect(isValidAmount(100)).toBe(true);
            expect(isValidAmount(0.01)).toBe(true);
            expect(isValidAmount(0)).toBe(false);
            expect(isValidAmount(-100)).toBe(false);
            expect(isValidAmount(Infinity)).toBe(false);
        });

        it('should validate currency codes', () => {
            expect(isValidCurrency('USD')).toBe(true);
            expect(isValidCurrency('EUR')).toBe(true);
            expect(isValidCurrency('BTC')).toBe(true);
            expect(isValidCurrency('usd')).toBe(false);
            expect(isValidCurrency('USDT')).toBe(false);
            expect(isValidCurrency('')).toBe(false);
        });

        it('should validate fee breakdown', () => {
            const validFees = { processingFee: 1.5, escrowFee: 0.5, total: 2.0 };
            expect(isValidFeeBreakdown(validFees)).toBe(true);
            expect(isValidFeeBreakdown({ ...validFees, total: 3.0 })).toBe(false);
            expect(isValidFeeBreakdown({ ...validFees, processingFee: -1 })).toBe(false);
        });
    });

    describe('Fee Calculations', () => {
        it('should calculate total fees correctly', () => {
            expect(calculateTotalFees(1.5, 0.5)).toBe(2.0);
            expect(calculateTotalFees(1.234, 0.567)).toBe(1.8);
        });

        it('should create fee breakdown correctly', () => {
            const fees = createFeeBreakdown(1.234, 0.567);
            expect(fees.processingFee).toBe(1.23);
            expect(fees.escrowFee).toBe(0.57);
            expect(fees.total).toBe(1.8);
        });
    });
});

describe('EscrowRecord Model', () => {
    describe('Validation Functions', () => {
        it('should validate escrow status', () => {
            expect(isValidEscrowStatus('HOLDING')).toBe(true);
            expect(isValidEscrowStatus('RELEASED')).toBe(true);
            expect(isValidEscrowStatus('invalid')).toBe(false);
        });

        it('should validate external transaction IDs', () => {
            expect(isValidExternalTransactionId('ext_123')).toBe(true);
            expect(isValidExternalTransactionId('')).toBe(false);
            expect(isValidExternalTransactionId('a'.repeat(256))).toBe(false);
        });
    });

    describe('Escrow Expiration', () => {
        it('should detect expired escrow records', () => {
            const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
            const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago

            const expiredRecord: EscrowRecord = {
                id: 'er_123',
                transactionId: 'tx_123',
                amount: 100,
                currency: 'USD',
                paymentMethod: 'crypto',
                externalTransactionId: 'ext_123',
                status: EscrowStatus.HOLDING,
                createdAt: oldDate,
            };

            const activeRecord: EscrowRecord = {
                ...expiredRecord,
                createdAt: recentDate,
            };

            expect(isEscrowExpired(expiredRecord)).toBe(true);
            expect(isEscrowExpired(activeRecord)).toBe(false);
            expect(isEscrowExpired({ ...expiredRecord, status: EscrowStatus.RELEASED })).toBe(false);
        });

        it('should calculate release time correctly', () => {
            const createdAt = new Date('2023-01-01T00:00:00Z');
            const releaseTime = calculateReleaseTime(createdAt, 24);
            expect(releaseTime).toEqual(new Date('2023-01-02T00:00:00Z'));
        });
    });
});

describe('Model Conversions', () => {
    it('should convert between DB and domain models for UserAccount', () => {
        const dbUser = {
            id: 'user_123',
            discordId: '123456789012345678',
            transactionHistoryJson: '["tx1", "tx2"]',
            enableDMNotifications: true,
            enableChannelNotifications: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const domainUser = dbToUserAccount(dbUser);
        expect(domainUser.transactionHistory).toEqual(['tx1', 'tx2']);
        expect(domainUser.notificationPreferences.enableDMNotifications).toBe(true);

        const backToDb = userAccountToDb(domainUser);
        expect(backToDb.transactionHistoryJson).toBe('["tx1","tx2"]');
    });

    it('should convert between DB and domain models for ServerConfig', () => {
        const dbConfig = {
            id: 'sc_123',
            serverId: '123456789012345678',
            paymentsEnabled: true,
            maxAmountPerUser: 1000,
            maxTransactionsPerUser: 10,
            allowedPaymentMethodsJson: '["crypto", "ach"]',
            adminUserIdsJson: '["123456789012345678"]',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const domainConfig = dbToServerConfig(dbConfig);
        expect(domainConfig.allowedPaymentMethods).toEqual(['crypto', 'ach']);
        expect(domainConfig.adminUserIds).toEqual(['123456789012345678']);

        const backToDb = serverConfigToDb(domainConfig);
        expect(backToDb.allowedPaymentMethodsJson).toBe('["crypto","ach"]');
    });
});