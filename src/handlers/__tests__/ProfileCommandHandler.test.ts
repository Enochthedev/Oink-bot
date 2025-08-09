import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProfileCommandHandler } from '../ProfileCommandHandler';
import { UserAccountService, UserAccountServiceImpl } from '../../services/UserAccountService';
import { PaymentService, PaymentServiceImpl } from '../../services/PaymentService';
import { UserAccount, PaymentMethodConfig, UserAccountDB } from '../../models/UserAccount';

// Mock Discord.js
vi.mock('discord.js', () => ({
    EmbedBuilder: vi.fn().mockImplementation(() => ({
        setColor: vi.fn().mockReturnThis(),
        setTitle: vi.fn().mockReturnThis(),
        setThumbnail: vi.fn().mockReturnThis(),
        addFields: vi.fn().mockReturnThis(),
        setFooter: vi.fn().mockReturnThis(),
        setTimestamp: vi.fn().mockReturnThis(),
    })),
}));

// Mock services
vi.mock('../../services/UserAccountService');
vi.mock('../../services/PaymentService');

describe('ProfileCommandHandler', () => {
    let profileHandler: ProfileCommandHandler;
    let mockUserAccountService: vi.Mocked<UserAccountService>;
    let mockPaymentService: vi.Mocked<PaymentService>;
    let mockInteraction: any;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockUserAccountService = {
            getAccount: vi.fn(),
        } as any;

        mockPaymentService = {
            getUserActivity: vi.fn(),
        } as any;

        mockInteraction = {
            user: { 
                id: '123456789', 
                username: 'testuser',
                displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png')
            },
            options: {
                getUser: vi.fn().mockReturnValue(null), // Default to command user
            },
            deferReply: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
            editReply: vi.fn().mockResolvedValue(undefined),
            followUp: vi.fn().mockResolvedValue(undefined),
            isChatInputCommand: vi.fn().mockReturnValue(true),
        };

        profileHandler = new ProfileCommandHandler(mockUserAccountService, mockPaymentService);
    });

    describe('getCommandName', () => {
        it('should return "profile"', () => {
            expect(profileHandler.getCommandName()).toBe('profile');
        });
    });

    describe('handle', () => {
        it('should handle profile command successfully for own profile', async () => {
            const mockUserAccount: UserAccount = {
                id: 'user_123',
                discordId: '123456789',
                paymentMethods: [
                    {
                        id: 'pm_123',
                        type: 'CRYPTO',
                        displayName: 'Bitcoin Wallet',
                        encryptedDetails: 'encrypted_data',
                        isActive: true,
                        addedAt: new Date(),
                    }
                ],
                notificationPreferences: {
                    enableDMNotifications: true,
                    enableChannelNotifications: false,
                },
                isSetupComplete: true,
                isPublicProfile: false,
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date(),
            };

            const mockTransactions = [
                {
                    id: 'tx_123',
                    type: 'received',
                    amount: 50.00,
                    description: 'Payment received',
                },
                {
                    id: 'tx_124',
                    type: 'sent',
                    amount: 25.00,
                    description: 'Payment sent',
                }
            ];

            mockUserAccountService.getAccount.mockResolvedValue(mockUserAccount);
            mockPaymentService.getUserActivity.mockResolvedValue({
                totalSent: 25.00,
                totalReceived: 50.00,
                totalTransactions: 2,
                pendingRequests: 0,
                recentTransactions: [
                    {
                        type: 'RECEIVED',
                        amount: 50.00,
                        currency: 'USD',
                        status: 'COMPLETED'
                    },
                    {
                        type: 'SENT',
                        amount: 25.00,
                        currency: 'USD',
                        status: 'COMPLETED'
                    }
                ]
            });

            await profileHandler.handle(mockInteraction);

            expect(mockUserAccountService.getAccount).toHaveBeenCalledWith('123456789');
            expect(mockPaymentService.getUserActivity).toHaveBeenCalledWith('123456789');
        });

        it('should handle case when user has no account', async () => {
            mockUserAccountService.getAccount.mockResolvedValue(null);

            await profileHandler.handle(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ You don\'t have a payment account set up yet. Use `/setup-payment` to get started!',
                ephemeral: true
            });
        });

        it('should handle profile command for another user', async () => {
            const targetUser = { 
                id: '987654321', 
                username: 'otheruser',
                displayAvatarURL: vi.fn().mockReturnValue('https://example.com/other-avatar.png')
            };
            mockInteraction.options.getUser.mockReturnValue(targetUser);

            const mockUserAccount: UserAccount = {
                id: 'user_456',
                discordId: '987654321',
                paymentMethods: [],
                notificationPreferences: {
                    enableDMNotifications: false,
                    enableChannelNotifications: false,
                },
                isSetupComplete: true,
                isPublicProfile: true,
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date(),
            };

            mockUserAccountService.getAccount.mockResolvedValue(mockUserAccount);
            mockPaymentService.getUserActivity.mockResolvedValue({
                totalSent: 0,
                totalReceived: 0,
                totalTransactions: 0,
                pendingRequests: 0,
                recentTransactions: []
            });

            await profileHandler.handle(mockInteraction);

            expect(mockUserAccountService.getAccount).toHaveBeenCalledWith('987654321');
            expect(mockPaymentService.getUserActivity).toHaveBeenCalledWith('987654321');
        });
    });
});
