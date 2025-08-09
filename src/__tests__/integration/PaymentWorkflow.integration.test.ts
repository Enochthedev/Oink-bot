import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { Client, GatewayIntentBits, User, Guild, TextChannel } from 'discord.js';
import { DiscordBot } from '../../bot/DiscordBot';
import { PaymentServiceImpl } from '../../services/PaymentService';
import { UserAccountServiceImpl } from '../../services/UserAccountService';
import { EscrowManagerImpl } from '../../services/EscrowManager';
import { DefaultPaymentProcessorFactory } from '../../processors/PaymentProcessorFactory';
import { NotificationServiceImpl } from '../../services/NotificationService';
import { getPrismaClient } from '../../models/database';
import { PaymentMethodType } from '../../models/UserAccount';
import { TransactionStatus } from '../../models/Transaction';
import { TestDataFactory } from '../utils/TestDataFactory';
import { TestCleanupUtility } from '../utils/TestCleanupUtility';

/**
 * Complete Payment Workflow Integration Tests
 * Tests the entire payment flow from Discord command to transaction completion
 */
describe('Complete Payment Workflow Integration Tests', () => {
    let bot: DiscordBot;
    let paymentService: PaymentServiceImpl;
    let userAccountService: UserAccountServiceImpl;
    let notificationService: NotificationServiceImpl;
    let prisma: any;
    let testDataFactory: TestDataFactory;
    let cleanupUtility: TestCleanupUtility;

    // Test data
    let testGuild: Guild;
    let testChannel: TextChannel;
    let senderUser: User;
    let recipientUser: User;
    let adminUser: User;

    beforeAll(async () => {
        // Initialize database connection
        prisma = getPrismaClient();

        // Initialize test utilities
        testDataFactory = new TestDataFactory(prisma);
        cleanupUtility = new TestCleanupUtility(prisma);

        // Initialize services
        const paymentProcessorFactory = new DefaultPaymentProcessorFactory();
        userAccountService = new UserAccountServiceImpl();
        const escrowManager = new EscrowManagerImpl(paymentProcessorFactory);
        paymentService = new PaymentServiceImpl(escrowManager, userAccountService, paymentProcessorFactory);
        notificationService = new NotificationServiceImpl();

        // Initialize Discord bot
        bot = new DiscordBot();

        // Create mock Discord entities
        testGuild = await testDataFactory.createMockGuild();
        testChannel = await testDataFactory.createMockChannel(testGuild);
        senderUser = await testDataFactory.createMockUser('sender');
        recipientUser = await testDataFactory.createMockUser('recipient');
        adminUser = await testDataFactory.createMockUser('admin');
    });

    beforeEach(async () => {
        // Clean up any existing test data
        await cleanupUtility.cleanupTestData();

        // Create fresh test accounts
        await userAccountService.createAccount(senderUser.id);
        await userAccountService.createAccount(recipientUser.id);
        await userAccountService.createAccount(adminUser.id);

        // Add payment methods
        await userAccountService.addPaymentMethod(senderUser.id, {
            type: 'crypto' as PaymentMethodType,
            displayName: 'Test Bitcoin Wallet',
            encryptedDetails: {
                cryptoType: 'BTC',
                walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
            },
            isActive: true,
        });

        await userAccountService.addPaymentMethod(recipientUser.id, {
            type: 'ach' as PaymentMethodType,
            displayName: 'Test Bank Account',
            encryptedDetails: {
                routingNumber: '123456789',
                accountNumber: '987654321',
                accountType: 'checking',
            },
            isActive: true,
        });
    });

    afterEach(async () => {
        await cleanupUtility.cleanupTestData();
    });

    afterAll(async () => {
        await bot.stop();
        await prisma.$disconnect();
    });

    describe('End-to-End Payment Flow', () => {
        it('should complete full payment workflow from command to settlement', async () => {
            // Step 1: User initiates payment via Discord command
            const paymentInteraction = await testDataFactory.createMockCommandInteraction(
                'pay',
                senderUser,
                testGuild,
                {
                    user: recipientUser,
                    amount: 50.00,
                    description: 'Integration test payment'
                }
            );

            // Handle payment command
            const paymentHandler = bot.getCommandHandler('pay');
            await paymentHandler.handle(paymentInteraction);

            // Verify payment confirmation was sent
            expect(paymentInteraction.followUp).toHaveBeenCalled();
            const followUpCall = vi.mocked(paymentInteraction.followUp).mock.calls[0][0] as any;
            expect(followUpCall.embeds[0].data.title).toContain('Payment Confirmation');

            // Step 2: User confirms payment
            const confirmationInteraction = await testDataFactory.createMockButtonInteraction(
                'payment_confirm',
                senderUser,
                testGuild
            );

            await paymentHandler.handlePaymentConfirmation(confirmationInteraction);

            // Step 3: Verify transaction was created and escrowed
            const transactions = await prisma.transaction.findMany({
                where: {
                    senderId: senderUser.id,
                    recipientId: recipientUser.id,
                },
                include: {
                    escrowRecord: true,
                },
            });

            expect(transactions).toHaveLength(1);
            expect(transactions[0].status).toBe(TransactionStatus.ESCROWED);
            expect(transactions[0].amount).toBe(50.00);
            expect(transactions[0].escrowRecord).toBeDefined();

            // Step 4: Simulate recipient confirmation
            const recipientConfirmation = await testDataFactory.createMockButtonInteraction(
                'payment_receive_confirm',
                recipientUser,
                testGuild
            );

            await paymentHandler.handlePaymentReceiveConfirmation(recipientConfirmation);

            // Step 5: Verify transaction completion
            const completedTransaction = await prisma.transaction.findUnique({
                where: { id: transactions[0].id },
                include: { escrowRecord: true },
            });

            expect(completedTransaction?.status).toBe(TransactionStatus.COMPLETED);
            expect(completedTransaction?.completedAt).toBeDefined();

            // Step 6: Verify notifications were sent
            expect(senderUser.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Payment Sent'),
                            }),
                        }),
                    ]),
                })
            );

            expect(recipientUser.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Payment Received'),
                            }),
                        }),
                    ]),
                })
            );
        });

        it('should handle payment request workflow end-to-end', async () => {
            // Step 1: User creates payment request
            const requestInteraction = await testDataFactory.createMockCommandInteraction(
                'request',
                recipientUser,
                testGuild,
                {
                    user: senderUser,
                    amount: 25.00,
                    description: 'Payment request test'
                }
            );

            const requestHandler = bot.getCommandHandler('request');
            await requestHandler.handle(requestInteraction);

            // Verify request was created
            const paymentRequests = await prisma.paymentRequest.findMany({
                where: {
                    requesterId: recipientUser.id,
                    payerId: senderUser.id,
                },
            });

            expect(paymentRequests).toHaveLength(1);
            expect(paymentRequests[0].amount).toBe(25.00);
            expect(paymentRequests[0].status).toBe('pending');

            // Step 2: Payer receives notification and approves
            expect(senderUser.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Payment Request'),
                            }),
                        }),
                    ]),
                    components: expect.arrayContaining([
                        expect.objectContaining({
                            components: expect.arrayContaining([
                                expect.objectContaining({
                                    customId: expect.stringContaining('request_approve'),
                                }),
                            ]),
                        }),
                    ]),
                })
            );

            // Step 3: Simulate approval
            const approvalInteraction = await testDataFactory.createMockButtonInteraction(
                `request_approve_${paymentRequests[0].id}`,
                senderUser,
                testGuild
            );

            await requestHandler.handleRequestApproval(approvalInteraction);

            // Step 4: Verify payment was initiated
            const transactions = await prisma.transaction.findMany({
                where: {
                    senderId: senderUser.id,
                    recipientId: recipientUser.id,
                },
            });

            expect(transactions).toHaveLength(1);
            expect(transactions[0].status).toBe(TransactionStatus.ESCROWED);

            // Step 5: Verify request was marked as approved
            const updatedRequest = await prisma.paymentRequest.findUnique({
                where: { id: paymentRequests[0].id },
            });

            expect(updatedRequest?.status).toBe('approved');
        });

        it('should handle multi-payment-method selection workflow', async () => {
            // Add multiple payment methods to sender
            await userAccountService.addPaymentMethod(senderUser.id, {
                type: 'ach' as PaymentMethodType,
                displayName: 'Test Bank Account',
                encryptedDetails: {
                    routingNumber: '987654321',
                    accountNumber: '123456789',
                    accountType: 'savings',
                },
                isActive: true,
            });

            // Step 1: Initiate payment (should show method selection)
            const paymentInteraction = await testDataFactory.createMockCommandInteraction(
                'pay',
                senderUser,
                testGuild,
                {
                    user: recipientUser,
                    amount: 30.00,
                    description: 'Multi-method test'
                }
            );

            const paymentHandler = bot.getCommandHandler('pay');
            await paymentHandler.handle(paymentInteraction);

            // Verify method selection was presented
            const followUpCall = vi.mocked(paymentInteraction.followUp).mock.calls[0][0] as any;
            expect(followUpCall.components).toBeDefined();
            expect(followUpCall.components[0].components[0].type).toBe(3); // SELECT_MENU

            // Step 2: Select payment method
            const senderAccount = await userAccountService.getAccount(senderUser.id);
            const cryptoMethod = senderAccount!.paymentMethods.find(pm => pm.type === 'crypto');

            const methodSelectionInteraction = await testDataFactory.createMockSelectMenuInteraction(
                'payment_method_select',
                senderUser,
                testGuild,
                [cryptoMethod!.id]
            );

            await paymentHandler.handlePaymentMethodSelection(methodSelectionInteraction);

            // Verify confirmation was shown
            const editReplyCall = vi.mocked(methodSelectionInteraction.editReply).mock.calls[0][0] as any;
            expect(editReplyCall.embeds[0].data.title).toContain('Payment Confirmation');
            expect(editReplyCall.embeds[0].data.fields).toContainEqual(
                expect.objectContaining({
                    name: 'Payment Method',
                    value: expect.stringContaining('Test Bitcoin Wallet'),
                })
            );
        });
    });

    describe('Error Handling Workflows', () => {
        it('should handle payment processor failures gracefully', async () => {
            // Mock payment processor to fail
            const paymentProcessorFactory = new DefaultPaymentProcessorFactory();
            const mockProcessor = await paymentProcessorFactory.createProcessor('crypto');
            vi.spyOn(mockProcessor, 'withdrawFunds').mockRejectedValue(new Error('Network timeout'));

            // Attempt payment
            const paymentInteraction = await testDataFactory.createMockCommandInteraction(
                'pay',
                senderUser,
                testGuild,
                {
                    user: recipientUser,
                    amount: 20.00,
                    description: 'Processor failure test'
                }
            );

            const paymentHandler = bot.getCommandHandler('pay');
            await paymentHandler.handle(paymentInteraction);

            // Confirm payment (should fail)
            const confirmationInteraction = await testDataFactory.createMockButtonInteraction(
                'payment_confirm',
                senderUser,
                testGuild
            );

            await paymentHandler.handlePaymentConfirmation(confirmationInteraction);

            // Verify error was handled gracefully
            expect(confirmationInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Payment Failed'),
                            }),
                        }),
                    ]),
                })
            );

            // Verify no transaction was created
            const transactions = await prisma.transaction.findMany({
                where: {
                    senderId: senderUser.id,
                    recipientId: recipientUser.id,
                },
            });

            expect(transactions).toHaveLength(0);
        });

        it('should handle Discord API failures during notifications', async () => {
            // Mock Discord API to fail
            vi.spyOn(recipientUser, 'send').mockRejectedValue(new Error('Cannot send messages to this user'));

            // Complete a payment
            const transaction = await paymentService.initiatePayment(
                senderUser.id,
                recipientUser.id,
                15.00,
                'crypto',
                'API failure test'
            );

            // Verify transaction was still created despite notification failure
            expect(transaction.status).toBe(TransactionStatus.ESCROWED);

            // Verify error was logged
            const auditLogs = await prisma.auditLog.findMany({
                where: {
                    eventType: 'NOTIFICATION_FAILED',
                    userId: recipientUser.id,
                },
            });

            expect(auditLogs.length).toBeGreaterThan(0);
        });
    });

    describe('Server Configuration Workflows', () => {
        it('should enforce server payment limits', async () => {
            // Create server config with limits
            await prisma.serverConfig.create({
                data: {
                    serverId: testGuild.id,
                    paymentsEnabled: true,
                    maxAmountPerUser: 25.00,
                    maxTransactionsPerUser: 2,
                },
            });

            // First payment (should succeed)
            await paymentService.initiatePayment(
                senderUser.id,
                recipientUser.id,
                20.00,
                'crypto',
                'Limit test 1'
            );

            // Second payment (should succeed)
            await paymentService.initiatePayment(
                senderUser.id,
                recipientUser.id,
                5.00,
                'crypto',
                'Limit test 2'
            );

            // Third payment (should fail - transaction limit)
            await expect(
                paymentService.initiatePayment(
                    senderUser.id,
                    recipientUser.id,
                    10.00,
                    'crypto',
                    'Limit test 3'
                )
            ).rejects.toThrow('Daily transaction limit exceeded');

            // Large payment (should fail - amount limit)
            await expect(
                paymentService.initiatePayment(
                    senderUser.id,
                    adminUser.id,
                    30.00,
                    'crypto',
                    'Large payment test'
                )
            ).rejects.toThrow('Payment amount exceeds daily limit');
        });

        it('should handle disabled payments on server', async () => {
            // Disable payments for server
            await prisma.serverConfig.create({
                data: {
                    serverId: testGuild.id,
                    paymentsEnabled: false,
                    maxAmountPerUser: 100.00,
                    maxTransactionsPerUser: 10,
                },
            });

            // Attempt payment
            const paymentInteraction = await testDataFactory.createMockCommandInteraction(
                'pay',
                senderUser,
                testGuild,
                {
                    user: recipientUser,
                    amount: 10.00,
                    description: 'Disabled server test'
                }
            );

            const paymentHandler = bot.getCommandHandler('pay');
            await paymentHandler.handle(paymentInteraction);

            // Verify payment was rejected
            expect(paymentInteraction.followUp).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Payments Disabled'),
                            }),
                        }),
                    ]),
                })
            );
        });
    });
});