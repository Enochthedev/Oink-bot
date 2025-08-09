import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    CommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    User,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    StringSelectMenuBuilder
} from 'discord.js';
import { PaymentCommandHandler } from '../PaymentCommandHandler';
import { PaymentService } from '../../services/PaymentService';
import { UserAccountService } from '../../services/UserAccountService';
import { PaymentMethodType } from '../../models/UserAccount';
import { Transaction, TransactionStatus } from '../../models/Transaction';

// Mock Discord.js
vi.mock('discord.js', async () => {
    const actual = await vi.importActual('discord.js');
    return {
        ...actual,
        EmbedBuilder: vi.fn().mockImplementation(() => ({
            setTitle: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            setColor: vi.fn().mockReturnThis(),
            addFields: vi.fn().mockReturnThis(),
            setFooter: vi.fn().mockReturnThis(),
            setTimestamp: vi.fn().mockReturnThis(),
        })),
        ActionRowBuilder: vi.fn().mockImplementation(() => ({
            addComponents: vi.fn().mockReturnThis(),
        })),
        ButtonBuilder: vi.fn().mockImplementation(() => ({
            setCustomId: vi.fn().mockReturnThis(),
            setLabel: vi.fn().mockReturnThis(),
            setStyle: vi.fn().mockReturnThis(),
            setEmoji: vi.fn().mockReturnThis(),
        })),
        StringSelectMenuBuilder: vi.fn().mockImplementation(() => ({
            setCustomId: vi.fn().mockReturnThis(),
            setPlaceholder: vi.fn().mockReturnThis(),
            addOptions: vi.fn().mockReturnThis(),
        })),
        StringSelectMenuOptionBuilder: vi.fn().mockImplementation(() => ({
            setLabel: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            setValue: vi.fn().mockReturnThis(),
            setEmoji: vi.fn().mockReturnThis(),
        })),
    };
});

describe('PaymentCommandHandler', () => {
    let handler: PaymentCommandHandler;
    let mockPaymentService: PaymentService;
    let mockUserAccountService: UserAccountService;
    let mockInteraction: CommandInteraction;
    let mockButtonInteraction: ButtonInteraction;
    let mockSelectMenuInteraction: StringSelectMenuInteraction;
    let mockUser: User;
    let mockRecipient: User;

    beforeEach(() => {
        // Mock services
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
            updatePaymentMethod: vi.fn(),
            getPaymentMethods: vi.fn(),
        };

        // Mock users
        mockUser = {
            id: '123456789012345678',
            displayName: 'TestUser',
            send: vi.fn(),
        } as any;

        mockRecipient = {
            id: '987654321098765432',
            displayName: 'RecipientUser',
            send: vi.fn(),
        } as any;

        // Mock interactions
        mockInteraction = {
            commandName: 'pay',
            user: mockUser,
            guildId: '111111111111111111',
            options: {
                getUser: vi.fn(),
                getNumber: vi.fn(),
                getString: vi.fn(),
            },
            deferReply: vi.fn(),
            reply: vi.fn(),
            followUp: vi.fn(),
            editReply: vi.fn(),
            replied: false,
            deferred: false,
        } as any;

        mockButtonInteraction = {
            customId: 'payment_confirm_987654321098765432_10.00_pm123_test%20payment',
            user: mockUser,
            guildId: '111111111111111111',
            client: {
                users: {
                    fetch: vi.fn(),
                },
            },
            deferUpdate: vi.fn(),
            update: vi.fn(),
            reply: vi.fn(),
            followUp: vi.fn(),
            editReply: vi.fn(),
            replied: false,
            deferred: false,
        } as any;

        mockSelectMenuInteraction = {
            customId: 'payment_method_select_987654321098765432_10.00_test%20payment',
            user: mockUser,
            values: ['pm123'],
            client: {
                users: {
                    fetch: vi.fn(),
                },
            },
            deferUpdate: vi.fn(),
            update: vi.fn(),
            reply: vi.fn(),
            followUp: vi.fn(),
            editReply: vi.fn(),
            replied: false,
            deferred: false,
        } as any;

        handler = new PaymentCommandHandler(mockPaymentService, mockUserAccountService);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getCommandName', () => {
        it('should return "pay"', () => {
            expect(handler.getCommandName()).toBe('pay');
        });
    });

    describe('validateParameters', () => {
        it('should return true for valid parameters', () => {
            mockInteraction.options.getUser = vi.fn().mockReturnValue(mockRecipient);
            mockInteraction.options.getNumber = vi.fn().mockReturnValue(10.50);

            const result = handler.validateParameters(mockInteraction);
            expect(result).toBe(true);
        });

        it('should return false if recipient is the same as sender', () => {
            mockInteraction.options.getUser = vi.fn().mockReturnValue(mockUser);
            mockInteraction.options.getNumber = vi.fn().mockReturnValue(10.50);

            const result = handler.validateParameters(mockInteraction);
            expect(result).toBe(false);
        });

        it('should return false if amount is zero or negative', () => {
            mockInteraction.options.getUser = vi.fn().mockReturnValue(mockRecipient);
            mockInteraction.options.getNumber = vi.fn().mockReturnValue(0);

            const result = handler.validateParameters(mockInteraction);
            expect(result).toBe(false);
        });

        it('should return false if recipient is null', () => {
            mockInteraction.options.getUser = vi.fn().mockReturnValue(null);
            mockInteraction.options.getNumber = vi.fn().mockReturnValue(10.50);

            const result = handler.validateParameters(mockInteraction);
            expect(result).toBe(false);
        });
    });

    describe('handle', () => {
        beforeEach(() => {
            mockInteraction.options.getUser = vi.fn().mockReturnValue(mockRecipient);
            mockInteraction.options.getNumber = vi.fn().mockReturnValue(10.50);
            mockInteraction.options.getString = vi.fn().mockReturnValue('Test payment');
        });

        it('should handle payment when sender has no payment methods', async () => {
            mockUserAccountService.getAccount = vi.fn().mockResolvedValue({
                id: 'acc123',
                discordId: mockUser.id,
                paymentMethods: [],
                transactionHistory: [],
                notificationPreferences: { enableDMNotifications: true, enableChannelNotifications: true },
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Mock the deferred state
            mockInteraction.deferReply = vi.fn().mockImplementation(() => {
                mockInteraction.deferred = true;
            });

            await handler.handle(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockInteraction.followUp).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([expect.any(Object)]),
                    components: expect.arrayContaining([expect.any(Object)]),
                })
            );
        });

        it('should handle payment when sender has payment methods', async () => {
            const mockPaymentMethod = {
                id: 'pm123',
                type: 'crypto' as PaymentMethodType,
                displayName: 'My Bitcoin Wallet',
                encryptedDetails: 'encrypted_data',
                isActive: true,
                addedAt: new Date(),
            };

            mockUserAccountService.getAccount = vi.fn()
                .mockResolvedValueOnce({
                    id: 'acc123',
                    discordId: mockUser.id,
                    paymentMethods: [mockPaymentMethod],
                    transactionHistory: [],
                    notificationPreferences: { enableDMNotifications: true, enableChannelNotifications: true },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .mockResolvedValueOnce({
                    id: 'acc456',
                    discordId: mockRecipient.id,
                    paymentMethods: [],
                    transactionHistory: [],
                    notificationPreferences: { enableDMNotifications: true, enableChannelNotifications: true },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });

            mockPaymentService.validatePaymentLimits = vi.fn().mockResolvedValue(true);
            mockPaymentService.calculateTransactionFees = vi.fn().mockResolvedValue({
                processingFee: 0.50,
                escrowFee: 0.10,
                total: 0.60,
            });

            await handler.handle(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockUserAccountService.getAccount).toHaveBeenCalledWith(mockUser.id);
            expect(mockPaymentService.validatePaymentLimits).toHaveBeenCalledWith(
                mockUser.id,
                10.50,
                mockInteraction.guildId
            );
        });

        it('should handle payment limit exceeded', async () => {
            const mockPaymentMethod = {
                id: 'pm123',
                type: 'crypto' as PaymentMethodType,
                displayName: 'My Bitcoin Wallet',
                encryptedDetails: 'encrypted_data',
                isActive: true,
                addedAt: new Date(),
            };

            mockUserAccountService.getAccount = vi.fn()
                .mockResolvedValueOnce({
                    id: 'acc123',
                    discordId: mockUser.id,
                    paymentMethods: [mockPaymentMethod],
                    transactionHistory: [],
                    notificationPreferences: { enableDMNotifications: true, enableChannelNotifications: true },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .mockResolvedValueOnce({
                    id: 'acc456',
                    discordId: mockRecipient.id,
                    paymentMethods: [],
                    transactionHistory: [],
                    notificationPreferences: { enableDMNotifications: true, enableChannelNotifications: true },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });

            mockPaymentService.validatePaymentLimits = vi.fn().mockResolvedValue(false);

            // Mock the deferred state
            mockInteraction.deferReply = vi.fn().mockImplementation(() => {
                mockInteraction.deferred = true;
            });

            await handler.handle(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockPaymentService.validatePaymentLimits).toHaveBeenCalledWith(
                mockUser.id,
                10.50,
                mockInteraction.guildId
            );
            expect(mockInteraction.followUp).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([expect.any(Object)]),
                })
            );
        });

        it('should create recipient account if it does not exist', async () => {
            const mockPaymentMethod = {
                id: 'pm123',
                type: 'crypto' as PaymentMethodType,
                displayName: 'My Bitcoin Wallet',
                encryptedDetails: 'encrypted_data',
                isActive: true,
                addedAt: new Date(),
            };

            mockUserAccountService.getAccount = vi.fn()
                .mockResolvedValueOnce({
                    id: 'acc123',
                    discordId: mockUser.id,
                    paymentMethods: [mockPaymentMethod],
                    transactionHistory: [],
                    notificationPreferences: { enableDMNotifications: true, enableChannelNotifications: true },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .mockResolvedValueOnce(null); // Recipient doesn't exist

            mockUserAccountService.createAccount = vi.fn().mockResolvedValue({
                id: 'acc456',
                discordId: mockRecipient.id,
                paymentMethods: [],
                transactionHistory: [],
                notificationPreferences: { enableDMNotifications: true, enableChannelNotifications: true },
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            mockPaymentService.validatePaymentLimits = vi.fn().mockResolvedValue(true);
            mockPaymentService.calculateTransactionFees = vi.fn().mockResolvedValue({
                processingFee: 0.50,
                escrowFee: 0.10,
                total: 0.60,
            });

            await handler.handle(mockInteraction);

            expect(mockUserAccountService.createAccount).toHaveBeenCalledWith(mockRecipient.id);
        });
    });

    describe('handlePaymentMethodSelection', () => {
        it('should handle payment method selection correctly', async () => {
            const mockPaymentMethod = {
                id: 'pm123',
                type: 'crypto' as PaymentMethodType,
                displayName: 'My Bitcoin Wallet',
                encryptedDetails: 'encrypted_data',
                isActive: true,
                addedAt: new Date(),
            };

            mockSelectMenuInteraction.client.users.fetch = vi.fn().mockResolvedValue(mockRecipient);
            mockUserAccountService.getAccount = vi.fn().mockResolvedValue({
                id: 'acc123',
                discordId: mockUser.id,
                paymentMethods: [mockPaymentMethod],
                transactionHistory: [],
                notificationPreferences: { enableDMNotifications: true, enableChannelNotifications: true },
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            mockPaymentService.calculateTransactionFees = vi.fn().mockResolvedValue({
                processingFee: 0.50,
                escrowFee: 0.10,
                total: 0.60,
            });

            await handler.handlePaymentMethodSelection(mockSelectMenuInteraction);

            expect(mockSelectMenuInteraction.deferUpdate).toHaveBeenCalled();
            expect(mockSelectMenuInteraction.client.users.fetch).toHaveBeenCalledWith('987654321098765432');
            expect(mockUserAccountService.getAccount).toHaveBeenCalledWith(mockUser.id);
        });

        it('should handle error when payment method not found', async () => {
            mockSelectMenuInteraction.client.users.fetch = vi.fn().mockResolvedValue(mockRecipient);
            mockUserAccountService.getAccount = vi.fn().mockResolvedValue({
                id: 'acc123',
                discordId: mockUser.id,
                paymentMethods: [], // No payment methods
                transactionHistory: [],
                notificationPreferences: { enableDMNotifications: true, enableChannelNotifications: true },
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            await handler.handlePaymentMethodSelection(mockSelectMenuInteraction);

            // The error handler should call one of the reply methods
            expect(
                mockSelectMenuInteraction.reply.mock.calls.length +
                mockSelectMenuInteraction.update.mock.calls.length +
                mockSelectMenuInteraction.followUp.mock.calls.length +
                mockSelectMenuInteraction.editReply.mock.calls.length
            ).toBeGreaterThan(0);
        });
    });

    describe('handlePaymentConfirmation', () => {
        it('should handle payment confirmation successfully', async () => {
            const mockTransaction: Transaction = {
                id: 'tx123',
                senderId: mockUser.id,
                recipientId: mockRecipient.id,
                amount: 10.00,
                currency: 'USD',
                senderPaymentMethod: {
                    id: 'pm123',
                    type: 'crypto' as PaymentMethodType,
                    displayName: 'My Bitcoin Wallet',
                    encryptedDetails: 'encrypted_data',
                    isActive: true,
                    addedAt: new Date(),
                },
                status: TransactionStatus.ESCROWED,
                fees: {
                    processingFee: 0.50,
                    escrowFee: 0.10,
                    total: 0.60,
                },
                createdAt: new Date(),
            };

            mockButtonInteraction.client.users.fetch = vi.fn().mockResolvedValue(mockRecipient);
            mockPaymentService.initiatePayment = vi.fn().mockResolvedValue(mockTransaction);

            await handler.handlePaymentConfirmation(mockButtonInteraction);

            expect(mockButtonInteraction.deferUpdate).toHaveBeenCalled();
            expect(mockButtonInteraction.client.users.fetch).toHaveBeenCalledWith('987654321098765432');
            expect(mockPaymentService.initiatePayment).toHaveBeenCalledWith(
                mockUser.id,
                '987654321098765432',
                10.00,
                'pm123',
                undefined,
                mockButtonInteraction.guildId
            );
            expect(mockRecipient.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([expect.any(Object)]),
                    components: expect.arrayContaining([expect.any(Object)]),
                })
            );
        });

        it('should handle payment confirmation error', async () => {
            mockButtonInteraction.client.users.fetch = vi.fn().mockResolvedValue(mockRecipient);
            mockPaymentService.initiatePayment = vi.fn().mockRejectedValue(new Error('Payment failed'));

            // Mock the deferred state
            mockButtonInteraction.deferUpdate = vi.fn().mockImplementation(() => {
                mockButtonInteraction.deferred = true;
            });

            await handler.handlePaymentConfirmation(mockButtonInteraction);

            expect(mockButtonInteraction.deferUpdate).toHaveBeenCalled();
            expect(mockButtonInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([expect.any(Object)]),
                    components: [],
                })
            );
        });
    });

    describe('handlePaymentCancellation', () => {
        it('should handle payment cancellation', async () => {
            await handler.handlePaymentCancellation(mockButtonInteraction);

            expect(mockButtonInteraction.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([expect.any(Object)]),
                    components: [],
                })
            );
        });
    });

    describe('error handling', () => {
        it('should handle errors gracefully in main handle method', async () => {
            mockInteraction.options.getUser = vi.fn().mockReturnValue(mockRecipient);
            mockInteraction.options.getNumber = vi.fn().mockReturnValue(10.50);
            mockInteraction.options.getString = vi.fn().mockReturnValue('Test payment');

            mockUserAccountService.getAccount = vi.fn().mockRejectedValue(new Error('Database error'));

            // Mock the deferred state
            mockInteraction.deferReply = vi.fn().mockImplementation(() => {
                mockInteraction.deferred = true;
            });

            await handler.handle(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockInteraction.followUp).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([expect.any(Object)]),
                    components: [],
                })
            );
        });
    });
});