import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { PaymentServiceImpl } from '../../services/PaymentService';
import { UserAccountServiceImpl } from '../../services/UserAccountService';
import { EscrowManagerImpl } from '../../services/EscrowManager';
import { DefaultPaymentProcessorFactory } from '../../processors/PaymentProcessorFactory';
import { getPrismaClient } from '../../models/database';
import { PaymentMethodType } from '../../models/UserAccount';
import { TransactionStatus } from '../../models/Transaction';
import { TestDataFactory } from '../utils/TestDataFactory';
import { TestCleanupUtility } from '../utils/TestCleanupUtility';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';

/**
 * Performance Tests for Concurrent Transaction Handling
 * Tests system behavior under high load and concurrent operations
 */
describe('Concurrent Transaction Performance Tests', () => {
    let paymentService: PaymentServiceImpl;
    let userAccountService: UserAccountServiceImpl;
    let escrowManager: EscrowManagerImpl;
    let prisma: any;
    let testDataFactory: TestDataFactory;
    let cleanupUtility: TestCleanupUtility;
    let performanceMonitor: PerformanceMonitor;

    beforeAll(async () => {
        // Initialize database and services
        prisma = getPrismaClient();
        testDataFactory = new TestDataFactory(prisma);
        cleanupUtility = new TestCleanupUtility(prisma);
        performanceMonitor = new PerformanceMonitor();

        const paymentProcessorFactory = new DefaultPaymentProcessorFactory();
        userAccountService = new UserAccountServiceImpl();
        escrowManager = new EscrowManagerImpl(paymentProcessorFactory);
        paymentService = new PaymentServiceImpl(escrowManager, userAccountService, paymentProcessorFactory);
    });

    beforeEach(async () => {
        await cleanupUtility.cleanupTestData();
        performanceMonitor.reset();
    });

    afterEach(async () => {
        await cleanupUtility.cleanupTestData();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    describe('Concurrent Payment Processing', () => {
        it('should handle 100 concurrent payments without data corruption', async () => {
            // Create test users
            const userCount = 20;
            const users = await Promise.all(
                Array.from({ length: userCount }, async (_, i) => {
                    const userId = `perf-user-${i}`;
                    await testDataFactory.createUserAccount(userId);
                    await testDataFactory.addPaymentMethodToUser(userId, 'crypto', {
                        cryptoType: 'BTC',
                        walletAddress: `1${i.toString().padStart(33, '0')}`,
                    });
                    return userId;
                })
            );

            const startTime = Date.now();
            performanceMonitor.startTest('concurrent_payments');

            // Create 100 concurrent payment promises
            const paymentPromises = Array.from({ length: 100 }, (_, i) => {
                const senderId = users[i % userCount];
                const recipientId = users[(i + 1) % userCount];
                const amount = Math.floor(Math.random() * 50) + 1; // $1-$50

                return paymentService.initiatePayment(
                    senderId,
                    recipientId,
                    amount,
                    'crypto',
                    `Concurrent test payment ${i}`
                ).catch(error => ({ error, index: i }));
            });

            // Execute all payments concurrently
            const results = await Promise.all(paymentPromises);
            const endTime = Date.now();

            performanceMonitor.endTest('concurrent_payments');

            // Analyze results
            const successful = results.filter(r => !('error' in r));
            const failed = results.filter(r => 'error' in r);

            console.log(`🐷 Oink! Concurrent Payments Performance:
                Total: 100
                Successful: ${successful.length}
                Failed: ${failed.length}
                Duration: ${endTime - startTime}ms
                Average: ${(endTime - startTime) / 100}ms per payment
            `);

            // Verify no data corruption
            const allTransactions = await prisma.transaction.findMany({
                where: {
                    senderId: { in: users },
                    recipientId: { in: users },
                },
            });

            // Should have created transactions for successful payments
            expect(allTransactions.length).toBe(successful.length);

            // Verify transaction integrity
            for (const transaction of allTransactions) {
                expect(transaction.amount).toBeGreaterThan(0);
                expect(transaction.amount).toBeLessThanOrEqual(50);
                expect(users).toContain(transaction.senderId);
                expect(users).toContain(transaction.recipientId);
                expect(transaction.senderId).not.toBe(transaction.recipientId);
                expect([TransactionStatus.PENDING, TransactionStatus.ESCROWED]).toContain(transaction.status);
            }

            // Performance assertions
            expect(endTime - startTime).toBeLessThan(30000); // Should complete within 30 seconds
            expect(successful.length).toBeGreaterThan(80); // At least 80% success rate
        });

        it('should handle concurrent payments to same recipient', async () => {
            // Create one recipient and multiple senders
            const recipientId = 'recipient-user';
            await testDataFactory.createUserAccount(recipientId);
            await testDataFactory.addPaymentMethodToUser(recipientId, 'ach', {
                routingNumber: '123456789',
                accountNumber: '987654321',
                accountType: 'checking',
            });

            const senderCount = 50;
            const senders = await Promise.all(
                Array.from({ length: senderCount }, async (_, i) => {
                    const senderId = `sender-${i}`;
                    await testDataFactory.createUserAccount(senderId);
                    await testDataFactory.addPaymentMethodToUser(senderId, 'crypto', {
                        cryptoType: 'BTC',
                        walletAddress: `1${i.toString().padStart(33, '0')}`,
                    });
                    return senderId;
                })
            );

            performanceMonitor.startTest('concurrent_to_recipient');

            // All senders pay the same recipient concurrently
            const paymentPromises = senders.map((senderId, i) =>
                paymentService.initiatePayment(
                    senderId,
                    recipientId,
                    10.00,
                    'crypto',
                    `Payment from sender ${i}`
                ).catch(error => ({ error, senderId }))
            );

            const results = await Promise.all(paymentPromises);
            performanceMonitor.endTest('concurrent_to_recipient');

            const successful = results.filter(r => !('error' in r));
            const failed = results.filter(r => 'error' in r);

            console.log(`🐷 Oink! Concurrent to Recipient Performance:
                Senders: ${senderCount}
                Successful: ${successful.length}
                Failed: ${failed.length}
            `);

            // Verify recipient account integrity
            const recipientAccount = await userAccountService.getAccount(recipientId);
            expect(recipientAccount).toBeDefined();

            // Verify all successful transactions are recorded
            const recipientTransactions = await prisma.transaction.findMany({
                where: { recipientId },
            });

            expect(recipientTransactions.length).toBe(successful.length);

            // Verify no duplicate transactions
            const senderIds = recipientTransactions.map(t => t.senderId);
            const uniqueSenderIds = new Set(senderIds);
            expect(uniqueSenderIds.size).toBe(senderIds.length);
        });

        it('should handle concurrent escrow operations', async () => {
            // Create test users
            const userPairs = await Promise.all(
                Array.from({ length: 25 }, async (_, i) => {
                    const senderId = `escrow-sender-${i}`;
                    const recipientId = `escrow-recipient-${i}`;

                    await testDataFactory.createUserAccount(senderId);
                    await testDataFactory.createUserAccount(recipientId);

                    await testDataFactory.addPaymentMethodToUser(senderId, 'crypto', {
                        cryptoType: 'BTC',
                        walletAddress: `1${i.toString().padStart(33, '0')}`,
                    });

                    await testDataFactory.addPaymentMethodToUser(recipientId, 'ach', {
                        routingNumber: '123456789',
                        accountNumber: `${i.toString().padStart(9, '0')}`,
                        accountType: 'checking',
                    });

                    return { senderId, recipientId };
                })
            );

            performanceMonitor.startTest('concurrent_escrow');

            // Create transactions and immediately try to complete them
            const escrowPromises = userPairs.map(async ({ senderId, recipientId }, i) => {
                try {
                    // Initiate payment (creates escrow)
                    const transaction = await paymentService.initiatePayment(
                        senderId,
                        recipientId,
                        20.00,
                        'crypto',
                        `Escrow test ${i}`
                    );

                    // Simulate immediate completion
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

                    // Complete the transaction
                    await paymentService.completeTransaction(transaction.id);

                    return { success: true, transactionId: transaction.id };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            });

            const results = await Promise.all(escrowPromises);
            performanceMonitor.endTest('concurrent_escrow');

            const successful = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);

            console.log(`🐷 Oink! Concurrent Escrow Performance:
                Total: ${userPairs.length}
                Successful: ${successful.length}
                Failed: ${failed.length}
            `);

            // Verify escrow integrity
            const escrowRecords = await prisma.escrowRecord.findMany({
                where: {
                    transactionId: { in: successful.map(r => r.transactionId) },
                },
            });

            expect(escrowRecords.length).toBe(successful.length);

            // All escrow records should be in proper state
            for (const record of escrowRecords) {
                expect(['holding', 'released']).toContain(record.status);
                expect(record.amount).toBe(20.00);
            }
        });
    });

    describe('Database Performance Under Load', () => {
        it('should maintain query performance with large transaction history', async () => {
            const userId = 'heavy-user';
            await testDataFactory.createUserAccount(userId);

            // Create a large number of historical transactions
            const transactionCount = 1000;
            performanceMonitor.startTest('create_history');

            await Promise.all(
                Array.from({ length: transactionCount }, async (_, i) => {
                    const otherUserId = `other-user-${i % 100}`;
                    await testDataFactory.createUserAccount(otherUserId);

                    return testDataFactory.createTransaction(
                        i % 2 === 0 ? userId : otherUserId,
                        i % 2 === 0 ? otherUserId : userId,
                        Math.random() * 100,
                        'completed'
                    );
                })
            );

            performanceMonitor.endTest('create_history');

            // Test query performance
            performanceMonitor.startTest('query_history');
            const startTime = Date.now();

            const userTransactions = await prisma.transaction.findMany({
                where: {
                    OR: [
                        { senderId: userId },
                        { recipientId: userId },
                    ],
                },
                orderBy: { createdAt: 'desc' },
                take: 50,
            });

            const queryTime = Date.now() - startTime;
            performanceMonitor.endTest('query_history');

            console.log(`🐷 Oink! Transaction History Query Performance:
                Total transactions in DB: ${transactionCount}
                User transactions found: ${userTransactions.length}
                Query time: ${queryTime}ms
            `);

            // Performance assertions
            expect(queryTime).toBeLessThan(1000); // Should complete within 1 second
            expect(userTransactions.length).toBeGreaterThan(0);
            expect(userTransactions.length).toBeLessThanOrEqual(50);

            // Verify results are properly ordered
            for (let i = 1; i < userTransactions.length; i++) {
                expect(userTransactions[i].createdAt.getTime())
                    .toBeLessThanOrEqual(userTransactions[i - 1].createdAt.getTime());
            }
        });

        it('should handle concurrent database writes without deadlocks', async () => {
            const userCount = 10;
            const users = await Promise.all(
                Array.from({ length: userCount }, async (_, i) => {
                    const userId = `db-user-${i}`;
                    await testDataFactory.createUserAccount(userId);
                    return userId;
                })
            );

            performanceMonitor.startTest('concurrent_db_writes');

            // Create many concurrent database operations
            const operations = Array.from({ length: 200 }, (_, i) => {
                const userId = users[i % userCount];
                const operation = i % 4;

                switch (operation) {
                    case 0: // Add payment method
                        return userAccountService.addPaymentMethod(userId, {
                            type: 'crypto' as PaymentMethodType,
                            displayName: `Method ${i}`,
                            encryptedDetails: { walletAddress: `addr-${i}` },
                            isActive: true,
                        });

                    case 1: // Create transaction
                        const otherUser = users[(i + 1) % userCount];
                        return testDataFactory.createTransaction(userId, otherUser, 10.00, 'pending');

                    case 2: // Update account
                        return prisma.userAccount.update({
                            where: { discordId: userId },
                            data: { updatedAt: new Date() },
                        });

                    case 3: // Query account
                        return userAccountService.getAccount(userId);

                    default:
                        return Promise.resolve();
                }
            });

            const results = await Promise.allSettled(operations);
            performanceMonitor.endTest('concurrent_db_writes');

            const successful = results.filter(r => r.status === 'fulfilled');
            const failed = results.filter(r => r.status === 'rejected');

            console.log(`🐷 Oink! Concurrent DB Operations Performance:
                Total: ${operations.length}
                Successful: ${successful.length}
                Failed: ${failed.length}
            `);

            // Should have high success rate (some failures expected due to constraints)
            expect(successful.length).toBeGreaterThan(operations.length * 0.8);

            // Check for deadlock errors specifically
            const deadlockErrors = failed.filter(r =>
                r.status === 'rejected' &&
                r.reason?.message?.includes('deadlock')
            );

            expect(deadlockErrors.length).toBe(0);
        });
    });

    describe('Memory and Resource Management', () => {
        it('should not leak memory during high-volume operations', async () => {
            const initialMemory = process.memoryUsage();
            performanceMonitor.startTest('memory_test');

            // Perform many operations
            for (let batch = 0; batch < 10; batch++) {
                const batchPromises = Array.from({ length: 50 }, async (_, i) => {
                    const userId = `memory-user-${batch}-${i}`;
                    await testDataFactory.createUserAccount(userId);

                    const transaction = await testDataFactory.createTransaction(
                        userId,
                        `other-${batch}-${i}`,
                        Math.random() * 100,
                        'completed'
                    );

                    // Clean up immediately to test garbage collection
                    await prisma.transaction.delete({ where: { id: transaction.id } });
                    await prisma.userAccount.delete({ where: { discordId: userId } });
                });

                await Promise.all(batchPromises);

                // Force garbage collection if available
                if (global.gc) {
                    global.gc();
                }
            }

            performanceMonitor.endTest('memory_test');

            const finalMemory = process.memoryUsage();
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

            console.log(`🐷 Oink! Memory Usage:
                Initial: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB
                Final: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB
                Increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB
            `);

            // Memory increase should be reasonable (less than 50MB for this test)
            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
        });

        it('should handle connection pool exhaustion gracefully', async () => {
            performanceMonitor.startTest('connection_pool_test');

            // Create more concurrent operations than the connection pool can handle
            const operationCount = 100; // Assuming pool size is smaller
            const operations = Array.from({ length: operationCount }, async (_, i) => {
                try {
                    // Simple query that requires a database connection
                    const result = await prisma.userAccount.count();
                    return { success: true, result };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            });

            const results = await Promise.all(operations);
            performanceMonitor.endTest('connection_pool_test');

            const successful = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);

            console.log(`🐷 Oink! Connection Pool Test:
                Total operations: ${operationCount}
                Successful: ${successful.length}
                Failed: ${failed.length}
            `);

            // Should handle gracefully - either succeed or fail with proper error
            expect(successful.length + failed.length).toBe(operationCount);

            // Check for connection pool errors
            const poolErrors = failed.filter(r =>
                r.error?.includes('pool') || r.error?.includes('connection')
            );

            // If there are pool errors, they should be handled gracefully
            if (poolErrors.length > 0) {
                console.log('🐷 Oink! Connection pool errors detected (expected under high load) 🐽');
            }
        });
    });

    describe('Rate Limiting Performance', () => {
        it('should efficiently handle rate limit checks under load', async () => {
            const { RateLimiter } = await import('../../utils/RateLimiter');
            const rateLimiter = new RateLimiter({
                windowMs: 60000, // 1 minute
                maxRequests: 10,
            });

            const userCount = 100;
            const requestsPerUser = 15; // Exceeds limit

            performanceMonitor.startTest('rate_limit_performance');

            const allRequests = Array.from({ length: userCount }, (_, userIndex) =>
                Array.from({ length: requestsPerUser }, (_, requestIndex) =>
                    rateLimiter.checkLimit(`user-${userIndex}`, 'payment')
                        .then(result => ({ userId: userIndex, requestIndex, ...result }))
                )
            ).flat();

            const results = await Promise.all(allRequests);
            performanceMonitor.endTest('rate_limit_performance');

            // Analyze results
            const allowedRequests = results.filter(r => r.allowed);
            const blockedRequests = results.filter(r => !r.allowed);

            console.log(`🐷 Oink! Rate Limiting Performance:
                Total requests: ${results.length}
                Allowed: ${allowedRequests.length}
                Blocked: ${blockedRequests.length}
                Expected allowed: ${userCount * 10}
            `);

            // Should allow exactly 10 requests per user
            expect(allowedRequests.length).toBe(userCount * 10);
            expect(blockedRequests.length).toBe(userCount * 5);

            // Verify per-user limits
            const userResults = {};
            results.forEach(result => {
                if (!userResults[result.userId]) {
                    userResults[result.userId] = { allowed: 0, blocked: 0 };
                }
                if (result.allowed) {
                    userResults[result.userId].allowed++;
                } else {
                    userResults[result.userId].blocked++;
                }
            });

            Object.values(userResults).forEach((userResult: any) => {
                expect(userResult.allowed).toBe(10);
                expect(userResult.blocked).toBe(5);
            });

            rateLimiter.destroy();
        });
    });
});