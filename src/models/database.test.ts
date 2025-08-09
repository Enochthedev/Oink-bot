// Database integration tests
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { getPrismaClient, connectDatabase, disconnectDatabase, checkDatabaseHealth } from './database';
import { dbToUserAccount, dbToServerConfig, dbToTransaction, dbToEscrowRecord } from './index';

describe('Database Integration', () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
        await connectDatabase();
        prisma = getPrismaClient();
    });

    afterAll(async () => {
        await disconnectDatabase();
    });

    it('should connect to database successfully', async () => {
        const isHealthy = await checkDatabaseHealth();
        expect(isHealthy).toBe(true);
    });

    it('should retrieve user accounts with relationships', async () => {
        const users = await prisma.userAccount.findMany({
            include: {
                paymentMethods: true,
                sentTransactions: true,
                receivedTransactions: true,
            },
        });

        expect(users.length).toBeGreaterThan(0);

        const user = users[0];
        expect(user.discordId).toMatch(/^\d{17,19}$/);
        expect(Array.isArray(user.paymentMethods)).toBe(true);

        // Test conversion to domain model
        const domainUser = dbToUserAccount(user, user.paymentMethods);
        expect(domainUser.id).toBe(user.id);
        expect(domainUser.discordId).toBe(user.discordId);
        expect(Array.isArray(domainUser.transactionHistory)).toBe(true);
    });

    it('should retrieve server configs', async () => {
        const configs = await prisma.serverConfig.findMany();
        expect(configs.length).toBeGreaterThan(0);

        const config = configs[0];
        expect(config.serverId).toMatch(/^\d{17,19}$/);

        // Test conversion to domain model
        const domainConfig = dbToServerConfig(config);
        expect(domainConfig.id).toBe(config.id);
        expect(domainConfig.serverId).toBe(config.serverId);
        expect(Array.isArray(domainConfig.allowedPaymentMethods)).toBe(true);
        expect(Array.isArray(domainConfig.adminUserIds)).toBe(true);
    });

    it('should retrieve transactions with relationships', async () => {
        const transactions = await prisma.transaction.findMany({
            include: {
                sender: true,
                recipient: true,
                senderPaymentMethod: true,
                recipientPaymentMethod: true,
                escrowRecord: true,
            },
        });

        expect(transactions.length).toBeGreaterThan(0);

        const transaction = transactions[0];
        expect(transaction.amount).toBeGreaterThan(0);
        expect(transaction.sender).toBeDefined();
        expect(transaction.recipient).toBeDefined();
        expect(transaction.senderPaymentMethod).toBeDefined();

        // Test conversion to domain model
        const domainTransaction = dbToTransaction(
            transaction,
            transaction.senderPaymentMethod,
            transaction.recipientPaymentMethod || undefined,
            transaction.escrowRecord ? dbToEscrowRecord(transaction.escrowRecord) : undefined
        );
        expect(domainTransaction.id).toBe(transaction.id);
        expect(domainTransaction.amount).toBe(transaction.amount);
        expect(domainTransaction.fees.total).toBe(transaction.totalFees);
    });

    it('should retrieve escrow records with relationships', async () => {
        const escrowRecords = await prisma.escrowRecord.findMany({
            include: {
                transaction: true,
            },
        });

        expect(escrowRecords.length).toBeGreaterThan(0);

        const escrowRecord = escrowRecords[0];
        expect(escrowRecord.amount).toBeGreaterThan(0);
        expect(escrowRecord.transaction).toBeDefined();

        // Test conversion to domain model
        const domainEscrow = dbToEscrowRecord(escrowRecord);
        expect(domainEscrow.id).toBe(escrowRecord.id);
        expect(domainEscrow.transactionId).toBe(escrowRecord.transactionId);
        expect(domainEscrow.amount).toBe(escrowRecord.amount);
    });

    it('should handle database transactions', async () => {
        const result = await prisma.$transaction(async (tx) => {
            const userCount = await tx.userAccount.count();
            const transactionCount = await tx.transaction.count();
            return { userCount, transactionCount };
        });

        expect(result.userCount).toBeGreaterThan(0);
        expect(result.transactionCount).toBeGreaterThan(0);
    });

    it('should enforce unique constraints', async () => {
        const existingUser = await prisma.userAccount.findFirst();
        expect(existingUser).toBeDefined();

        // Try to create a user with the same Discord ID
        await expect(
            prisma.userAccount.create({
                data: {
                    discordId: existingUser!.discordId,
                    transactionHistoryJson: '[]',
                    enableDMNotifications: true,
                    enableChannelNotifications: false,
                },
            })
        ).rejects.toThrow();
    });

    it('should enforce foreign key constraints', async () => {
        // Try to create a payment method with invalid user ID
        await expect(
            prisma.paymentMethodConfig.create({
                data: {
                    userId: 'invalid_user_id',
                    type: 'CRYPTO',
                    displayName: 'Test Wallet',
                    encryptedDetails: 'encrypted_data',
                    isActive: true,
                },
            })
        ).rejects.toThrow();
    });
});