// Integration tests for payment request workflow
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandInteraction, User, ButtonInteraction, Client } from 'discord.js';
import { RequestCommandHandler } from '../requests/RequestCommandHandler';
import { PaymentRequestServiceImpl } from '../../services/PaymentRequestService';
import { PaymentServiceImpl } from '../../services/PaymentService';
import { UserAccountServiceImpl } from '../../services/UserAccountService';
import { NotificationServiceImpl } from '../../services/NotificationService';
import { PaymentRequestStatus } from '../../models/PaymentRequest';
import { TransactionStatus } from '../../models/Transaction';
import { getPrismaClient } from '../../models/database';

// Mock the database and external dependencies
vi.mock('../../models/database', () => ({
    getPrismaClient: vi.fn(),
    withTransaction: vi.fn((callback) => callback({
        paymentRequest: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            findMany: vi.fn(),
        },
        userAccount: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        paymentMethodConfig: {
            findMany: vi.fn(),
        },
        transaction: {
            create: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
        },
        serverConfig: {
            findUnique: vi.fn(),
        }
    }))
}));

vi.mock('../../processors/PaymentProcessorFactory');
vi.mock('../../services/EscrowManager');

describe('Payment Request Integration Tests', () => {
    let handler: RequestCommandHandler;
    let mockPrisma: any;
    let mockClient: Client;
    let mockInteraction: CommandInteraction;
    let mockButtonInteraction: ButtonInteraction;
    let mockRequester: User;
    let mockPayer: User;

    beforeEach(() => {
        mockPrisma = {
            paymentRequest: {
                create: vi.fn(),
                findUnique: vi.fn(),
                update: vi.fn(),
                updateMany: vi.fn(),
                findMany: vi.fn(),
            },
            userAccount: {
                findUnique: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
            },
            paymentMethodConfig: {
                findMany: vi.fn(),
            },
            transaction: {
                create: vi.fn(),
                findUnique: vi.fn(),
                findMany: vi.fn(),
                update: vi.fn(),
            },
            serverConfig: {
                findUnique: vi.fn(),
            }
        };

        vi.mocked(getPrismaClient).mockReturnValue(mockPrisma);

        mockClient = {
            users: {
                fetch: vi.fn(),
            },
            channels: {
                fetch: vi.fn(),
            }
        } as unknown as Client;

        mockRequester = {
            id: '123456789012345678', // Valid Discord ID format
            displayName: 'Requester',
            displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
            bot: false,
            send: vi.fn(),
        } as unknown as User;

        mockPayer = {
            id: '987654321098765432', // Valid Discord ID format
            displayName: 'Payer',
            bot: false,
            send: vi.fn(),
        } as unknown as User;

        mockInteraction = {
            user: mockRequester,
            guildId: 'guild789',
            options: {
                getUser: vi.fn(),
                getNumber: vi.fn(),
                getString: vi.fn(),
            },
            reply: vi.fn(),
        } as unknown as CommandInteraction;

        mockButtonInteraction = {
            user: mockPayer,
            customId: 'request_approve_req123',
            reply: vi.fn(),
            update: vi.fn(),
        } as unknown as ButtonInteraction;

        // Set up services with real implementations
        const notificationService = new NotificationServiceImpl(mockClient);
        const userAccountService = new UserAccountServiceImpl();
        const paymentService = new PaymentServiceImpl();
        const paymentRequestService = new PaymentRequestServiceImpl(paymentService, userAccountService);

        handler = new RequestCommandHandler(
            paymentRequestService,
            paymentService,
            userAccountService,
            notificationService
        );

        // Mock client.users.fetch to return our mock users
        vi.mocked(mockClient.users.fetch).mockImplementation((userId: string) => {
            if (userId === '123456789012345678') return Promise.resolve(mockRequester);
            if (userId === '987654321098765432') return Promise.resolve(mockPayer);
            return Promise.reject(new Error('User not found'));
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Complete Payment Request Workflow', () => {
        it('should handle complete payment request creation and approval flow', async () => {
            // Setup interaction parameters
            vi.mocked(mockInteraction.options.getUser).mockReturnValue(mockPayer);
            vi.mocked(mockInteraction.options.getNumber).mockReturnValue(100.00);
            vi.mocked(mockInteraction.options.getString).mockReturnValue('Payment for services');

            // Mock user accounts
            const requesterAccount = {
                id: 'acc1',
                discordId: '123456789012345678',
                transactionHistoryJson: '[]',
                enableDMNotifications: true,
                enableChannelNotifications: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const payerAccount = {
                id: 'acc2',
                discordId: '987654321098765432',
                transactionHistoryJson: '[]',
                enableDMNotifications: true,
                enableChannelNotifications: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const payerPaymentMethod = {
                id: 'pm123',
                userId: 'acc2',
                type: 'CRYPTO',
                displayName: 'My Crypto Wallet',
                encryptedDetails: 'encrypted_wallet_data',
                isActive: true,
                addedAt: new Date(),
            };

            // Mock database responses for request creation
            mockPrisma.userAccount.findUnique
                .mockResolvedValueOnce(requesterAccount)
                .mockResolvedValueOnce(payerAccount);

            const createdRequest = {
                id: 'req123',
                requesterId: '123456789012345678',
                payerId: '987654321098765432',
                amount: 100.00,
                currency: 'USD',
                description: 'Payment for services',
                status: PaymentRequestStatus.PENDING,
                serverId: 'guild789',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                createdAt: new Date(),
                respondedAt: null,
                transactionId: null,
            };

            mockPrisma.paymentRequest.create.mockResolvedValue(createdRequest);

            // Step 1: Create payment request
            await handler.handleRequestCommand(mockInteraction);

            // Verify request creation
            expect(mockPrisma.paymentRequest.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    requesterId: '123456789012345678',
                    payerId: '987654321098765432',
                    amount: 100.00,
                    description: 'Payment for services',
                    status: PaymentRequestStatus.PENDING,
                    serverId: 'guild789',
                })
            });

            // Verify requester got confirmation
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    ephemeral: true,
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '💸 Payment Request Sent'
                            })
                        })
                    ])
                })
            );

            // Verify payer got DM notification
            expect(mockPayer.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '💰 Payment Request Received'
                            })
                        })
                    ]),
                    components: expect.arrayContaining([
                        expect.objectContaining({
                            components: expect.arrayContaining([
                                expect.objectContaining({
                                    data: expect.objectContaining({
                                        custom_id: 'request_approve_req123',
                                        label: '💳 Pay'
                                    })
                                }),
                                expect.objectContaining({
                                    data: expect.objectContaining({
                                        custom_id: 'request_decline_req123',
                                        label: '❌ Decline'
                                    })
                                })
                            ])
                        })
                    ])
                })
            );

            // Step 2: Mock approval flow
            // Mock database responses for approval
            mockPrisma.paymentRequest.findUnique.mockResolvedValue(createdRequest);
            mockPrisma.userAccount.findUnique.mockResolvedValue(payerAccount);
            mockPrisma.paymentMethodConfig.findMany.mockResolvedValue([payerPaymentMethod]);

            const createdTransaction = {
                id: 'tx123',
                senderId: '987654321098765432',
                recipientId: '123456789012345678',
                amount: 100.00,
                currency: 'USD',
                senderPaymentMethodId: 'pm123',
                recipientPaymentMethodId: null,
                status: TransactionStatus.PENDING,
                processingFee: 2.50,
                escrowFee: 1.00,
                totalFees: 3.50,
                createdAt: new Date(),
                completedAt: null,
                failureReason: null,
            };

            mockPrisma.transaction.create.mockResolvedValue(createdTransaction);

            const approvedRequest = {
                ...createdRequest,
                status: PaymentRequestStatus.APPROVED,
                respondedAt: new Date(),
                transactionId: 'tx123',
            };

            mockPrisma.paymentRequest.update.mockResolvedValue(approvedRequest);

            // Step 3: Handle approval
            await handler.handlePaymentRequestResponse(mockButtonInteraction);

            // Verify transaction was created
            expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    senderId: '987654321098765432',
                    recipientId: '123456789012345678',
                    amount: 100.00,
                    senderPaymentMethodId: 'pm123',
                    status: TransactionStatus.PENDING,
                })
            });

            // Verify request was updated to approved
            expect(mockPrisma.paymentRequest.update).toHaveBeenCalledWith({
                where: { id: 'req123' },
                data: {
                    status: PaymentRequestStatus.APPROVED,
                    respondedAt: expect.any(Date),
                    transactionId: 'tx123',
                }
            });

            // Verify payer got approval confirmation
            expect(mockButtonInteraction.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '✅ Payment Request Approved'
                            })
                        })
                    ]),
                    components: [] // Buttons removed
                })
            );

            // Verify requester got approval notification
            expect(mockRequester.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '✅ Payment Request Approved'
                            })
                        })
                    ])
                })
            );
        });

        it('should handle complete payment request creation and decline flow', async () => {
            // Setup interaction parameters
            vi.mocked(mockInteraction.options.getUser).mockReturnValue(mockPayer);
            vi.mocked(mockInteraction.options.getNumber).mockReturnValue(50.00);
            vi.mocked(mockInteraction.options.getString).mockReturnValue('Test payment');

            // Mock user accounts
            const requesterAccount = {
                id: 'acc1',
                discordId: '123456789012345678',
                transactionHistoryJson: '[]',
                enableDMNotifications: true,
                enableChannelNotifications: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const payerAccount = {
                id: 'acc2',
                discordId: '987654321098765432',
                transactionHistoryJson: '[]',
                enableDMNotifications: true,
                enableChannelNotifications: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.userAccount.findUnique
                .mockResolvedValueOnce(requesterAccount)
                .mockResolvedValueOnce(payerAccount);

            const createdRequest = {
                id: 'req456',
                requesterId: '123456789012345678',
                payerId: '987654321098765432',
                amount: 50.00,
                currency: 'USD',
                description: 'Test payment',
                status: PaymentRequestStatus.PENDING,
                serverId: 'guild789',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                createdAt: new Date(),
                respondedAt: null,
                transactionId: null,
            };

            mockPrisma.paymentRequest.create.mockResolvedValue(createdRequest);

            // Step 1: Create payment request
            await handler.handleRequestCommand(mockInteraction);

            // Step 2: Handle decline
            mockButtonInteraction.customId = 'request_decline_req456';
            mockPrisma.paymentRequest.findUnique.mockResolvedValue(createdRequest);

            const declinedRequest = {
                ...createdRequest,
                status: PaymentRequestStatus.DECLINED,
                respondedAt: new Date(),
            };

            mockPrisma.paymentRequest.update.mockResolvedValue(declinedRequest);

            await handler.handlePaymentRequestResponse(mockButtonInteraction);

            // Verify request was updated to declined
            expect(mockPrisma.paymentRequest.update).toHaveBeenCalledWith({
                where: { id: 'req456' },
                data: {
                    status: PaymentRequestStatus.DECLINED,
                    respondedAt: expect.any(Date),
                }
            });

            // Verify payer got decline confirmation
            expect(mockButtonInteraction.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '❌ Payment Request Declined'
                            })
                        })
                    ]),
                    components: [] // Buttons removed
                })
            );

            // Verify requester got decline notification
            expect(mockRequester.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '❌ Payment Request Declined'
                            })
                        })
                    ])
                })
            );
        });

        it('should handle request expiration', async () => {
            const expiredRequest = {
                id: 'req789',
                requesterId: '123456789012345678',
                payerId: '987654321098765432',
                amount: 25.00,
                currency: 'USD',
                description: 'Expired payment',
                status: PaymentRequestStatus.PENDING,
                serverId: null,
                expiresAt: new Date(Date.now() - 1000), // 1 second ago
                createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
                respondedAt: null,
                transactionId: null,
            };

            mockButtonInteraction.customId = 'request_approve_req789';
            mockPrisma.paymentRequest.findUnique.mockResolvedValue(expiredRequest);

            await handler.handlePaymentRequestResponse(mockButtonInteraction);

            // Should reject expired request
            expect(mockButtonInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('Payment request cannot be approved'),
                ephemeral: true
            });

            // Should not create transaction
            expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
        });
    });
});