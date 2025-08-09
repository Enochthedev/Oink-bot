// PaymentConfigCommandHandler unit tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaymentConfigCommandHandler } from '../config/PaymentConfigCommandHandler';
import { ServerConfigService } from '../../services/ServerConfigService';
import { ServerConfig } from '../../models/ServerConfig';
import {
    CommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    PermissionFlagsBits,
    Guild,
    GuildMember,
    User
} from 'discord.js';

// Mock ServerConfigService
const mockServerConfigService: jest.Mocked<ServerConfigService> = {
    getServerConfig: vi.fn(),
    upsertServerConfig: vi.fn(),
    arePaymentsEnabled: vi.fn(),
    validatePaymentLimits: vi.fn(),
    isServerAdmin: vi.fn(),
    isPaymentMethodAllowed: vi.fn(),
    getDailyTransactionStats: vi.fn(),
};

// Mock Discord.js objects
const createMockUser = (id: string = 'user123'): Partial<User> => ({
    id,
    tag: 'TestUser#1234',
    displayName: 'TestUser',
});

const createMockGuildMember = (permissions: bigint[] = []): Partial<GuildMember> => ({
    permissions: {
        has: vi.fn((permission: any) => permissions.includes(permission)),
    } as any,
});

const createMockGuild = (id: string = 'guild123'): Partial<Guild> => ({
    id,
    name: 'Test Guild',
});

const createMockCommandInteraction = (
    commandName: string = 'payment-config',
    guildId: string | null = 'guild123',
    permissions: bigint[] = []
): Partial<CommandInteraction> => ({
    commandName,
    guildId,
    user: createMockUser() as User,
    member: createMockGuildMember(permissions) as GuildMember,
    memberPermissions: {
        has: vi.fn((permission: any) => permissions.includes(permission)),
    } as any,
    guild: guildId ? createMockGuild(guildId) as Guild : null,
    replied: false,
    deferred: false,
    reply: vi.fn(),
    deferReply: vi.fn(),
    followUp: vi.fn(),
    editReply: vi.fn(),
    options: {
        getBoolean: vi.fn(),
        getNumber: vi.fn(),
    } as any,
});

const createMockButtonInteraction = (
    customId: string,
    guildId: string | null = 'guild123',
    permissions: bigint[] = []
): Partial<ButtonInteraction> => ({
    customId,
    guildId,
    user: createMockUser() as User,
    member: createMockGuildMember(permissions) as GuildMember,
    memberPermissions: {
        has: vi.fn((permission: any) => permissions.includes(permission)),
    } as any,
    guild: guildId ? createMockGuild(guildId) as Guild : null,
    replied: false,
    deferred: false,
    reply: vi.fn(),
    deferUpdate: vi.fn(),
    update: vi.fn(),
    followUp: vi.fn(),
    editReply: vi.fn(),
});

const createMockStringSelectMenuInteraction = (
    customId: string,
    values: string[] = [],
    guildId: string | null = 'guild123',
    permissions: bigint[] = []
): Partial<StringSelectMenuInteraction> => ({
    customId,
    values,
    guildId,
    user: createMockUser() as User,
    member: createMockGuildMember(permissions) as GuildMember,
    memberPermissions: {
        has: vi.fn((permission: any) => permissions.includes(permission)),
    } as any,
    guild: guildId ? createMockGuild(guildId) as Guild : null,
    replied: false,
    deferred: false,
    reply: vi.fn(),
    deferUpdate: vi.fn(),
    update: vi.fn(),
    followUp: vi.fn(),
    editReply: vi.fn(),
});

const createMockModalSubmitInteraction = (
    customId: string,
    fieldValues: Record<string, string> = {},
    guildId: string | null = 'guild123',
    permissions: bigint[] = []
): Partial<ModalSubmitInteraction> => ({
    customId,
    guildId,
    user: createMockUser() as User,
    member: createMockGuildMember(permissions) as GuildMember,
    memberPermissions: {
        has: vi.fn((permission: any) => permissions.includes(permission)),
    } as any,
    guild: guildId ? createMockGuild(guildId) as Guild : null,
    replied: false,
    deferred: false,
    reply: vi.fn(),
    deferReply: vi.fn(),
    followUp: vi.fn(),
    editReply: vi.fn(),
    showModal: vi.fn(),
    fields: {
        getTextInputValue: vi.fn((fieldId: string) => fieldValues[fieldId] || ''),
    } as any,
});

describe('PaymentConfigCommandHandler', () => {
    let handler: PaymentConfigCommandHandler;

    beforeEach(() => {
        handler = new PaymentConfigCommandHandler(mockServerConfigService);
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('getCommandName', () => {
        it('should return payment-config', () => {
            expect(handler.getCommandName()).toBe('payment-config');
        });
    });

    describe('validateParameters', () => {
        it('should return true for valid admin user in guild', () => {
            const interaction = createMockCommandInteraction(
                'payment-config',
                'guild123',
                [PermissionFlagsBits.Administrator]
            );

            const result = handler.validateParameters(interaction as CommandInteraction);

            expect(result).toBe(true);
        });

        it('should return false for non-admin user', () => {
            const interaction = createMockCommandInteraction(
                'payment-config',
                'guild123',
                []
            );

            const result = handler.validateParameters(interaction as CommandInteraction);

            expect(result).toBe(false);
        });

        it('should return false when not in guild', () => {
            const interaction = createMockCommandInteraction(
                'payment-config',
                null,
                [PermissionFlagsBits.Administrator]
            );

            const result = handler.validateParameters(interaction as CommandInteraction);

            expect(result).toBe(false);
        });

        it('should return true for user with ManageGuild permission', () => {
            const interaction = createMockCommandInteraction(
                'payment-config',
                'guild123',
                [PermissionFlagsBits.ManageGuild]
            );

            const result = handler.validateParameters(interaction as CommandInteraction);

            expect(result).toBe(true);
        });
    });

    describe('handle', () => {
        it('should show configuration menu for admin user', async () => {
            const interaction = createMockCommandInteraction(
                'payment-config',
                'guild123',
                [PermissionFlagsBits.Administrator]
            );

            const mockConfig: ServerConfig = {
                id: 'config-1',
                serverId: 'guild123',
                paymentsEnabled: true,
                dailyLimits: {
                    maxAmountPerUser: 1000,
                    maxTransactionsPerUser: 10,
                },
                allowedPaymentMethods: ['crypto', 'ach'],
                adminUserIds: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockServerConfigService.getServerConfig.mockResolvedValue(mockConfig);

            await handler.handle(interaction as CommandInteraction);

            expect(interaction.deferReply).toHaveBeenCalledWith(true);
            expect(mockServerConfigService.getServerConfig).toHaveBeenCalledWith('guild123');
            expect(interaction.followUp || interaction.editReply).toHaveBeenCalled();
        });

        it('should handle not in server error', async () => {
            const interaction = createMockCommandInteraction(
                'payment-config',
                null,
                [PermissionFlagsBits.Administrator]
            );

            await handler.handle(interaction as CommandInteraction);

            expect(interaction.deferReply).toHaveBeenCalledWith(true);
            expect(interaction.followUp || interaction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '❌ Server Required'
                            })
                        })
                    ])
                })
            );
        });

        it('should handle insufficient permissions', async () => {
            const interaction = createMockCommandInteraction(
                'payment-config',
                'guild123',
                []
            );

            mockServerConfigService.isServerAdmin.mockResolvedValue(false);

            await handler.handle(interaction as CommandInteraction);

            expect(interaction.deferReply).toHaveBeenCalledWith(true);
            expect(interaction.followUp || interaction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '❌ Insufficient Permissions'
                            })
                        })
                    ])
                })
            );
        });
    });

    describe('handleTogglePayments', () => {
        it('should toggle payments from enabled to disabled', async () => {
            const interaction = createMockButtonInteraction(
                'config_toggle_payments',
                'guild123',
                [PermissionFlagsBits.Administrator]
            );

            const currentConfig: ServerConfig = {
                id: 'config-1',
                serverId: 'guild123',
                paymentsEnabled: true,
                dailyLimits: { maxAmountPerUser: 1000, maxTransactionsPerUser: 10 },
                allowedPaymentMethods: ['crypto', 'ach'],
                adminUserIds: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const updatedConfig: ServerConfig = {
                ...currentConfig,
                paymentsEnabled: false,
            };

            mockServerConfigService.getServerConfig.mockResolvedValue(currentConfig);
            mockServerConfigService.upsertServerConfig.mockResolvedValue(updatedConfig);

            await handler.handleTogglePayments(interaction as ButtonInteraction);

            expect(interaction.deferUpdate).toHaveBeenCalled();
            expect(mockServerConfigService.upsertServerConfig).toHaveBeenCalledWith({
                serverId: 'guild123',
                paymentsEnabled: false,
            });
            expect(interaction.followUp).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '❌ Payments Disabled'
                            })
                        })
                    ]),
                    ephemeral: true
                })
            );
        });

        it('should toggle payments from disabled to enabled', async () => {
            const interaction = createMockButtonInteraction(
                'config_toggle_payments',
                'guild123',
                [PermissionFlagsBits.Administrator]
            );

            const currentConfig: ServerConfig = {
                id: 'config-1',
                serverId: 'guild123',
                paymentsEnabled: false,
                dailyLimits: { maxAmountPerUser: 1000, maxTransactionsPerUser: 10 },
                allowedPaymentMethods: ['crypto', 'ach'],
                adminUserIds: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const updatedConfig: ServerConfig = {
                ...currentConfig,
                paymentsEnabled: true,
            };

            mockServerConfigService.getServerConfig.mockResolvedValue(currentConfig);
            mockServerConfigService.upsertServerConfig.mockResolvedValue(updatedConfig);

            await handler.handleTogglePayments(interaction as ButtonInteraction);

            expect(mockServerConfigService.upsertServerConfig).toHaveBeenCalledWith({
                serverId: 'guild123',
                paymentsEnabled: true,
            });
            expect(interaction.followUp).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '✅ Payments Enabled'
                            })
                        })
                    ]),
                    ephemeral: true
                })
            );
        });
    });

    describe('handleSetLimits', () => {
        it('should show limits modal for admin user', async () => {
            const interaction = createMockButtonInteraction(
                'config_set_limits',
                'guild123',
                [PermissionFlagsBits.Administrator]
            );

            const currentConfig: ServerConfig = {
                id: 'config-1',
                serverId: 'guild123',
                paymentsEnabled: true,
                dailyLimits: { maxAmountPerUser: 1000, maxTransactionsPerUser: 10 },
                allowedPaymentMethods: ['crypto', 'ach'],
                adminUserIds: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockServerConfigService.getServerConfig.mockResolvedValue(currentConfig);

            await handler.handleSetLimits(interaction as ButtonInteraction);

            expect(mockServerConfigService.getServerConfig).toHaveBeenCalledWith('guild123');
            expect(interaction.showModal).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        custom_id: 'config_limits_modal',
                        title: 'Set Payment Limits'
                    })
                })
            );
        });
    });

    describe('handleLimitsModal', () => {
        it('should update limits with valid input', async () => {
            const interaction = createMockModalSubmitInteraction(
                'config_limits_modal',
                {
                    max_amount: '2000',
                    max_transactions: '20'
                },
                'guild123',
                [PermissionFlagsBits.Administrator]
            );

            const updatedConfig: ServerConfig = {
                id: 'config-1',
                serverId: 'guild123',
                paymentsEnabled: true,
                dailyLimits: { maxAmountPerUser: 2000, maxTransactionsPerUser: 20 },
                allowedPaymentMethods: ['crypto', 'ach'],
                adminUserIds: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockServerConfigService.upsertServerConfig.mockResolvedValue(updatedConfig);

            await handler.handleLimitsModal(interaction as ModalSubmitInteraction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockServerConfigService.upsertServerConfig).toHaveBeenCalledWith({
                serverId: 'guild123',
                dailyLimits: {
                    maxAmountPerUser: 2000,
                    maxTransactionsPerUser: 20,
                },
            });
            expect(interaction.followUp || interaction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '✅ Limits Updated'
                            })
                        })
                    ])
                })
            );
        });

        it('should handle invalid amount input', async () => {
            const interaction = createMockModalSubmitInteraction(
                'config_limits_modal',
                {
                    max_amount: 'invalid',
                    max_transactions: '20'
                },
                'guild123',
                [PermissionFlagsBits.Administrator]
            );

            await handler.handleLimitsModal(interaction as ModalSubmitInteraction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(interaction.followUp || interaction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '❌ Configuration Error'
                            })
                        })
                    ])
                })
            );
        });
    });

    describe('handlePaymentMethodsSelection', () => {
        it('should update allowed payment methods', async () => {
            const interaction = createMockStringSelectMenuInteraction(
                'config_payment_methods_select',
                ['crypto', 'ach'],
                'guild123',
                [PermissionFlagsBits.Administrator]
            );

            const updatedConfig: ServerConfig = {
                id: 'config-1',
                serverId: 'guild123',
                paymentsEnabled: true,
                dailyLimits: { maxAmountPerUser: 1000, maxTransactionsPerUser: 10 },
                allowedPaymentMethods: ['crypto', 'ach'],
                adminUserIds: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockServerConfigService.upsertServerConfig.mockResolvedValue(updatedConfig);

            await handler.handlePaymentMethodsSelection(interaction as StringSelectMenuInteraction);

            expect(interaction.deferUpdate).toHaveBeenCalled();
            expect(mockServerConfigService.upsertServerConfig).toHaveBeenCalledWith({
                serverId: 'guild123',
                allowedPaymentMethods: ['crypto', 'ach'],
            });
            expect(interaction.followUp).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '✅ Payment Methods Updated'
                            })
                        })
                    ]),
                    ephemeral: true
                })
            );
        });
    });

    describe('error handling', () => {
        it('should handle service errors gracefully', async () => {
            const interaction = createMockCommandInteraction(
                'payment-config',
                'guild123',
                [PermissionFlagsBits.Administrator]
            );

            mockServerConfigService.getServerConfig.mockRejectedValue(new Error('Database error'));

            await handler.handle(interaction as CommandInteraction);

            expect(interaction.deferReply).toHaveBeenCalledWith(true);
            expect(interaction.followUp || interaction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '❌ Configuration Error'
                            })
                        })
                    ])
                })
            );
        });
    });
});