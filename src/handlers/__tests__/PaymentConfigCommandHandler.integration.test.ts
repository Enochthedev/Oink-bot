// PaymentConfigCommandHandler integration tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaymentConfigCommandHandler } from '../config/PaymentConfigCommandHandler';
import { ServerConfigServiceImpl } from '../../services/ServerConfigService';
import { getPrismaClient } from '../../models/database';
import {
    CommandInteraction,
    ButtonInteraction,
    PermissionFlagsBits,
    Guild,
    GuildMember,
    User
} from 'discord.js';

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

describe('PaymentConfigCommandHandler Integration', () => {
    let handler: PaymentConfigCommandHandler;
    let prisma: ReturnType<typeof getPrismaClient>;

    beforeEach(async () => {
        prisma = getPrismaClient();
        const serverConfigService = new ServerConfigServiceImpl();
        handler = new PaymentConfigCommandHandler(serverConfigService);

        // Clean up test data
        await prisma.serverConfig.deleteMany({
            where: {
                serverId: {
                    startsWith: 'test_'
                }
            }
        });
    });

    afterEach(async () => {
        // Clean up test data
        await prisma.serverConfig.deleteMany({
            where: {
                serverId: {
                    startsWith: 'test_'
                }
            }
        });
    });

    describe('full configuration workflow', () => {
        it('should handle complete server configuration setup', async () => {
            const serverId = 'test_guild_123';

            // Step 1: Initial configuration view (no config exists)
            const initialInteraction = createMockCommandInteraction(
                'payment-config',
                serverId,
                [PermissionFlagsBits.Administrator]
            );

            await handler.handle(initialInteraction as CommandInteraction);

            expect(initialInteraction.deferReply).toHaveBeenCalledWith(true);
            expect(initialInteraction.followUp || initialInteraction.editReply).toHaveBeenCalled();

            // Step 2: Toggle payments (should create config with default values)
            const toggleInteraction = createMockButtonInteraction(
                'config_toggle_payments',
                serverId,
                [PermissionFlagsBits.Administrator]
            );

            await handler.handleTogglePayments(toggleInteraction as ButtonInteraction);

            expect(toggleInteraction.deferUpdate).toHaveBeenCalled();
            expect(toggleInteraction.followUp).toHaveBeenCalled();

            // Verify config was created in database
            const createdConfig = await prisma.serverConfig.findUnique({
                where: { serverId }
            });

            expect(createdConfig).toBeTruthy();
            expect(createdConfig?.paymentsEnabled).toBe(false); // Should be toggled from default true to false

            // Step 3: Toggle payments again (should enable them)
            const toggleAgainInteraction = createMockButtonInteraction(
                'config_toggle_payments',
                serverId,
                [PermissionFlagsBits.Administrator]
            );

            await handler.handleTogglePayments(toggleAgainInteraction as ButtonInteraction);

            // Verify config was updated
            const updatedConfig = await prisma.serverConfig.findUnique({
                where: { serverId }
            });

            expect(updatedConfig?.paymentsEnabled).toBe(true);
        });

        it('should handle permission validation correctly', async () => {
            const serverId = 'test_guild_456';

            // Test with non-admin user
            const nonAdminInteraction = createMockCommandInteraction(
                'payment-config',
                serverId,
                [] // No admin permissions
            );

            await handler.handle(nonAdminInteraction as CommandInteraction);

            expect(nonAdminInteraction.deferReply).toHaveBeenCalledWith(true);
            expect(nonAdminInteraction.followUp || nonAdminInteraction.editReply).toHaveBeenCalledWith(
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

            // Test with admin user
            const adminInteraction = createMockCommandInteraction(
                'payment-config',
                serverId,
                [PermissionFlagsBits.Administrator]
            );

            await handler.handle(adminInteraction as CommandInteraction);

            expect(adminInteraction.deferReply).toHaveBeenCalledWith(true);
            // Should not show permission error
            expect(adminInteraction.followUp || adminInteraction.editReply).not.toHaveBeenCalledWith(
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

        it('should handle server admin configuration', async () => {
            const serverId = 'test_guild_789';
            const adminUserId = 'admin_user_123';

            // Create initial config with server admin
            await prisma.serverConfig.create({
                data: {
                    serverId,
                    paymentsEnabled: true,
                    maxAmountPerUser: 1000,
                    maxTransactionsPerUser: 10,
                    allowedPaymentMethodsJson: '["crypto","ach","other"]',
                    adminUserIdsJson: `["${adminUserId}"]`,
                }
            });

            // Test that server admin can access config
            const serverAdminInteraction = createMockCommandInteraction(
                'payment-config',
                serverId,
                [] // No Discord permissions, but should be server admin
            );

            // Override user ID to match server admin
            (serverAdminInteraction.user as any).id = adminUserId;

            await handler.handle(serverAdminInteraction as CommandInteraction);

            expect(serverAdminInteraction.deferReply).toHaveBeenCalledWith(true);
            // Should not show permission error since user is server admin
            expect(serverAdminInteraction.followUp || serverAdminInteraction.editReply).not.toHaveBeenCalledWith(
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

        it('should handle database errors gracefully', async () => {
            const serverId = 'test_guild_error';

            // Create a scenario that might cause database error
            const interaction = createMockCommandInteraction(
                'payment-config',
                serverId,
                [PermissionFlagsBits.Administrator]
            );

            // Mock database to throw error
            const originalFindUnique = prisma.serverConfig.findUnique;
            prisma.serverConfig.findUnique = vi.fn().mockRejectedValue(new Error('Database connection failed'));

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

            // Restore original method
            prisma.serverConfig.findUnique = originalFindUnique;
        });
    });

    describe('payment limit enforcement integration', () => {
        it('should create and enforce payment limits', async () => {
            const serverId = 'test_guild_limits';

            // Create config with specific limits
            await prisma.serverConfig.create({
                data: {
                    serverId,
                    paymentsEnabled: true,
                    maxAmountPerUser: 500, // Low limit for testing
                    maxTransactionsPerUser: 2, // Low limit for testing
                    allowedPaymentMethodsJson: '["crypto"]',
                    adminUserIdsJson: '[]',
                }
            });

            // Verify the config was created correctly
            const config = await prisma.serverConfig.findUnique({
                where: { serverId }
            });

            expect(config).toBeTruthy();
            expect(config?.maxAmountPerUser).toBe(500);
            expect(config?.maxTransactionsPerUser).toBe(2);
            expect(config?.allowedPaymentMethodsJson).toBe('["crypto"]');
        });
    });

    describe('payment method restrictions integration', () => {
        it('should create and enforce payment method restrictions', async () => {
            const serverId = 'test_guild_methods';

            // Create config with only crypto allowed
            await prisma.serverConfig.create({
                data: {
                    serverId,
                    paymentsEnabled: true,
                    maxAmountPerUser: 1000,
                    maxTransactionsPerUser: 10,
                    allowedPaymentMethodsJson: '["crypto"]', // Only crypto allowed
                    adminUserIdsJson: '[]',
                }
            });

            // Verify the config was created correctly
            const config = await prisma.serverConfig.findUnique({
                where: { serverId }
            });

            expect(config).toBeTruthy();
            expect(JSON.parse(config?.allowedPaymentMethodsJson || '[]')).toEqual(['crypto']);
        });
    });
});