// Unit tests for SetupCommandHandler
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SetupCommandHandlerImpl } from '../SetupCommandHandler';
import { UserAccountService } from '../../services/UserAccountService';
import {
    CommandInteraction,
    ButtonInteraction,
    ModalSubmitInteraction,
    User,
    TextInputModalData
} from 'discord.js';

// Mock UserAccountService
const mockUserAccountService: UserAccountService = {
    createAccount: vi.fn(),
    getAccount: vi.fn(),
    addPaymentMethod: vi.fn(),
    removePaymentMethod: vi.fn(),
    updateNotificationPreferences: vi.fn(),
    validatePaymentMethod: vi.fn(),
    encryptPaymentDetails: vi.fn(),
    decryptPaymentDetails: vi.fn(),
};

// Mock Discord.js objects
const createMockUser = (id: string = '123456789012345678'): User => ({
    id,
    send: vi.fn(),
} as any);

const createMockCommandInteraction = (user: User): CommandInteraction => ({
    user,
    reply: vi.fn(),
} as any);

const createMockButtonInteraction = (customId: string, user: User): ButtonInteraction => ({
    customId,
    user,
    reply: vi.fn(),
    showModal: vi.fn(),
} as any);

const createMockModalSubmitInteraction = (customId: string, user: User, fields: any): ModalSubmitInteraction => ({
    customId,
    user,
    reply: vi.fn(),
    fields: {
        getTextInputValue: vi.fn((fieldId: string) => fields[fieldId] || ''),
    },
} as any);

describe('SetupCommandHandler', () => {
    let setupHandler: SetupCommandHandlerImpl;
    let mockUser: User;

    beforeEach(() => {
        setupHandler = new SetupCommandHandlerImpl(mockUserAccountService);
        mockUser = createMockUser();
        vi.clearAllMocks();
    });

    describe('handleSetupCommand', () => {
        it('should initiate setup for new user', async () => {
            const interaction = createMockCommandInteraction(mockUser);

            mockUserAccountService.getAccount = vi.fn().mockResolvedValue(null);
            mockUserAccountService.createAccount = vi.fn().mockResolvedValue({
                id: 'user_123',
                discordId: '123456789012345678',
                paymentMethods: [],
                transactionHistory: [],
                notificationPreferences: {
                    enableDMNotifications: true,
                    enableChannelNotifications: false,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            mockUser.send = vi.fn().mockResolvedValue({});

            await setupHandler.handleSetupCommand(interaction);

            expect(mockUserAccountService.createAccount).toHaveBeenCalledWith('123456789012345678');
            expect(mockUser.send).toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith({
                content: '✅ Payment setup instructions have been sent to your DMs. Please check your direct messages to continue.',
                ephemeral: true,
            });
        });

        it('should initiate setup for existing user', async () => {
            const interaction = createMockCommandInteraction(mockUser);

            mockUserAccountService.getAccount = vi.fn().mockResolvedValue({
                id: 'user_123',
                discordId: '123456789012345678',
                paymentMethods: [],
                transactionHistory: [],
                notificationPreferences: {
                    enableDMNotifications: true,
                    enableChannelNotifications: false,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            mockUser.send = vi.fn().mockResolvedValue({});

            await setupHandler.handleSetupCommand(interaction);

            expect(mockUserAccountService.createAccount).not.toHaveBeenCalled();
            expect(mockUser.send).toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith({
                content: '✅ Payment setup instructions have been sent to your DMs. Please check your direct messages to continue.',
                ephemeral: true,
            });
        });

        it('should handle DM send failure', async () => {
            const interaction = createMockCommandInteraction(mockUser);

            mockUserAccountService.getAccount = vi.fn().mockResolvedValue(null);
            mockUserAccountService.createAccount = vi.fn().mockResolvedValue({});
            mockUser.send = vi.fn().mockRejectedValue(new Error('Cannot send DM'));

            await setupHandler.handleSetupCommand(interaction);

            expect(interaction.reply).toHaveBeenCalledWith({
                content: '❌ Failed to initiate payment setup. Please try again later.',
                ephemeral: true,
            });
        });
    });

    describe('handleSetupButton', () => {
        it('should show crypto setup modal', async () => {
            const interaction = createMockButtonInteraction('setup_crypto', mockUser);

            await setupHandler.handleSetupButton(interaction);

            expect(interaction.showModal).toHaveBeenCalled();
            const modalCall = (interaction.showModal as any).mock.calls[0][0];
            expect(modalCall.data.custom_id).toBe('crypto_setup_modal');
            expect(modalCall.data.title).toBe('Add Cryptocurrency Wallet');
        });

        it('should show ACH setup modal', async () => {
            const interaction = createMockButtonInteraction('setup_ach', mockUser);

            await setupHandler.handleSetupButton(interaction);

            expect(interaction.showModal).toHaveBeenCalled();
            const modalCall = (interaction.showModal as any).mock.calls[0][0];
            expect(modalCall.data.custom_id).toBe('ach_setup_modal');
            expect(modalCall.data.title).toBe('Add Bank Account (ACH)');
        });

        it('should show other payment method setup modal', async () => {
            const interaction = createMockButtonInteraction('setup_other', mockUser);

            await setupHandler.handleSetupButton(interaction);

            expect(interaction.showModal).toHaveBeenCalled();
            const modalCall = (interaction.showModal as any).mock.calls[0][0];
            expect(modalCall.data.custom_id).toBe('other_setup_modal');
            expect(modalCall.data.title).toBe('Add Other Payment Method');
        });

        it('should handle unknown button', async () => {
            const interaction = createMockButtonInteraction('unknown_button', mockUser);

            await setupHandler.handleSetupButton(interaction);

            expect(interaction.reply).toHaveBeenCalledWith({
                content: '❌ Unknown setup option.',
                ephemeral: true,
            });
        });
    });

    describe('handleSetupModal', () => {
        it('should process crypto setup modal successfully', async () => {
            const fields = {
                crypto_display_name: 'My Bitcoin Wallet',
                crypto_type: 'BTC',
                wallet_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
            };
            const interaction = createMockModalSubmitInteraction('crypto_setup_modal', mockUser, fields);

            const mockAddedMethod = {
                id: 'pm_123',
                type: 'crypto' as const,
                displayName: 'My Bitcoin Wallet',
                encryptedDetails: 'encrypted_data',
                isActive: true,
                addedAt: new Date(),
            };

            mockUserAccountService.addPaymentMethod = vi.fn().mockResolvedValue(mockAddedMethod);

            await setupHandler.handleSetupModal(interaction);

            expect(mockUserAccountService.addPaymentMethod).toHaveBeenCalledWith(
                '123456789012345678',
                {
                    type: 'crypto',
                    displayName: 'My Bitcoin Wallet',
                    encryptedDetails: {
                        cryptoType: 'BTC',
                        walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
                    },
                    isActive: true,
                }
            );

            expect(interaction.reply).toHaveBeenCalled();
            const replyCall = (interaction.reply as any).mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toBe('✅ Cryptocurrency Wallet Added');
        });

        it('should process ACH setup modal successfully', async () => {
            const fields = {
                ach_display_name: 'My Checking Account',
                routing_number: '123456789',
                account_number: '1234567890',
                account_type: 'checking',
            };
            const interaction = createMockModalSubmitInteraction('ach_setup_modal', mockUser, fields);

            const mockAddedMethod = {
                id: 'pm_124',
                type: 'ach' as const,
                displayName: 'My Checking Account',
                encryptedDetails: 'encrypted_data',
                isActive: true,
                addedAt: new Date(),
            };

            mockUserAccountService.addPaymentMethod = vi.fn().mockResolvedValue(mockAddedMethod);

            await setupHandler.handleSetupModal(interaction);

            expect(mockUserAccountService.addPaymentMethod).toHaveBeenCalledWith(
                '123456789012345678',
                {
                    type: 'ach',
                    displayName: 'My Checking Account',
                    encryptedDetails: {
                        routingNumber: '123456789',
                        accountNumber: '1234567890',
                        accountType: 'checking',
                    },
                    isActive: true,
                }
            );

            expect(interaction.reply).toHaveBeenCalled();
            const replyCall = (interaction.reply as any).mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toBe('✅ Bank Account Added');
        });

        it('should process other payment method setup modal successfully', async () => {
            const fields = {
                other_display_name: 'My PayPal Account',
                provider: 'PayPal',
                account_id: 'user@example.com',
            };
            const interaction = createMockModalSubmitInteraction('other_setup_modal', mockUser, fields);

            const mockAddedMethod = {
                id: 'pm_125',
                type: 'other' as const,
                displayName: 'My PayPal Account',
                encryptedDetails: 'encrypted_data',
                isActive: true,
                addedAt: new Date(),
            };

            mockUserAccountService.addPaymentMethod = vi.fn().mockResolvedValue(mockAddedMethod);

            await setupHandler.handleSetupModal(interaction);

            expect(mockUserAccountService.addPaymentMethod).toHaveBeenCalledWith(
                '123456789012345678',
                {
                    type: 'other',
                    displayName: 'My PayPal Account',
                    encryptedDetails: {
                        provider: 'PayPal',
                        accountId: 'user@example.com',
                    },
                    isActive: true,
                }
            );

            expect(interaction.reply).toHaveBeenCalled();
            const replyCall = (interaction.reply as any).mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toBe('✅ Payment Method Added');
        });

        it('should handle payment method addition failure', async () => {
            const fields = {
                crypto_display_name: 'My Bitcoin Wallet',
                crypto_type: 'BTC',
                wallet_address: 'invalid_address',
            };
            const interaction = createMockModalSubmitInteraction('crypto_setup_modal', mockUser, fields);

            mockUserAccountService.addPaymentMethod = vi.fn().mockRejectedValue(new Error('Invalid payment method details'));

            await setupHandler.handleSetupModal(interaction);

            expect(interaction.reply).toHaveBeenCalledWith({
                content: '❌ Failed to add payment method: Invalid payment method details',
                ephemeral: true,
            });
        });

        it('should handle unknown modal', async () => {
            const interaction = createMockModalSubmitInteraction('unknown_modal', mockUser, {});

            await setupHandler.handleSetupModal(interaction);

            expect(interaction.reply).toHaveBeenCalledWith({
                content: '❌ Unknown setup form.',
                ephemeral: true,
            });
        });
    });
});