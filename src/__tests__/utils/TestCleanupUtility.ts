/**
 * Test Cleanup Utility
 * Handles cleanup of test data to ensure test isolation
 */
export class TestCleanupUtility {
    constructor(private prisma: any) { }

    /**
     * Clean up all test data
     */
    async cleanupTestData(): Promise<void> {
        try {
            // Delete in order to respect foreign key constraints
            await this.cleanupAuditLogs();
            await this.cleanupEscrowRecords();
            await this.cleanupTransactions();
            await this.cleanupPaymentRequests();
            await this.cleanupPaymentMethods();
            await this.cleanupServerConfigs();
            await this.cleanupUserAccounts();
        } catch (error) {
            console.warn('Cleanup warning (non-critical):', error);
        }
    }

    /**
     * Clean up user accounts and related data
     */
    async cleanupUserAccounts(): Promise<void> {
        // Delete test user accounts (those with test prefixes or patterns)
        await this.prisma.userAccount.deleteMany({
            where: {
                OR: [
                    { discordId: { startsWith: 'test-' } },
                    { discordId: { startsWith: 'perf-' } },
                    { discordId: { startsWith: 'bulk-' } },
                    { discordId: { startsWith: 'sender-' } },
                    { discordId: { startsWith: 'recipient-' } },
                    { discordId: { startsWith: 'escrow-' } },
                    { discordId: { startsWith: 'db-user-' } },
                    { discordId: { startsWith: 'memory-user-' } },
                    { discordId: { startsWith: 'user-' } },
                    { discordId: { startsWith: 'attacker-' } },
                    { discordId: { startsWith: 'victim-' } },
                    { discordId: { startsWith: 'admin-' } },
                    { discordId: { startsWith: 'regular-' } },
                    { discordId: { startsWith: 'suspicious-' } },
                    { discordId: { startsWith: 'rate-limited-' } },
                    { discordId: { startsWith: 'bypass-' } },
                    { discordId: { startsWith: 'distributed-' } },
                    { discordId: { startsWith: 'brute-force-' } },
                    { discordId: { contains: '-user-' } },
                    { discordId: { contains: 'test' } },
                    { discordId: { contains: 'isolation-' } },
                ],
            },
        });
    }

    /**
     * Clean up payment methods
     */
    async cleanupPaymentMethods(): Promise<void> {
        // Delete payment methods for test users
        await this.prisma.paymentMethodConfig.deleteMany({
            where: {
                user: {
                    OR: [
                        { discordId: { startsWith: 'test-' } },
                        { discordId: { startsWith: 'perf-' } },
                        { discordId: { startsWith: 'bulk-' } },
                        { discordId: { contains: 'test' } },
                        { discordId: { contains: 'isolation-' } },
                    ],
                },
            },
        });
    }

    /**
     * Clean up transactions
     */
    async cleanupTransactions(): Promise<void> {
        // Delete transactions involving test users
        await this.prisma.transaction.deleteMany({
            where: {
                OR: [
                    { senderId: { startsWith: 'test-' } },
                    { senderId: { startsWith: 'perf-' } },
                    { senderId: { startsWith: 'bulk-' } },
                    { senderId: { contains: 'test' } },
                    { senderId: { contains: 'isolation-' } },
                    { recipientId: { startsWith: 'test-' } },
                    { recipientId: { startsWith: 'perf-' } },
                    { recipientId: { startsWith: 'bulk-' } },
                    { recipientId: { contains: 'test' } },
                    { recipientId: { contains: 'isolation-' } },
                ],
            },
        });
    }

    /**
     * Clean up payment requests
     */
    async cleanupPaymentRequests(): Promise<void> {
        await this.prisma.paymentRequest.deleteMany({
            where: {
                OR: [
                    { requesterId: { startsWith: 'test-' } },
                    { requesterId: { startsWith: 'perf-' } },
                    { requesterId: { contains: 'test' } },
                    { requesterId: { contains: 'isolation-' } },
                    { payerId: { startsWith: 'test-' } },
                    { payerId: { startsWith: 'perf-' } },
                    { payerId: { contains: 'test' } },
                    { payerId: { contains: 'isolation-' } },
                    { description: { contains: 'test' } },
                ],
            },
        });
    }

    /**
     * Clean up escrow records
     */
    async cleanupEscrowRecords(): Promise<void> {
        // Delete escrow records for test transactions
        await this.prisma.escrowRecord.deleteMany({
            where: {
                transaction: {
                    OR: [
                        { senderId: { startsWith: 'test-' } },
                        { senderId: { startsWith: 'perf-' } },
                        { senderId: { contains: 'test' } },
                        { senderId: { contains: 'isolation-' } },
                        { recipientId: { startsWith: 'test-' } },
                        { recipientId: { startsWith: 'perf-' } },
                        { recipientId: { contains: 'test' } },
                        { recipientId: { contains: 'isolation-' } },
                    ],
                },
            },
        });
    }

    /**
     * Clean up server configurations
     */
    async cleanupServerConfigs(): Promise<void> {
        await this.prisma.serverConfig.deleteMany({
            where: {
                OR: [
                    { serverId: { startsWith: 'test-' } },
                    { serverId: { contains: 'test' } },
                    { serverId: { contains: 'guild-' } },
                ],
            },
        });
    }

    /**
     * Clean up audit logs
     */
    async cleanupAuditLogs(): Promise<void> {
        // Note: AuditLog table doesn't exist in current schema
        // This is a placeholder for when audit logging is implemented
        try {
            // await this.prisma.auditLog.deleteMany({...});
        } catch (error) {
            // Ignore if table doesn't exist
        }
    }

    /**
     * Clean up specific user data
     */
    async cleanupUserData(discordId: string): Promise<void> {
        try {
            // Delete in order to respect foreign key constraints
            await this.prisma.auditLog.deleteMany({
                where: { userId: discordId },
            });

            await this.prisma.escrowRecord.deleteMany({
                where: {
                    transaction: {
                        OR: [
                            { senderId: discordId },
                            { recipientId: discordId },
                        ],
                    },
                },
            });

            await this.prisma.transaction.deleteMany({
                where: {
                    OR: [
                        { senderId: discordId },
                        { recipientId: discordId },
                    ],
                },
            });

            await this.prisma.paymentRequest.deleteMany({
                where: {
                    OR: [
                        { requesterId: discordId },
                        { payerId: discordId },
                    ],
                },
            });

            await this.prisma.paymentMethodConfig.deleteMany({
                where: {
                    user: { discordId },
                },
            });

            await this.prisma.userAccount.deleteMany({
                where: { discordId },
            });
        } catch (error) {
            console.warn(`Cleanup warning for user ${discordId}:`, error);
        }
    }

    /**
     * Clean up data by date range
     */
    async cleanupByDateRange(startDate: Date, endDate: Date): Promise<void> {
        try {
            // Clean up records created within the date range
            await this.prisma.auditLog.deleteMany({
                where: {
                    timestamp: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
            });

            await this.prisma.transaction.deleteMany({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
            });

            await this.prisma.paymentRequest.deleteMany({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
            });

            await this.prisma.userAccount.deleteMany({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
            });
        } catch (error) {
            console.warn('Date range cleanup warning:', error);
        }
    }

    /**
     * Reset database to clean state (use with caution)
     */
    async resetDatabase(): Promise<void> {
        console.warn('Resetting entire database - this will delete ALL data!');

        try {
            // Delete all data in reverse dependency order
            await this.prisma.auditLog.deleteMany({});
            await this.prisma.escrowRecord.deleteMany({});
            await this.prisma.transaction.deleteMany({});
            await this.prisma.paymentRequest.deleteMany({});
            await this.prisma.paymentMethodConfig.deleteMany({});
            await this.prisma.serverConfig.deleteMany({});
            await this.prisma.userAccount.deleteMany({});
        } catch (error) {
            console.error('Database reset failed:', error);
            throw error;
        }
    }

    /**
     * Verify cleanup was successful
     */
    async verifyCleanup(): Promise<{
        success: boolean;
        remainingRecords: Record<string, number>;
    }> {
        try {
            const counts = {
                userAccounts: await this.prisma.userAccount.count({
                    where: {
                        OR: [
                            { discordId: { startsWith: 'test-' } },
                            { discordId: { contains: 'test' } },
                            { discordId: { contains: 'isolation-' } },
                        ],
                    },
                }),
                transactions: await this.prisma.transaction.count({
                    where: {
                        OR: [
                            { senderId: { startsWith: 'test-' } },
                            { senderId: { contains: 'test' } },
                            { senderId: { contains: 'isolation-' } },
                            { recipientId: { startsWith: 'test-' } },
                            { recipientId: { contains: 'test' } },
                            { recipientId: { contains: 'isolation-' } },
                        ],
                    },
                }),
                paymentRequests: await this.prisma.paymentRequest.count({
                    where: {
                        OR: [
                            { description: { contains: 'test' } },
                            { requesterId: { startsWith: 'test-' } },
                            { requesterId: { contains: 'isolation-' } },
                        ],
                    },
                }),
                serverConfigs: await this.prisma.serverConfig.count({
                    where: {
                        OR: [
                            { serverId: { startsWith: 'test-' } },
                            { serverId: { contains: 'test' } },
                            { serverId: { contains: 'guild-' } },
                        ],
                    },
                }),
                auditLogs: 0, // Placeholder since auditLog table doesn't exist
            };

            const totalRemaining = Object.values(counts).reduce((sum, count) => sum + count, 0);

            return {
                success: totalRemaining === 0,
                remainingRecords: counts,
            };
        } catch (error) {
            console.error('Cleanup verification failed:', error);
            return {
                success: false,
                remainingRecords: {},
            };
        }
    }

    /**
     * Get cleanup statistics
     */
    async getCleanupStats(): Promise<{
        totalRecords: number;
        testRecords: number;
        cleanupPercentage: number;
    }> {
        try {
            const totalCounts = {
                userAccounts: await this.prisma.userAccount.count(),
                transactions: await this.prisma.transaction.count(),
                paymentRequests: await this.prisma.paymentRequest.count(),
                serverConfigs: await this.prisma.serverConfig.count(),
                auditLogs: await this.prisma.auditLog.count(),
            };

            const testCounts = {
                userAccounts: await this.prisma.userAccount.count({
                    where: {
                        OR: [
                            { discordId: { startsWith: 'test-' } },
                            { discordId: { contains: 'test' } },
                        ],
                    },
                }),
                transactions: await this.prisma.transaction.count({
                    where: {
                        OR: [
                            { senderId: { contains: 'test' } },
                            { recipientId: { contains: 'test' } },
                        ],
                    },
                }),
                paymentRequests: await this.prisma.paymentRequest.count({
                    where: {
                        description: { contains: 'test' },
                    },
                }),
                serverConfigs: await this.prisma.serverConfig.count({
                    where: {
                        serverId: { startsWith: 'test-' },
                    },
                }),
                auditLogs: 0, // Placeholder
            };

            const totalRecords = Object.values(totalCounts).reduce((sum, count) => sum + count, 0);
            const testRecords = Object.values(testCounts).reduce((sum, count) => sum + count, 0);
            const cleanupPercentage = totalRecords > 0 ? ((totalRecords - testRecords) / totalRecords) * 100 : 100;

            return {
                totalRecords,
                testRecords,
                cleanupPercentage,
            };
        } catch (error) {
            console.error('Failed to get cleanup stats:', error);
            return {
                totalRecords: 0,
                testRecords: 0,
                cleanupPercentage: 0,
            };
        }
    }
}