import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import {
    CommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    User,
    Client,
    GatewayIntentBits
} from 'discord.js';
import { PaymentCommandHandler } from '../PaymentCommandHandler';
import { PaymentServiceImpl } from '../../services/PaymentService';
import { UserAccountServiceImpl } from '../../services/UserAccountService';
import { EscrowManagerImpl } from '../../services/EscrowManager';
import { DefaultPaymentProcessorFactory } from '../../processors/PaymentProcessorFactory';
import { getPrismaClient, withTransaction } from '../../models/database';
import { PaymentMethodType } from '../../models/UserAccount';
import { TransactionStatus } from '../../models/Transaction';

// Mock Discord client for integration tests
const mockClient = {
    users: {
        fetch: vi.fn(),
    },
} as any;

describe('PaymentCommandHandler Integration Tests', () => {
    let handler: PaymentCommandHandler;
    let paymentService: PaymentServiceImpl;
    let userAccountService: UserAccountServiceImpl;
    let prisma: any;
    let testUserId: string;
    let testRecipientId: string;
    let testPaymentMethodId: string;

    beforeAll(async () => {
        prisma = getPrismaClient();

        // Initialize services with real implementations
        const paymentProcessorFactory = new DefaultPaymentProcessorFactory();
        userAccountService = new UserAccountServiceImpl();
        const escrowManager = new EscrowManagerImpl(paymentProcessorFactory);
        paymentService = new PaymentServiceImpl(escrowManager, userAccountService, paymentProcessorFactory);

        handler = new PaymentCommandHandler(paymentService, userAccountService);

        // Set up test data
        testUserId = '123456789012345678';
        testRecipientId = '987654321098765432';
    });

    beforeEach(async () => {
        // Use unique test user IDs for each test to avoid conflicts
        // Discord IDs are 18-digit numbers, so we'll generate valid ones
        const timestamp = Date.now().toString();
        testUserId = `${timestamp.padStart(18, '1')}`;
        testRecipientId = `${(timestamp + 1).toString().padStart(18, '2')}`;

        // Create test user accounts
        const senderAccount = await userAccountService.createAccount(testUserId);
        await userAccountService.createAccount(testRecipientId);

        // Add a payment method to sender
        const paymentMethod = await userAccountService.addPaymentMethod(testUserId, {
            type: 'crypto' as PaymentMethodType,
            displayName: 'Test Bitcoin Wallet',
            encryptedDetails: {
                cryptoType: 'BTC',
                walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
            },
            isActive: true,
        });
        testPaymentMethodId = paymentMethod.id;
    });

    afterEach(async () => {
        // Clean up test data after each test - order matters due to foreign keys
        try {
            // First delete transactions (they reference payment methods and users)
            await prisma.transaction.deleteMany({
                where: {
                    OR: [
                        { senderId: testUserId },
                        { recipientId: testUserId },
                        { senderId: testRecipientId },
                        { recipientId: testRecipientId },
                    ],
                },
            });

            // Then delete payment methods (they reference users)
            await prisma.paymentMethodConfig.deleteMany({
                where: {
                    user: {
                        discordId: { in: [testUserId, testRecipientId] },
                    },
                },
            });

            // Finally delete users
            await prisma.userAccount.deleteMany({
                where: {
                    discordId: { in: [testUserId, testRecipientId] },
                },
            });
        } catch (error) {
            console.warn('Cleanup error (non-critical):', error);
        }
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    describe('Complete Payment Flow Integration', () => {
        it('should handle complete payment flow from command to confirmation', async () => {
            // Mock Discord objects
            const mockSender: User = {
                id: testUserId,
                displayName: 'TestSender',
                send: vi.fn(),
            } as any;

            const mockRecipient: User = {
                id: testRecipientId,
                displayName: 'TestRecipient',
                send: vi.fn(),
            } as any;

            const mockInteraction: CommandInteraction = {
                commandName: 'pay',
                user: mockSender,
                guildId: '111111111111111111',
                options: {
                    getUser: vi.fn().mockReturnValue(mockRecipient),
                    getNumber: vi.fn().mockReturnValue(25.00),
                    getString: vi.fn().mockReturnValue('Integration test payment'),
                },
                deferReply: vi.fn(),
                reply: vi.fn(),
                followUp: vi.fn(),
                editReply: vi.fn(),
                replied: false,
                deferred: false,
            } as any;

            // Step 1: Handle initial payment command
            await handler.handle(mockInteraction);

            // Verify that the interaction was deferred and a response was sent
            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockInteraction.followUp).toHaveBeenCalled();

            // Get the response to verify it contains payment confirmation
            const followUpCall = vi.mocked(mockInteraction.followUp).mock.calls[0][0] as any;
            expect(followUpCall.embeds).toBeDefined();
            expect(followUpCall.components).toBeDefined();

            // Step 2: Simulate payment confirmation button click
            const mockButtonInteraction: ButtonInteraction = {
                customId: `payment_confirm_${testRecipientId}_25.00_${testPaymentMethodId}_Integration%20test%20payment`,
                user: mockSender,
                guildId: '111111111111111111',
                client: mockClient,
                deferUpdate: vi.fn(),
                update: vi.fn(),
                reply: vi.fn(),
                followUp: vi.fn(),
                editReply: vi.fn(),
                replied: false,
                deferred: false,
            } as any;

            // Mock client.users.fetch to return the recipient
            mockClient.users.fetch.mockResolvedValue(mockRecipient);

            await handler.handlePaymentConfirmation(mockButtonInteraction);

            // Verify that the payment was initiated
            expect(mockButtonInteraction.deferUpdate).toHaveBeenCalled();
            expect(mockButtonInteraction.editReply).toHaveBeenCalled();

            // Verify that the recipient was notified
            expect(mockRecipient.send).toHaveBeenCalled();

            // Step 3: Verify transaction was created in database
            const transactions = await prisma.transaction.findMany({
                where: {
                    senderId: testUserId,
                    recipientId: testRecipientId,
                },
            });

            expect(transactions).toHaveLength(1);
            expect(transactions[0].amount).toBe(25.00);
            expect(transactions[0].status).toBe(TransactionStatus.ESCROWED);

            // Step 4: Verify sender account was updated
            const senderAccount = await userAccountService.getAccount(testUserId);
            expect(senderAccount).toBeDefined();
            expect(senderAccount!.transactionHistory).toContain(transactions[0].id);
        });

        it('should handle payment method selection flow', async () => {
            // Add a second payment method to test selection
            await userAccountService.addPaymentMethod(testUserId, {
                type: 'ach' as PaymentMethodType,
                displayName: 'Test Bank Account',
                encryptedDetails: {
                    routingNumber: '123456789',
                    accountNumber: '987654321',
                    accountType: 'checking',
                },
                isActive: true,
            });

            const mockSender: User = {
                id: testUserId,
                displayName: 'TestSender',
                send: vi.fn(),
            } as any;

            const mockRecipient: User = {
                id: testRecipientId,
                displayName: 'TestRecipient',
                send: vi.fn(),
            } as any;

            const mockInteraction: CommandInteraction = {
                commandName: 'pay',
                user: mockSender,
                guildId: '111111111111111111',
                options: {
                    getUser: vi.fn().mockReturnValue(mockRecipient),
                    getNumber: vi.fn().mockReturnValue(15.00),
                    getString: vi.fn().mockReturnValue('Payment method selection test'),
                },
                deferReply: vi.fn(),
                reply: vi.fn(),
                followUp: vi.fn(),
                editReply: vi.fn(),
                replied: false,
                deferred: false,
            } as any;

            // Step 1: Handle initial payment command (should show payment method selection)
            await handler.handle(mockInteraction);

            expect(mockInteraction.followUp).toHaveBeenCalled();
            const followUpCall = vi.mocked(mockInteraction.followUp).mock.calls[0][0] as any;
            expect(followUpCall.components).toBeDefined();

            // Step 2: Simulate payment method selection
            const mockSelectMenuInteraction: StringSelectMenuInteraction = {
                customId: `payment_method_select_${testRecipientId}_15.00_Payment%20method%20selection%20test`,
                user: mockSender,
                values: [testPaymentMethodId],
                client: mockClient,
                deferUpdate: vi.fn(),
                update: vi.fn(),
                reply: vi.fn(),
                followUp: vi.fn(),
                editReply: vi.fn(),
                replied: false,
                deferred: false,
            } as any;

            mockClient.users.fetch.mockResolvedValue(mockRecipient);

            await handler.handlePaymentMethodSelection(mockSelectMenuInteraction);

            expect(mockSelectMenuInteraction.deferUpdate).toHaveBeenCalled();
            expect(mockSelectMenuInteraction.editReply).toHaveBeenCalled();

            // Verify that payment confirmation was shown
            const editReplyCall = vi.mocked(mockSelectMenuInteraction.editReply).mock.calls[0][0] as any;
            expect(editReplyCall.embeds).toBeDefined();
            expect(editReplyCall.components).toBeDefined();
        });

        it('should handle payment limits validation', async () => {
            // Create a server config with low limits
            await prisma.serverConfig.create({
                data: {
                    serverId: '111111111111111111',
                    paymentsEnabled: true,
                    maxAmountPerUser: 10.00,
                    maxTransactionsPerUser: 1,
                },
            });

            const mockSender: User = {
                id: testUserId,
                displayName: 'TestSender',
                send: vi.fn(),
            } as any;

            const mockRecipient: User = {
                id: testRecipientId,
                displayName: 'TestRecipient',
                send: vi.fn(),
            } as any;

            const mockInteraction: CommandInteraction = {
                commandName: 'pay',
                user: mockSender,
                guildId: '111111111111111111',
                options: {
                    getUser: vi.fn().mockReturnValue(mockRecipient),
                    getNumber: vi.fn().mockReturnValue(15.00), // Exceeds limit
                    getString: vi.fn().mockReturnValue('Limit test payment'),
                },
                deferReply: vi.fn(),
                reply: vi.fn(),
                followUp: vi.fn(),
                editReply: vi.fn(),
                replied: false,
                deferred: false,
            } as any;

            await handler.handle(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockInteraction.followUp).toHaveBeenCalled();

            // Verify that the response indicates limit exceeded
            const followUpCall = vi.mocked(mockInteraction.followUp).mock.calls[0][0] as any;
            expect(followUpCall.embeds[0].data.title).toContain('Limit Exceeded');
        });

        it('should handle user with no payment methods', async () => {
            // Create a user with no payment methods
            const noPaymentUserId = '555555555555555555';
            await userAccountService.createAccount(noPaymentUserId);

            const mockSender: User = {
                id: noPaymentUserId,
                displayName: 'NoPaymentUser',
                send: vi.fn(),
            } as any;

            const mockRecipient: User = {
                id: testRecipientId,
                displayName: 'TestRecipient',
                send: vi.fn(),
            } as any;

            const mockInteraction: CommandInteraction = {
                commandName: 'pay',
                user: mockSender,
                guildId: '111111111111111111',
                options: {
                    getUser: vi.fn().mockReturnValue(mockRecipient),
                    getNumber: vi.fn().mockReturnValue(10.00),
                    getString: vi.fn().mockReturnValue('No payment methods test'),
                },
                deferReply: vi.fn(),
                reply: vi.fn(),
                followUp: vi.fn(),
                editReply: vi.fn(),
                replied: false,
                deferred: false,
            } as any;

            await handler.handle(mockInteraction);

            expect(mockInteraction.followUp).toHaveBeenCalled();
            const followUpCall = vi.mocked(mockInteraction.followUp).mock.calls[0][0] as any;
            expect(followUpCall.embeds[0].data.title).toContain('No Payment Methods');
            expect(followUpCall.components).toBeDefined();

            // Clean up
            await prisma.userAccount.delete({
                where: { discordId: noPaymentUserId },
            });
        });

        it('should handle payment cancellation', async () => {
            const mockButtonInteraction: ButtonInteraction = {
                customId: 'payment_cancel',
                user: { id: testUserId } as User,
                update: vi.fn(),
                reply: vi.fn(),
                followUp: vi.fn(),
                editReply: vi.fn(),
                replied: false,
                deferred: false,
            } as any;

            await handler.handlePaymentCancellation(mockButtonInteraction);

            expect(mockButtonInteraction.update).toHaveBeenCalled();
            const updateCall = vi.mocked(mockButtonInteraction.update).mock.calls[0][0] as any;
            expect(updateCall.embeds[0].data.title).toContain('Cancelled');
            expect(updateCall.components).toEqual([]);
        });
    });

    describe('Error Handling Integration', () => {
        it('should handle database errors gracefully', async () => {
            // Mock a database error by using an invalid user ID format
            const mockSender: User = {
                id: 'invalid_user_id',
                displayName: 'InvalidUser',
                send: vi.fn(),
            } as any;

            const mockRecipient: User = {
                id: testRecipientId,
                displayName: 'TestRecipient',
                send: vi.fn(),
            } as any;

            const mockInteraction: CommandInteraction = {
                commandName: 'pay',
                user: mockSender,
                guildId: '111111111111111111',
                options: {
                    getUser: vi.fn().mockReturnValue(mockRecipient),
                    getNumber: vi.fn().mockReturnValue(10.00),
                    getString: vi.fn().mockReturnValue('Error test payment'),
                },
                deferReply: vi.fn(),
                reply: vi.fn(),
                followUp: vi.fn(),
                editReply: vi.fn(),
                replied: false,
                deferred: false,
            } as any;

            await handler.handle(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockInteraction.followUp).toHaveBeenCalled();

            // Verify that an error response was sent
            const followUpCall = vi.mocked(mockInteraction.followUp).mock.calls[0][0] as any;
            expect(followUpCall.embeds[0].data.title).toContain('Failed');
        });

        it('should handle payment service errors during confirmation', async () => {
            const mockSender: User = {
                id: testUserId,
                displayName: 'TestSender',
                send: vi.fn(),
            } as any;

            const mockRecipient: User = {
                id: testRecipientId,
                displayName: 'TestRecipient',
                send: vi.fn(),
            } as any;

            // Mock payment service to throw an error
            const originalInitiatePayment = paymentService.initiatePayment;
            paymentService.initiatePayment = vi.fn().mockRejectedValue(new Error('Payment processor unavailable'));

            const mockButtonInteraction: ButtonInteraction = {
                customId: `payment_confirm_${testRecipientId}_10.00_${testPaymentMethodId}_Error%20test`,
                user: mockSender,
                guildId: '111111111111111111',
                client: mockClient,
                deferUpdate: vi.fn(),
                update: vi.fn(),
                reply: vi.fn(),
                followUp: vi.fn(),
                editReply: vi.fn(),
                replied: false,
                deferred: false,
            } as any;

            mockClient.users.fetch.mockResolvedValue(mockRecipient);

            await handler.handlePaymentConfirmation(mockButtonInteraction);

            expect(mockButtonInteraction.deferUpdate).toHaveBeenCalled();
            expect(mockButtonInteraction.editReply).toHaveBeenCalled();

            const editReplyCall = vi.mocked(mockButtonInteraction.editReply).mock.calls[0][0] as any;
            expect(editReplyCall.embeds[0].data.title).toContain('Failed');

            // Restore original method
            paymentService.initiatePayment = originalInitiatePayment;
        });
    });
});