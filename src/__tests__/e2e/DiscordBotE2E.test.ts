import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { Client, GatewayIntentBits, Guild, TextChannel, User, Message } from 'discord.js';
import { DiscordBot } from '../../bot/DiscordBot';
import { getPrismaClient } from '../../models/database';
import { TestDataFactory } from '../utils/TestDataFactory';
import { TestCleanupUtility } from '../utils/TestCleanupUtility';
import { MockDiscordServer } from '../utils/MockDiscordServer';

/**
 * End-to-End Discord Bot Tests
 * Tests the bot in a simulated Discord server environment
 */
describe('Discord Bot End-to-End Tests', () => {
    let bot: DiscordBot;
    let mockServer: MockDiscordServer;
    let prisma: any;
    let testDataFactory: TestDataFactory;
    let cleanupUtility: TestCleanupUtility;

    // Mock Discord entities
    let testGuild: Guild;
    let testChannel: TextChannel;
    let testUsers: User[];

    beforeAll(async () => {
        // Initialize database and utilities
        prisma = getPrismaClient();
        testDataFactory = new TestDataFactory(prisma);
        cleanupUtility = new TestCleanupUtility(prisma);

        // Initialize mock Discord server
        mockServer = new MockDiscordServer();
        await mockServer.initialize();

        // Create test Discord entities
        testGuild = await mockServer.createGuild('Test Payment Server');
        testChannel = await mockServer.createChannel(testGuild, 'payments');
        testUsers = await Promise.all([
            mockServer.createUser('alice', 'Alice'),
            mockServer.createUser('bob', 'Bob'),
            mockServer.createUser('charlie', 'Charlie'),
            mockServer.createUser('admin', 'Admin User'),
        ]);

        // Initialize and start bot
        bot = new DiscordBot();
        await bot.start();

        // Simulate bot joining the guild
        await mockServer.addBotToGuild(testGuild, bot.getClient());
    });

    beforeEach(async () => {
        await cleanupUtility.cleanupTestData();

        // Reset mock server state
        mockServer.resetInteractions();

        // Create fresh user accounts
        for (const user of testUsers) {
            await testDataFactory.createUserAccount(user.id);
        }
    });

    afterEach(async () => {
        await cleanupUtility.cleanupTestData();
    });

    afterAll(async () => {
        await bot.stop();
        await mockServer.shutdown();
        await prisma.$disconnect();
    });

    describe('Bot Initialization and Setup', () => {
        it('should register all slash commands on guild join', async () => {
            const registeredCommands = await mockServer.getRegisteredCommands(testGuild);

            const expectedCommands = ['ping', 'pay', 'request', 'transactions', 'setup-payment', 'payment-config'];

            expectedCommands.forEach(commandName => {
                expect(registeredCommands.some(cmd => cmd.name === commandName)).toBe(true);
            });
        });

        it('should respond to ping command', async () => {
            const interaction = await mockServer.simulateSlashCommand(
                testUsers[0],
                testChannel,
                'ping'
            );

            await mockServer.waitForResponse(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Pong!'),
                })
            );
        });

        it('should handle unknown commands gracefully', async () => {
            const interaction = await mockServer.simulateSlashCommand(
                testUsers[0],
                testChannel,
                'unknown-command'
            );

            await mockServer.waitForResponse(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Unknown command'),
                    ephemeral: true,
                })
            );
        });
    });

    describe('User Onboarding Flow', () => {
        it('should guide new users through payment setup', async () => {
            const newUser = testUsers[0];

            // User tries to make payment without setup
            const paymentInteraction = await mockServer.simulateSlashCommand(
                newUser,
                testChannel,
                'pay',
                {
                    user: testUsers[1],
                    amount: 10.00,
                    description: 'Test payment'
                }
            );

            await mockServer.waitForResponse(paymentInteraction);

            // Should prompt for setup
            expect(paymentInteraction.followUp).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Setup Required'),
                            }),
                        }),
                    ]),
                    components: expect.arrayContaining([
                        expect.objectContaining({
                            components: expect.arrayContaining([
                                expect.objectContaining({
                                    customId: 'setup_payment_methods',
                                }),
                            ]),
                        }),
                    ]),
                })
            );

            // User clicks setup button
            const setupInteraction = await mockServer.simulateButtonClick(
                newUser,
                'setup_payment_methods'
            );

            await mockServer.waitForResponse(setupInteraction);

            // Should receive DM with setup instructions
            expect(newUser.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Payment Setup'),
                            }),
                        }),
                    ]),
                })
            );
        });

        it('should handle payment method setup via DM', async () => {
            const user = testUsers[0];

            // Simulate setup-payment command
            const setupInteraction = await mockServer.simulateSlashCommand(
                user,
                testChannel,
                'setup-payment'
            );

            await mockServer.waitForResponse(setupInteraction);

            // Should receive DM
            expect(user.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Payment Method Setup'),
                            }),
                        }),
                    ]),
                    components: expect.arrayContaining([
                        expect.objectContaining({
                            components: expect.arrayContaining([
                                expect.objectContaining({
                                    customId: expect.stringContaining('setup_crypto'),
                                }),
                                expect.objectContaining({
                                    customId: expect.stringContaining('setup_ach'),
                                }),
                            ]),
                        }),
                    ]),
                })
            );

            // User selects crypto setup
            const cryptoSetupInteraction = await mockServer.simulateButtonClick(
                user,
                'setup_crypto'
            );

            await mockServer.waitForResponse(cryptoSetupInteraction);

            // Should show crypto setup form
            expect(cryptoSetupInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Cryptocurrency Setup'),
                            }),
                        }),
                    ]),
                    components: expect.arrayContaining([
                        expect.objectContaining({
                            components: expect.arrayContaining([
                                expect.objectContaining({
                                    type: 4, // TEXT_INPUT
                                    customId: 'crypto_wallet_address',
                                }),
                            ]),
                        }),
                    ]),
                })
            );
        });
    });

    describe('Payment Command Workflows', () => {
        beforeEach(async () => {
            // Set up payment methods for test users
            await testDataFactory.addPaymentMethodToUser(testUsers[0].id, 'crypto', {
                cryptoType: 'BTC',
                walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
            });

            await testDataFactory.addPaymentMethodToUser(testUsers[1].id, 'ach', {
                routingNumber: '123456789',
                accountNumber: '987654321',
                accountType: 'checking',
            });
        });

        it('should handle complete payment flow in channel', async () => {
            const sender = testUsers[0];
            const recipient = testUsers[1];

            // Step 1: Initiate payment
            const paymentInteraction = await mockServer.simulateSlashCommand(
                sender,
                testChannel,
                'pay',
                {
                    user: recipient,
                    amount: 25.00,
                    description: 'E2E test payment'
                }
            );

            await mockServer.waitForResponse(paymentInteraction);

            // Should show confirmation
            expect(paymentInteraction.followUp).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Payment Confirmation'),
                            }),
                        }),
                    ]),
                })
            );

            // Step 2: Confirm payment
            const confirmInteraction = await mockServer.simulateButtonClick(
                sender,
                'payment_confirm'
            );

            await mockServer.waitForResponse(confirmInteraction);

            // Should update with success message
            expect(confirmInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Payment Initiated'),
                            }),
                        }),
                    ]),
                })
            );

            // Step 3: Verify recipient notification
            expect(recipient.send).toHaveBeenCalledWith(
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

            // Step 4: Verify transaction in database
            const transactions = await prisma.transaction.findMany({
                where: {
                    senderId: sender.id,
                    recipientId: recipient.id,
                },
            });

            expect(transactions).toHaveLength(1);
            expect(transactions[0].amount).toBe(25.00);
        });

        it('should handle payment request flow', async () => {
            const requester = testUsers[1];
            const payer = testUsers[0];

            // Step 1: Create payment request
            const requestInteraction = await mockServer.simulateSlashCommand(
                requester,
                testChannel,
                'request',
                {
                    user: payer,
                    amount: 15.00,
                    description: 'E2E request test'
                }
            );

            await mockServer.waitForResponse(requestInteraction);

            // Should confirm request creation
            expect(requestInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Payment Request Sent'),
                            }),
                        }),
                    ]),
                })
            );

            // Step 2: Verify payer received notification
            expect(payer.send).toHaveBeenCalledWith(
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
                                expect.objectContaining({
                                    customId: expect.stringContaining('request_decline'),
                                }),
                            ]),
                        }),
                    ]),
                })
            );

            // Step 3: Payer approves request
            const approveInteraction = await mockServer.simulateButtonClick(
                payer,
                'request_approve'
            );

            await mockServer.waitForResponse(approveInteraction);

            // Should initiate payment
            expect(approveInteraction.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Payment Approved'),
                            }),
                        }),
                    ]),
                })
            );

            // Step 4: Verify transaction was created
            const transactions = await prisma.transaction.findMany({
                where: {
                    senderId: payer.id,
                    recipientId: requester.id,
                },
            });

            expect(transactions).toHaveLength(1);
            expect(transactions[0].amount).toBe(15.00);
        });

        it('should handle transaction history command', async () => {
            const user = testUsers[0];

            // Create some test transactions
            await testDataFactory.createTransaction(user.id, testUsers[1].id, 10.00, 'completed');
            await testDataFactory.createTransaction(user.id, testUsers[2].id, 20.00, 'pending');
            await testDataFactory.createTransaction(testUsers[1].id, user.id, 5.00, 'completed');

            // Request transaction history
            const historyInteraction = await mockServer.simulateSlashCommand(
                user,
                testChannel,
                'transactions'
            );

            await mockServer.waitForResponse(historyInteraction);

            // Should show transaction history
            expect(historyInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Transaction History'),
                                fields: expect.arrayContaining([
                                    expect.objectContaining({
                                        name: expect.stringContaining('Sent'),
                                        value: expect.stringContaining('$10.00'),
                                    }),
                                    expect.objectContaining({
                                        name: expect.stringContaining('Received'),
                                        value: expect.stringContaining('$5.00'),
                                    }),
                                ]),
                            }),
                        }),
                    ]),
                })
            );
        });
    });

    describe('Admin Command Workflows', () => {
        beforeEach(async () => {
            // Set up admin user
            await testDataFactory.createServerConfig(testGuild.id, {
                adminUserIds: [testUsers[3].id],
                paymentsEnabled: true,
                maxAmountPerUser: 100.00,
                maxTransactionsPerUser: 10,
            });
        });

        it('should handle payment configuration by admin', async () => {
            const admin = testUsers[3];

            // Admin configures payment settings
            const configInteraction = await mockServer.simulateSlashCommand(
                admin,
                testChannel,
                'payment-config',
                {
                    enabled: false,
                    max_amount: 50.00,
                    max_transactions: 5,
                }
            );

            await mockServer.waitForResponse(configInteraction);

            // Should confirm configuration update
            expect(configInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Configuration Updated'),
                            }),
                        }),
                    ]),
                })
            );

            // Verify configuration was saved
            const serverConfig = await prisma.serverConfig.findUnique({
                where: { serverId: testGuild.id },
            });

            expect(serverConfig?.paymentsEnabled).toBe(false);
            expect(serverConfig?.maxAmountPerUser).toBe(50.00);
            expect(serverConfig?.maxTransactionsPerUser).toBe(5);
        });

        it('should reject admin commands from non-admin users', async () => {
            const regularUser = testUsers[0];

            // Regular user tries admin command
            const configInteraction = await mockServer.simulateSlashCommand(
                regularUser,
                testChannel,
                'payment-config',
                {
                    enabled: true,
                    max_amount: 1000.00,
                }
            );

            await mockServer.waitForResponse(configInteraction);

            // Should reject with permission error
            expect(configInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Permission Denied'),
                            }),
                        }),
                    ]),
                    ephemeral: true,
                })
            );
        });
    });

    describe('Error Scenarios', () => {
        it('should handle bot restart gracefully', async () => {
            const user = testUsers[0];

            // Start a payment
            const paymentInteraction = await mockServer.simulateSlashCommand(
                user,
                testChannel,
                'pay',
                {
                    user: testUsers[1],
                    amount: 10.00,
                    description: 'Restart test'
                }
            );

            await mockServer.waitForResponse(paymentInteraction);

            // Simulate bot restart
            await bot.stop();
            await bot.start();
            await mockServer.addBotToGuild(testGuild, bot.getClient());

            // Bot should still respond to commands
            const pingInteraction = await mockServer.simulateSlashCommand(
                user,
                testChannel,
                'ping'
            );

            await mockServer.waitForResponse(pingInteraction);

            expect(pingInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Pong!'),
                })
            );
        });

        it('should handle Discord API rate limits', async () => {
            const user = testUsers[0];

            // Simulate rate limit by mocking Discord API
            mockServer.simulateRateLimit();

            const interaction = await mockServer.simulateSlashCommand(
                user,
                testChannel,
                'ping'
            );

            // Should handle rate limit gracefully
            await mockServer.waitForResponse(interaction, 5000); // Longer timeout

            expect(interaction.reply).toHaveBeenCalled();
        });

        it('should handle database connection failures', async () => {
            const user = testUsers[0];

            // Simulate database failure
            await prisma.$disconnect();

            const paymentInteraction = await mockServer.simulateSlashCommand(
                user,
                testChannel,
                'pay',
                {
                    user: testUsers[1],
                    amount: 10.00,
                    description: 'DB failure test'
                }
            );

            await mockServer.waitForResponse(paymentInteraction);

            // Should handle gracefully with error message
            expect(paymentInteraction.followUp).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Service Unavailable'),
                            }),
                        }),
                    ]),
                })
            );

            // Reconnect for cleanup
            prisma = getPrismaClient();
        });
    });
});