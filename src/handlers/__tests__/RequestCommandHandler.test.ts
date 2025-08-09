// Request command handler tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandInteraction, User, ButtonInteraction } from 'discord.js';
import { RequestCommandHandler } from '../requests/RequestCommandHandler';
import { PaymentRequestService } from '../../services/PaymentRequestService';
import { PaymentService } from '../../services/PaymentService';
import { UserAccountService } from '../../services/UserAccountService';
import { NotificationService } from '../../services/NotificationService';
import { PaymentRequest, PaymentRequestStatus } from '../../models/PaymentRequest';
import { UserAccount } from '../../models/UserAccount';

describe('RequestCommandHandler', () => {
    let handler: RequestCommandHandler;
    let mockPaymentRequestService: PaymentRequestService;
    let mockPaymentService: PaymentService;
    let mockUserAccountService: UserAccountService;
    let mockNotificationService: NotificationService;
    let mockInteraction: CommandInteraction;
    let mockButtonInteraction: ButtonInteraction;
    let mockUser: User;
    let mockTargetUser: User;

    beforeEach(() => {
        // Mock services
        mockPaymentRequestService = {
            createPaymentRequest: vi.fn(),
            getPaymentRequest: vi.fn(),
            approvePaymentRequest: vi.fn(),
            declinePaymentRequest: vi.fn(),
            cancelPaymentRequest: vi.fn(),
            getPaymentRequestsForUser: vi.fn(),
            expireOldRequests: vi.fn(),
            getUserPendingRequests: vi.fn(),
        };

        mockPaymentService = {
            initiatePayment: vi.fn(),
            processPaymentRequest: vi.fn(),
            getTransactionHistory: vi.fn(),
            validatePaymentLimits: vi.fn(),
            getTransaction: vi.fn(),
            updateTransactionStatus: vi.fn(),
            selectPaymentMethod: vi.fn(),
            calculateTransactionFees: vi.fn(),
        };

        mockUserAccountService = {
            createAccount: vi.fn(),
            getAccount: vi.fn(),
            updateAccount: vi.fn(),
            addPaymentMethod: vi.fn(),
            removePaymentMethod: vi.fn(),
            getPaymentMethods: vi.fn(),
            updateNotificationPreferences: vi.fn(),
        };

        mockNotificationService = {
            sendDirectMessage: vi.fn(),
            sendChannelMessage: vi.fn(),
            sendPaymentNotification: vi.fn(),
            sendPaymentRequestApprovedNotification: vi.fn(),
            sendPaymentRequestDeclinedNotification: vi.fn(),
            sendPaymentCompletedNotification: vi.fn(),
        };

        // Mock users
        mockUser = {
            id: 'user123',
            displayName: 'TestUser',
            bot: false,
            displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
        } as User;

        mockTargetUser = {
            id: 'target456',
            displayName: 'TargetUser',
            bot: false,
            displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
        } as User;

        // Mock interactions
        mockInteraction = {
            user: mockUser,
            guildId: 'guild789',
            options: {
                getUser: vi.fn(),
                getNumber: vi.fn(),
                getString: vi.fn(),
            },
            reply: vi.fn(),
        } as unknown as CommandInteraction;

        mockButtonInteraction = {
            user: mockUser,
            customId: 'request_approve_req123',
            reply: vi.fn(),
            update: vi.fn(),
        } as unknown as ButtonInteraction;

        handler = new RequestCommandHandler(
            mockPaymentRequestService,
            mockPaymentService,
            mockUserAccountService,
            mockNotificationService
        );
    });

    describe('getCommandName', () => {
        it('should return "request"', () => {
            expect(handler.getCommandName()).toBe('request');
        });
    });

    describe('validateParameters', () => {
        it('should return true for valid parameters', () => {
            vi.mocked(mockInteraction.options.getUser).mockReturnValue(mockTargetUser);
            vi.mocked(mockInteraction.options.getNumber).mockReturnValue(50.00);
            vi.mocked(mockInteraction.options.getString).mockReturnValue('Test payment');

            expect(handler.validateParameters(mockInteraction)).toBe(true);
        });

        it('should return false for missing user', () => {
            vi.mocked(mockInteraction.options.getUser).mockReturnValue(null);
            vi.mocked(mockInteraction.options.getNumber).mockReturnValue(50.00);
            vi.mocked(mockInteraction.options.getString).mockReturnValue('Test payment');

            expect(handler.validateParameters(mockInteraction)).toBe(false);
        });

        it('should return false for invalid amount', () => {
            vi.mocked(mockInteraction.options.getUser).mockReturnValue(mockTargetUser);
            vi.mocked(mockInteraction.options.getNumber).mockReturnValue(0);
            vi.mocked(mockInteraction.options.getString).mockReturnValue('Test payment');

            expect(handler.validateParameters(mockInteraction)).toBe(false);
        });

        it('should return false for missing description', () => {
            vi.mocked(mockInteraction.options.getUser).mockReturnValue(mockTargetUser);
            vi.mocked(mockInteraction.options.getNumber).mockReturnValue(50.00);
            vi.mocked(mockInteraction.options.getString).mockReturnValue(null);

            expect(handler.validateParameters(mockInteraction)).toBe(false);
        });
    });

    describe('handleRequestCommand', () => {
        beforeEach(() => {
            vi.mocked(mockInteraction.options.getUser).mockReturnValue(mockTargetUser);
            vi.mocked(mockInteraction.options.getNumber).mockReturnValue(50.00);
            vi.mocked(mockInteraction.options.getString).mockReturnValue('Test payment request');
        });

        it('should create payment request successfully', async () => {
            const mockUserAccount: UserAccount = {
                discordId: 'user123',
                paymentMethods: [],
                transactionHistory: [],
                notificationPreferences: {
                    enableDMNotifications: true,
                    enableChannelNotifications: false,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const mockTargetAccount: UserAccount = {
                discordId: 'target456',
                paymentMethods: [],
                transactionHistory: [],
                notificationPreferences: {
                    enableDMNotifications: true,
                    enableChannelNotifications: false,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const mockPaymentRequest: PaymentRequest = {
                id: 'req123',
                requesterId: 'user123',
                payerId: 'target456',
                amount: 50.00,
                currency: 'USD',
                description: 'Test payment request',
                status: PaymentRequestStatus.PENDING,
                serverId: 'guild789',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                createdAt: new Date(),
            };

            vi.mocked(mockUserAccountService.getAccount)
                .mockResolvedValueOnce(mockUserAccount)
                .mockResolvedValueOnce(mockTargetAccount);
            vi.mocked(mockPaymentRequestService.createPaymentRequest).mockResolvedValue(mockPaymentRequest);

            await handler.handleRequestCommand(mockInteraction);

            expect(mockPaymentRequestService.createPaymentRequest).toHaveBeenCalledWith(
                'user123',
                'target456',
                50.00,
                'Test payment request',
                'guild789'
            );
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
            expect(mockNotificationService.sendDirectMessage).toHaveBeenCalled();
        });

        it('should reject request to self', async () => {
            vi.mocked(mockInteraction.options.getUser).mockReturnValue(mockUser);

            await handler.handleRequestCommand(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ You cannot request a payment from yourself.',
                ephemeral: true
            });
            expect(mockPaymentRequestService.createPaymentRequest).not.toHaveBeenCalled();
        });

        it('should reject request to bot', async () => {
            const botUser = { ...mockTargetUser, bot: true };
            vi.mocked(mockInteraction.options.getUser).mockReturnValue(botUser);

            await handler.handleRequestCommand(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ You cannot request payments from bots.',
                ephemeral: true
            });
            expect(mockPaymentRequestService.createPaymentRequest).not.toHaveBeenCalled();
        });

        it('should handle missing requester account', async () => {
            vi.mocked(mockUserAccountService.getAccount).mockResolvedValueOnce(null);

            await handler.handleRequestCommand(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ You need to set up your payment account first. Use `/setup-payment` to get started.',
                ephemeral: true
            });
            expect(mockPaymentRequestService.createPaymentRequest).not.toHaveBeenCalled();
        });

        it('should handle missing target account', async () => {
            const mockUserAccount: UserAccount = {
                discordId: 'user123',
                paymentMethods: [],
                transactionHistory: [],
                notificationPreferences: {
                    enableDMNotifications: true,
                    enableChannelNotifications: false,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            vi.mocked(mockUserAccountService.getAccount)
                .mockResolvedValueOnce(mockUserAccount)
                .mockResolvedValueOnce(null);

            await handler.handleRequestCommand(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ TargetUser needs to set up their payment account first.',
                ephemeral: true
            });
            expect(mockPaymentRequestService.createPaymentRequest).not.toHaveBeenCalled();
        });

        it('should handle service errors', async () => {
            const mockUserAccount: UserAccount = {
                discordId: 'user123',
                paymentMethods: [],
                transactionHistory: [],
                notificationPreferences: {
                    enableDMNotifications: true,
                    enableChannelNotifications: false,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            vi.mocked(mockUserAccountService.getAccount).mockResolvedValue(mockUserAccount);
            vi.mocked(mockPaymentRequestService.createPaymentRequest).mockRejectedValue(new Error('Service error'));

            await handler.handleRequestCommand(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Failed to create payment request: Service error',
                ephemeral: true
            });
        });
    });

    describe('handlePaymentRequestResponse', () => {
        const mockPaymentRequest: PaymentRequest = {
            id: 'req123',
            requesterId: 'requester789',
            payerId: 'user123',
            amount: 50.00,
            currency: 'USD',
            description: 'Test payment request',
            status: PaymentRequestStatus.PENDING,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdAt: new Date(),
        };

        it('should handle payment request approval', async () => {
            const mockUserAccount: UserAccount = {
                discordId: 'user123',
                paymentMethods: [{
                    id: 'pm123',
                    type: 'crypto',
                    displayName: 'My Crypto Wallet',
                    encryptedDetails: 'encrypted',
                    isActive: true,
                    addedAt: new Date(),
                }],
                transactionHistory: [],
                notificationPreferences: {
                    enableDMNotifications: true,
                    enableChannelNotifications: false,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const approvedRequest = { ...mockPaymentRequest, status: PaymentRequestStatus.APPROVED, transactionId: 'tx123' };

            vi.mocked(mockPaymentRequestService.getPaymentRequest).mockResolvedValue(mockPaymentRequest);
            vi.mocked(mockUserAccountService.getAccount).mockResolvedValue(mockUserAccount);
            vi.mocked(mockPaymentRequestService.approvePaymentRequest).mockResolvedValue(approvedRequest);

            await handler.handlePaymentRequestResponse(mockButtonInteraction);

            expect(mockPaymentRequestService.approvePaymentRequest).toHaveBeenCalledWith(
                'req123',
                'user123',
                'pm123'
            );
            expect(mockButtonInteraction.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '✅ Payment Request Approved'
                            })
                        })
                    ]),
                    components: []
                })
            );
            expect(mockNotificationService.sendPaymentRequestApprovedNotification).toHaveBeenCalled();
        });

        it('should handle payment request decline', async () => {
            mockButtonInteraction.customId = 'request_decline_req123';
            const declinedRequest = { ...mockPaymentRequest, status: PaymentRequestStatus.DECLINED };

            vi.mocked(mockPaymentRequestService.getPaymentRequest).mockResolvedValue(mockPaymentRequest);
            vi.mocked(mockPaymentRequestService.declinePaymentRequest).mockResolvedValue(declinedRequest);

            await handler.handlePaymentRequestResponse(mockButtonInteraction);

            expect(mockPaymentRequestService.declinePaymentRequest).toHaveBeenCalledWith('req123', 'user123');
            expect(mockButtonInteraction.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '❌ Payment Request Declined'
                            })
                        })
                    ]),
                    components: []
                })
            );
            expect(mockNotificationService.sendPaymentRequestDeclinedNotification).toHaveBeenCalled();
        });

        it('should handle invalid request ID', async () => {
            mockButtonInteraction.customId = 'request_approve_';

            await handler.handlePaymentRequestResponse(mockButtonInteraction);

            expect(mockButtonInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Invalid request ID.',
                ephemeral: true
            });
        });

        it('should handle non-existent payment request', async () => {
            vi.mocked(mockPaymentRequestService.getPaymentRequest).mockResolvedValue(null);

            await handler.handlePaymentRequestResponse(mockButtonInteraction);

            expect(mockButtonInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Payment request not found.',
                ephemeral: true
            });
        });

        it('should handle unauthorized user', async () => {
            const unauthorizedRequest = { ...mockPaymentRequest, payerId: 'other456' };
            vi.mocked(mockPaymentRequestService.getPaymentRequest).mockResolvedValue(unauthorizedRequest);

            await handler.handlePaymentRequestResponse(mockButtonInteraction);

            expect(mockButtonInteraction.reply).toHaveBeenCalledWith({
                content: '❌ You are not authorized to respond to this payment request.',
                ephemeral: true
            });
        });

        it('should handle service errors', async () => {
            vi.mocked(mockPaymentRequestService.getPaymentRequest).mockRejectedValue(new Error('Service error'));

            await handler.handlePaymentRequestResponse(mockButtonInteraction);

            expect(mockButtonInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Failed to process request: Service error',
                ephemeral: true
            });
        });
    });
});