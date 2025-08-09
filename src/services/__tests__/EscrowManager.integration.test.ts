// EscrowManager integration tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EscrowManagerImpl } from '../EscrowManager';
import { EscrowStatus } from '../../models/EscrowRecord';
import { TransactionStatus } from '../../models/Transaction';
import { PaymentMethodType } from '@prisma/client';
import { PaymentProcessorFactory } from '../../processors/PaymentProcessorFactory';
import { PaymentProcessor } from '../../processors/PaymentProcessor';
import { getPrismaClient } from '../../models/database';

// Mock payment processor for integration tests
const mockPaymentProcessor: PaymentProcessor = {
    validatePaymentMethod: vi.fn().mockResolvedValue(true),
    withdrawFunds: vi.fn().mockResolvedValue({
        success: true,
        transactionId: 'ext-withdraw-123',
    }),
    depositFunds: vi.fn().mockResolvedValue({
        success: true,
        transactionId: 'ext-deposit-123',
    }),
    getProcessingTime: vi.fn().mockResolvedValue({
        minMinutes: 5,
        maxMinutes: 30,
    }),
    calculateFees: vi.fn().mockResolvedValue({
        processingFee: 2.50,
        percentage: 2.5,
        total: 2.50,
    }),
};

const mockPaymentProcessorFactory = {
    getProcessor: vi.fn().mockReturnValue(mockPaymentProcessor),
    getSupportedMethods: vi.fn().mockReturnValue([PaymentMethodType.CRYPTO, PaymentMethodType.ACH]),
} as PaymentProcessorFactory;

describe('EscrowManager Integration Tests', () => {
    let escrowManager: EscrowManagerImpl;
    let prisma: ReturnType<typeof getPrismaClient>;
    let testUserId1: string;
    let testUserId2: string;
    let testPaymentMethodId1: string;
    let testPaymentMethodId2: string;
    let testTransactionId: string;

    beforeEach(async () => {
        prisma = getPrismaClient();
        escrowManager = new EscrowManagerImpl(mockPaymentProcessorFactory, 24);

        // Clean up any existing test data
        await prisma.escrowRecord.deleteMany({
            where: {
                transactionId: {
                    startsWith: 'test-',
                },
            },
        });
        await prisma.transaction.deleteMany({
            where: {
                id: {
                    startsWith: 'test-',
                },
            },
        });
        await prisma.paymentMethodConfig.deleteMany({
            where: {
                id: {
                    startsWith: 'test-',
                },
            },
        });
        await prisma.userAccount.deleteMany({
            where: {
                discordId: {
                    startsWith: 'test-',
                },
            },
        });

        // Create test users
        const user1 = await prisma.userAccount.create({
            data: {
                discordId: 'test-user-1',
                transactionHistoryJson: '[]',
                enableDMNotifications: true,
                enableChannelNotifications: false,
            },
        });
        testUserId1 = user1.id;

        const user2 = await prisma.userAccount.create({
            data: {
                discordId: 'test-user-2',
                transactionHistoryJson: '[]',
                enableDMNotifications: true,
                enableChannelNotifications: false,
            },
        });
        testUserId2 = user2.id;

        // Create test payment methods
        const paymentMethod1 = await prisma.paymentMethodConfig.create({
            data: {
                id: 'test-pm-1',
                userId: testUserId1,
                type: PaymentMethodType.CRYPTO,
                displayName: 'Test Crypto Wallet',
                encryptedDetails: JSON.stringify({ wallet: 'test-wallet-1' }),
                isActive: true,
            },
        });
        testPaymentMethodId1 = paymentMethod1.id;

        const paymentMethod2 = await prisma.paymentMethodConfig.create({
            data: {
                id: 'test-pm-2',
                userId: testUserId2,
                type: PaymentMethodType.ACH,
                displayName: 'Test Bank Account',
                encryptedDetails: JSON.stringify({ account: 'test-account-2' }),
                isActive: true,
            },
        });
        testPaymentMethodId2 = paymentMethod2.id;

        // Create test transaction
        const transaction = await prisma.transaction.create({
            data: {
                id: 'test-transaction-1',
                senderId: testUserId1,
                recipientId: testUserId2,
                amount: 100.00,
                currency: 'USD',
                senderPaymentMethodId: testPaymentMethodId1,
                recipientPaymentMethodId: testPaymentMethodId2,
                status: TransactionStatus.PENDING,
                processingFee: 2.50,
                escrowFee: 1.00,
                totalFees: 3.50,
            },
        });
        testTransactionId = transaction.id;

        vi.clearAllMocks();
    });

    afterEach(async () => {
        // Clean up test data
        await prisma.escrowRecord.deleteMany({
            where: {
                transactionId: {
                    startsWith: 'test-',
                },
            },
        });
        await prisma.transaction.deleteMany({
            where: {
                id: {
                    startsWith: 'test-',
                },
            },
        });
        await prisma.paymentMethodConfig.deleteMany({
            where: {
                id: {
                    startsWith: 'test-',
                },
            },
        });
        await prisma.userAccount.deleteMany({
            where: {
                discordId: {
                    startsWith: 'test-',
                },
            },
        });
    });

    it('should complete full escrow lifecycle: hold -> release', async () => {
        // Step 1: Hold funds in escrow
        const escrowRecord = await escrowManager.holdFunds(
            testTransactionId,
            100.00,
            PaymentMethodType.CRYPTO
        );

        expect(escrowRecord.transactionId).toBe(testTransactionId);
        expect(escrowRecord.amount).toBe(100.00);
        expect(escrowRecord.status).toBe(EscrowStatus.HOLDING);
        expect(escrowRecord.externalTransactionId).toBe('ext-withdraw-123');

        // Verify transaction status updated
        const transaction = await prisma.transaction.findUnique({
            where: { id: testTransactionId },
        });
        expect(transaction?.status).toBe(TransactionStatus.ESCROWED);

        // Verify escrow record in database
        const dbEscrowRecord = await prisma.escrowRecord.findUnique({
            where: { transactionId: testTransactionId },
        });
        expect(dbEscrowRecord).toBeTruthy();
        expect(dbEscrowRecord?.status).toBe(EscrowStatus.HOLDING);

        // Step 2: Release funds to recipient
        await escrowManager.releaseFunds(testTransactionId, PaymentMethodType.ACH);

        // Verify escrow record updated
        const updatedEscrowRecord = await prisma.escrowRecord.findUnique({
            where: { transactionId: testTransactionId },
        });
        expect(updatedEscrowRecord?.status).toBe(EscrowStatus.RELEASED);
        expect(updatedEscrowRecord?.releaseAt).toBeTruthy();

        // Verify transaction completed
        const completedTransaction = await prisma.transaction.findUnique({
            where: { id: testTransactionId },
        });
        expect(completedTransaction?.status).toBe(TransactionStatus.COMPLETED);
        expect(completedTransaction?.completedAt).toBeTruthy();

        // Verify payment processor calls
        expect(mockPaymentProcessor.withdrawFunds).toHaveBeenCalledWith(
            { type: PaymentMethodType.CRYPTO, accountInfo: { wallet: 'test-wallet-1' } },
            100.00
        );
        expect(mockPaymentProcessor.depositFunds).toHaveBeenCalledWith(
            { type: PaymentMethodType.ACH, accountInfo: { account: 'test-account-2' } },
            100.00
        );
    });

    it('should complete full escrow lifecycle: hold -> return', async () => {
        // Step 1: Hold funds in escrow
        const escrowRecord = await escrowManager.holdFunds(
            testTransactionId,
            100.00,
            PaymentMethodType.CRYPTO
        );

        expect(escrowRecord.status).toBe(EscrowStatus.HOLDING);

        // Step 2: Return funds to sender
        await escrowManager.returnFunds(testTransactionId);

        // Verify escrow record updated
        const updatedEscrowRecord = await prisma.escrowRecord.findUnique({
            where: { transactionId: testTransactionId },
        });
        expect(updatedEscrowRecord?.status).toBe(EscrowStatus.RETURNED);
        expect(updatedEscrowRecord?.releaseAt).toBeTruthy();

        // Verify transaction failed
        const failedTransaction = await prisma.transaction.findUnique({
            where: { id: testTransactionId },
        });
        expect(failedTransaction?.status).toBe(TransactionStatus.FAILED);
        expect(failedTransaction?.failureReason).toBe('Funds returned from escrow');

        // Verify payment processor calls
        expect(mockPaymentProcessor.withdrawFunds).toHaveBeenCalledWith(
            { type: PaymentMethodType.CRYPTO, accountInfo: { wallet: 'test-wallet-1' } },
            100.00
        );
        expect(mockPaymentProcessor.depositFunds).toHaveBeenCalledWith(
            { type: PaymentMethodType.CRYPTO, accountInfo: { wallet: 'test-wallet-1' } },
            100.00
        );
    });

    it('should get escrow status and record', async () => {
        // Hold funds first
        await escrowManager.holdFunds(testTransactionId, 100.00, PaymentMethodType.CRYPTO);

        // Test getEscrowStatus
        const status = await escrowManager.getEscrowStatus(testTransactionId);
        expect(status).toBe(EscrowStatus.HOLDING);

        // Test getEscrowRecord
        const record = await escrowManager.getEscrowRecord(testTransactionId);
        expect(record).toBeTruthy();
        expect(record?.transactionId).toBe(testTransactionId);
        expect(record?.amount).toBe(100.00);
        expect(record?.status).toBe(EscrowStatus.HOLDING);
    });

    it('should handle expired escrows', async () => {
        // Create an escrow record that's already expired
        await prisma.escrowRecord.create({
            data: {
                id: 'test-expired-escrow',
                transactionId: testTransactionId,
                amount: 100.00,
                currency: 'USD',
                paymentMethod: PaymentMethodType.CRYPTO,
                externalTransactionId: 'ext-expired-123',
                status: EscrowStatus.HOLDING,
                releaseAt: new Date(Date.now() - 1000), // 1 second ago
            },
        });

        // Update transaction to ESCROWED status
        await prisma.transaction.update({
            where: { id: testTransactionId },
            data: { status: TransactionStatus.ESCROWED },
        });

        // Process expired escrows
        await escrowManager.processExpiredEscrows();

        // Verify escrow was returned
        const escrowRecord = await prisma.escrowRecord.findUnique({
            where: { transactionId: testTransactionId },
        });
        expect(escrowRecord?.status).toBe(EscrowStatus.RETURNED);

        // Verify transaction was failed
        const transaction = await prisma.transaction.findUnique({
            where: { id: testTransactionId },
        });
        expect(transaction?.status).toBe(TransactionStatus.FAILED);
        expect(transaction?.failureReason).toBe('Funds returned from escrow');
    });

    it('should cleanup completed escrows', async () => {
        // Create some old completed escrow records with proper transactions
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 35); // 35 days ago

        // Create old transactions first
        const oldTransaction1 = await prisma.transaction.create({
            data: {
                id: 'test-old-transaction-1',
                senderId: testUserId1,
                recipientId: testUserId2,
                amount: 50.00,
                currency: 'USD',
                senderPaymentMethodId: testPaymentMethodId1,
                recipientPaymentMethodId: testPaymentMethodId2,
                status: TransactionStatus.COMPLETED,
                processingFee: 1.25,
                escrowFee: 0.50,
                totalFees: 1.75,
                completedAt: oldDate,
            },
        });

        const oldTransaction2 = await prisma.transaction.create({
            data: {
                id: 'test-old-transaction-2',
                senderId: testUserId2,
                recipientId: testUserId1,
                amount: 75.00,
                currency: 'USD',
                senderPaymentMethodId: testPaymentMethodId2,
                recipientPaymentMethodId: testPaymentMethodId1,
                status: TransactionStatus.FAILED,
                processingFee: 1.88,
                escrowFee: 0.75,
                totalFees: 2.63,
                failureReason: 'Test failure',
            },
        });

        await prisma.escrowRecord.create({
            data: {
                id: 'test-old-escrow-1',
                transactionId: oldTransaction1.id,
                amount: 50.00,
                currency: 'USD',
                paymentMethod: PaymentMethodType.CRYPTO,
                externalTransactionId: 'ext-old-1',
                status: EscrowStatus.RELEASED,
                releaseAt: oldDate,
            },
        });

        await prisma.escrowRecord.create({
            data: {
                id: 'test-old-escrow-2',
                transactionId: oldTransaction2.id,
                amount: 75.00,
                currency: 'USD',
                paymentMethod: PaymentMethodType.ACH,
                externalTransactionId: 'ext-old-2',
                status: EscrowStatus.RETURNED,
                releaseAt: oldDate,
            },
        });

        // Create a recent completed escrow (should not be deleted)
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 10); // 10 days ago

        const recentTransaction = await prisma.transaction.create({
            data: {
                id: 'test-recent-transaction',
                senderId: testUserId1,
                recipientId: testUserId2,
                amount: 25.00,
                currency: 'USD',
                senderPaymentMethodId: testPaymentMethodId1,
                recipientPaymentMethodId: testPaymentMethodId2,
                status: TransactionStatus.COMPLETED,
                processingFee: 0.63,
                escrowFee: 0.25,
                totalFees: 0.88,
                completedAt: recentDate,
            },
        });

        await prisma.escrowRecord.create({
            data: {
                id: 'test-recent-escrow',
                transactionId: recentTransaction.id,
                amount: 25.00,
                currency: 'USD',
                paymentMethod: PaymentMethodType.CRYPTO,
                externalTransactionId: 'ext-recent',
                status: EscrowStatus.RELEASED,
                releaseAt: recentDate,
            },
        });

        // Cleanup escrows older than 30 days
        const deletedCount = await escrowManager.cleanupCompletedEscrows(30);

        expect(deletedCount).toBe(2);

        // Verify old records were deleted
        const oldEscrow1 = await prisma.escrowRecord.findUnique({
            where: { id: 'test-old-escrow-1' },
        });
        expect(oldEscrow1).toBeNull();

        const oldEscrow2 = await prisma.escrowRecord.findUnique({
            where: { id: 'test-old-escrow-2' },
        });
        expect(oldEscrow2).toBeNull();

        // Verify recent record was not deleted
        const recentEscrow = await prisma.escrowRecord.findUnique({
            where: { id: 'test-recent-escrow' },
        });
        expect(recentEscrow).toBeTruthy();
    });
});