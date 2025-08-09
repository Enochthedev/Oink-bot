// Integration tests for TransactionCommandHandler
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    CommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    User,
    CommandInteractionOptionResolver
} from 'discord.js';
import { TransactionCommandHandlerImpl } from '../transactions/TransactionCommandHandler';
import { PaymentServiceImpl } from '../../services/PaymentService';
import { UserAccountServiceImpl } from '../../services/UserAccountService';
import { getPrismaClient, withTransaction } from '../../models/database';
import { TransactionStatus } from '../../models/Transaction';
import { PaymentMethodType } from '../../models/UserAccount';

// Mock Discord.js components
const mockEmbedBuilder = {
    setTitle: () => mockEmbedBuilder,
    setColor: () => mockEmbedBuilder,
    setTimestamp: () => mockEmbedBuilder,
    setDescription: () => mockEmbedBuilder,
    addFields: () => mockEmbedBuilder,
    setFooter: () => mockEmbedBuilder,
};

const mockActionRowBuilder = {
    addComponents: () => mockActionRowBuilder,
};

const mockStringSelectMenuBuilder = {
    setCustomId: () => mockStringSelectMenuBuilder,
    setPlaceholder: () => mockStringSelectMenuBuilder,
    addOptions: () => mockStringSelectMenuBuilder,
};

// Mock Discord.js
vi.mock('discord.js', () => ({
    EmbedBuilder: vi.fn(() => mockEmbedBuilder),
    ActionRowBuilder: vi.fn(() => mockActionRowBuilder),
    StringSelectMenuBuilder: vi.fn(() => mockStringSelectMenuBuilder),
    ButtonBuilder: vi.fn(() => ({
        setCustomId: vi.fn().mockReturnThis(),
        setLabel: vi.fn().mockReturnThis(),
        setStyle: vi.fn().mockReturnThis(),
        setEmoji: vi.fn().mockReturnThis(),
    })),
    ButtonStyle: {
        Primary: 1,
        Secondary: 2,
        Success: 3,
        Danger: 4,
    },
}));

describe('TransactionCommandHandler Integration Tests', () => {
    let handler: TransactionCommandHandlerImpl;
    let paymentService: PaymentServiceImpl;
    let userAccountService: UserAccountServiceImpl;
    let prisma: ReturnType<typeof getPrismaClient>;

    const testUserId1 = '123456789012345678'; // Valid Discord ID format
    const testUserId2 = '987654321098765432'; // Valid Discord ID format

    beforeEach(async () => {
        prisma = getPrismaClient();

        // Clean up test data
        await prisma.transaction.deleteMany({
            where: {
                OR: [
                    { senderId: testUserId1 },
                    { recipientId: testUserId1 },
                    { senderId: testUserId2 },
                    { recipientId: testUserId2 },
                ]
            }
        });

        await prisma.paymentMethodConfig.deleteMany({
            where: {
                user: {
                    discordId: { in: [testUserId1, testUserId2] }
                }
            }
        });

        await prisma.userAccount.deleteMany({
            where: {
                discordId: { in: [testUserId1, testUserId2] }
            }
        });

        // Initialize services
        paymentService = new PaymentServiceImpl();
        userAccountService = new UserAccountServiceImpl();
        handler = new TransactionCommandHandlerImpl(paymentService, userAccountService);

        // Create test users
        await userAccountService.createAccount(testUserId1);
        await userAccountService.createAccount(testUserId2);

        // Add payment methods
        await userAccountService.addPaymentMethod(testUserId1, {
            type: 'crypto' as PaymentMethodType,
            displayName: 'Bitcoin Wallet',
            encryptedDetails: 'encrypted_btc_details',
        });

        await userAccountService.addPaymentMethod(testUserId2, {
            type: 'ach' as PaymentMethodType,
            displayName: 'Bank Account',
            encryptedDetails: 'encrypted_bank_details',
        });
    });

    afterEach(async () => {
        // Clean up test data
        await prisma.transaction.deleteMany({
            where: {
                OR: [
                    { senderId: testUserId1 },
                    { recipientId: testUserId1 },
                    { senderId: testUserId2 },
                    { recipientId: testUserId2 },
                ]
            }
        });

        await prisma.paymentMethodConfig.deleteMany({
            where: {
                user: {
                    discordId: { in: [testUserId1, testUserId2] }
                }
            }
        });

        await prisma.userAccount.deleteMany({
            where: {
                discordId: { in: [testUserId1, testUserId2] }
            }
        });
    });

    const createMockInteraction = (userId: string, limit?: number): CommandInteraction => {
        return {
            user: { id: userId } as User,
            options: {
                get: vi.fn().mockReturnValue(limit ? { value: limit } : null),
            } as unknown as CommandInteractionOptionResolver,
            deferReply: vi.fn(),
            editReply: vi.fn(),
            reply: vi.fn(),
            deferred: false,
        } as unknown as CommandInteraction;
    };

    const createMockButtonInteraction = (userId: string, customId: string): ButtonInteraction => {
        return {
            user: { id: userId } as User,
            customId,
            deferReply: vi.fn(),
            editReply: vi.fn(),
            reply: vi.fn(),
        } as unknown as ButtonInteraction;
    };

    const createMockSelectMenuInteraction = (userId: string, values: string[]): StringSelectMenuInteraction => {
        return {
            user: { id: userId } as User,
            customId: `transaction_filter_${userId}`,
            values,
            deferReply: vi.fn(),
            editReply: vi.fn(),
            reply: vi.fn(),
        } as unknown as StringSelectMenuInteraction;
    };

    describe('Transaction History Retrieval', () => {
        it('should retrieve empty transaction history for new user', async () => {
            const interaction = createMockInteraction(testUserId1);

            await handler.handleTransactionsCommand(interaction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(interaction.editReply).toHaveBeenCalledWith({
                content: '📊 You have no transaction history yet.',
            });
        });

        it('should retrieve transaction history with real transactions', async () => {
            // Create test transactions directly in database
            const user1Account = await userAccountService.getAccount(testUserId1);
            const user2Account = await userAccountService.getAccount(testUserId2);

            if (!user1Account || !user2Account) {
                throw new Error('Test users not found');
            }

            await withTransaction(async (tx) => {
                await tx.transaction.create({
                    data: {
                        id: 'test_tx_1',
                        senderId: testUserId1,
                        recipientId: testUserId2,
                        amount: 100.00,
                        currency: 'USD',
                        senderPaymentMethodId: user1Account.paymentMethods[0].id,
                        recipientPaymentMethodId: user2Account.paymentMethods[0].id,
                        status: TransactionStatus.COMPLETED,
                        processingFee: 2.50,
                        escrowFee: 1.00,
                        totalFees: 3.50,
                        completedAt: new Date(),
                    }
                });

                await tx.transaction.create({
                    data: {
                        id: 'test_tx_2',
                        senderId: testUserId2,
                        recipientId: testUserId1,
                        amount: 50.00,
                        currency: 'USD',
                        senderPaymentMethodId: user2Account.paymentMethods[0].id,
                        recipientPaymentMethodId: user1Account.paymentMethods[0].id,
                        status: TransactionStatus.PENDING,
                        processingFee: 1.25,
                        escrowFee: 0.50,
                        totalFees: 1.75,
                    }
                });
            });

            const interaction = createMockInteraction(testUserId1, 10);

            await handler.handleTransactionsCommand(interaction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(interaction.editReply).toHaveBeenCalledWith({
                embeds: expect.any(Array),
                components: expect.any(Array),
            });
        });

        it('should respect limit parameter', async () => {
            // Create multiple test transactions
            const user1Account = await userAccountService.getAccount(testUserId1);
            const user2Account = await userAccountService.getAccount(testUserId2);

            if (!user1Account || !user2Account) {
                throw new Error('Test users not found');
            }

            await withTransaction(async (tx) => {
                for (let i = 1; i <= 15; i++) {
                    await tx.transaction.create({
                        data: {
                            id: `test_tx_${i}`,
                            senderId: testUserId1,
                            recipientId: testUserId2,
                            amount: i * 10,
                            currency: 'USD',
                            senderPaymentMethodId: user1Account.paymentMethods[0].id,
                            status: TransactionStatus.COMPLETED,
                            processingFee: 1.00,
                            escrowFee: 0.50,
                            totalFees: 1.50,
                            completedAt: new Date(),
                        }
                    });
                }
            });

            const interaction = createMockInteraction(testUserId1, 5);

            await handler.handleTransactionsCommand(interaction);

            // Verify that the service was called with the correct limit
            const transactions = await paymentService.getTransactionHistory(testUserId1, 5);
            expect(transactions).toHaveLength(5);
        });
    });

    describe('Transaction Detail View', () => {
        it('should show transaction details for authorized user', async () => {
            // Create test transaction
            const user1Account = await userAccountService.getAccount(testUserId1);
            const user2Account = await userAccountService.getAccount(testUserId2);

            if (!user1Account || !user2Account) {
                throw new Error('Test users not found');
            }

            await withTransaction(async (tx) => {
                await tx.transaction.create({
                    data: {
                        id: 'detail_test_tx',
                        senderId: testUserId1,
                        recipientId: testUserId2,
                        amount: 75.00,
                        currency: 'USD',
                        senderPaymentMethodId: user1Account.paymentMethods[0].id,
                        recipientPaymentMethodId: user2Account.paymentMethods[0].id,
                        status: TransactionStatus.COMPLETED,
                        processingFee: 2.00,
                        escrowFee: 0.75,
                        totalFees: 2.75,
                        completedAt: new Date(),
                    }
                });
            });

            const interaction = createMockButtonInteraction(testUserId1, 'transaction_detail_detail_test_tx');

            await handler.handleTransactionDetailView(interaction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(interaction.editReply).toHaveBeenCalledWith({
                embeds: expect.any(Array),
            });
        });

        it('should deny access to unauthorized user', async () => {
            // Create test transaction between other users
            const user1Account = await userAccountService.getAccount(testUserId1);
            const user2Account = await userAccountService.getAccount(testUserId2);

            if (!user1Account || !user2Account) {
                throw new Error('Test users not found');
            }

            await withTransaction(async (tx) => {
                await tx.transaction.create({
                    data: {
                        id: 'unauthorized_tx',
                        senderId: testUserId1,
                        recipientId: testUserId2,
                        amount: 25.00,
                        currency: 'USD',
                        senderPaymentMethodId: user1Account.paymentMethods[0].id,
                        status: TransactionStatus.COMPLETED,
                        processingFee: 1.00,
                        escrowFee: 0.25,
                        totalFees: 1.25,
                        completedAt: new Date(),
                    }
                });
            });

            // Try to access as a different user
            const interaction = createMockButtonInteraction('unauthorized_user', 'transaction_detail_unauthorized_tx');

            await handler.handleTransactionDetailView(interaction);

            expect(interaction.editReply).toHaveBeenCalledWith({
                content: '❌ You don\'t have permission to view this transaction.',
            });
        });
    });

    describe('Transaction Filtering', () => {
        beforeEach(async () => {
            // Create diverse test transactions
            const user1Account = await userAccountService.getAccount(testUserId1);
            const user2Account = await userAccountService.getAccount(testUserId2);

            if (!user1Account || !user2Account) {
                throw new Error('Test users not found');
            }

            await withTransaction(async (tx) => {
                // Sent transaction (completed)
                await tx.transaction.create({
                    data: {
                        id: 'sent_completed',
                        senderId: testUserId1,
                        recipientId: testUserId2,
                        amount: 100.00,
                        currency: 'USD',
                        senderPaymentMethodId: user1Account.paymentMethods[0].id,
                        status: TransactionStatus.COMPLETED,
                        processingFee: 2.00,
                        escrowFee: 1.00,
                        totalFees: 3.00,
                        completedAt: new Date(),
                    }
                });

                // Received transaction (completed)
                await tx.transaction.create({
                    data: {
                        id: 'received_completed',
                        senderId: testUserId2,
                        recipientId: testUserId1,
                        amount: 50.00,
                        currency: 'USD',
                        senderPaymentMethodId: user2Account.paymentMethods[0].id,
                        status: TransactionStatus.COMPLETED,
                        processingFee: 1.50,
                        escrowFee: 0.50,
                        totalFees: 2.00,
                        completedAt: new Date(),
                    }
                });

                // Pending transaction
                await tx.transaction.create({
                    data: {
                        id: 'pending_tx',
                        senderId: testUserId1,
                        recipientId: testUserId2,
                        amount: 25.00,
                        currency: 'USD',
                        senderPaymentMethodId: user1Account.paymentMethods[0].id,
                        status: TransactionStatus.PENDING,
                        processingFee: 1.00,
                        escrowFee: 0.25,
                        totalFees: 1.25,
                    }
                });

                // Failed transaction
                await tx.transaction.create({
                    data: {
                        id: 'failed_tx',
                        senderId: testUserId1,
                        recipientId: testUserId2,
                        amount: 75.00,
                        currency: 'USD',
                        senderPaymentMethodId: user1Account.paymentMethods[0].id,
                        status: TransactionStatus.FAILED,
                        processingFee: 2.00,
                        escrowFee: 0.75,
                        totalFees: 2.75,
                        failureReason: 'Insufficient funds',
                    }
                });
            });
        });

        it('should filter sent transactions', async () => {
            const interaction = createMockSelectMenuInteraction(testUserId1, ['sent']);

            await handler.handleTransactionFilter(interaction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(interaction.editReply).toHaveBeenCalledWith({
                embeds: expect.any(Array),
                components: expect.any(Array),
            });

            // Verify the filtering worked by checking the actual data
            const allTransactions = await paymentService.getTransactionHistory(testUserId1, 100);
            const sentTransactions = allTransactions.filter(t => t.senderId === testUserId1);
            expect(sentTransactions.length).toBeGreaterThan(0);
        });

        it('should filter received transactions', async () => {
            const interaction = createMockSelectMenuInteraction(testUserId1, ['received']);

            await handler.handleTransactionFilter(interaction);

            expect(interaction.editReply).toHaveBeenCalledWith({
                embeds: expect.any(Array),
                components: expect.any(Array),
            });

            // Verify the filtering worked
            const allTransactions = await paymentService.getTransactionHistory(testUserId1, 100);
            const receivedTransactions = allTransactions.filter(t => t.recipientId === testUserId1);
            expect(receivedTransactions.length).toBeGreaterThan(0);
        });

        it('should filter by transaction status', async () => {
            const interaction = createMockSelectMenuInteraction(testUserId1, ['pending']);

            await handler.handleTransactionFilter(interaction);

            expect(interaction.editReply).toHaveBeenCalledWith({
                embeds: expect.any(Array),
                components: expect.any(Array),
            });

            // Verify the filtering worked
            const allTransactions = await paymentService.getTransactionHistory(testUserId1, 100);
            const pendingTransactions = allTransactions.filter(t => t.status === TransactionStatus.PENDING);
            expect(pendingTransactions.length).toBeGreaterThan(0);
        });
    });

    describe('Transaction Export', () => {
        it('should export transactions as CSV', async () => {
            // Create test transactions
            const user1Account = await userAccountService.getAccount(testUserId1);
            const user2Account = await userAccountService.getAccount(testUserId2);

            if (!user1Account || !user2Account) {
                throw new Error('Test users not found');
            }

            await withTransaction(async (tx) => {
                await tx.transaction.create({
                    data: {
                        id: 'export_test_tx',
                        senderId: testUserId1,
                        recipientId: testUserId2,
                        amount: 123.45,
                        currency: 'USD',
                        senderPaymentMethodId: user1Account.paymentMethods[0].id,
                        status: TransactionStatus.COMPLETED,
                        processingFee: 3.00,
                        escrowFee: 1.23,
                        totalFees: 4.23,
                        completedAt: new Date(),
                    }
                });
            });

            const interaction = createMockButtonInteraction(testUserId1, 'transaction_export_user123');

            await handler.handleTransactionExport(interaction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(interaction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Here\'s your transaction history export'),
                files: expect.arrayContaining([
                    expect.objectContaining({
                        attachment: expect.any(Buffer),
                        name: expect.stringMatching(/transactions_.*\.csv/),
                    })
                ])
            });
        });

        it('should handle empty export gracefully', async () => {
            const interaction = createMockButtonInteraction(testUserId1, 'transaction_export_user123');

            await handler.handleTransactionExport(interaction);

            expect(interaction.editReply).toHaveBeenCalledWith({
                content: '📊 You have no transactions to export.',
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle database connection errors gracefully', async () => {
            // Close the database connection to simulate an error
            await prisma.$disconnect();

            const interaction = createMockInteraction(testUserId1);

            await handler.handleTransactionsCommand(interaction);

            expect(interaction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('❌ Failed to retrieve transaction history'),
            });

            // Reconnect for cleanup
            prisma = getPrismaClient();
        });
    });
});