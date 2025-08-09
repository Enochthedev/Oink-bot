import { vi } from 'vitest';
import { Client, Guild, TextChannel, User, CommandInteraction, ButtonInteraction, ApplicationCommand } from 'discord.js';

/**
 * Mock Discord Server
 * Simulates a Discord server environment for end-to-end testing
 */
export class MockDiscordServer {
    private guilds: Map<string, Guild> = new Map();
    private channels: Map<string, TextChannel> = new Map();
    private users: Map<string, User> = new Map();
    private interactions: Map<string, any> = new Map();
    private registeredCommands: Map<string, ApplicationCommand[]> = new Map();
    private rateLimitActive = false;

    async initialize(): Promise<void> {
        // Initialize mock Discord server
        console.log('Initializing Mock Discord Server...');
    }

    async shutdown(): Promise<void> {
        // Clean up mock server
        this.guilds.clear();
        this.channels.clear();
        this.users.clear();
        this.interactions.clear();
        this.registeredCommands.clear();
        console.log('Mock Discord Server shut down');
    }

    /**
     * Create a mock guild
     */
    async createGuild(name: string, id?: string): Promise<Guild> {
        const guildId = id || `guild-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const guild = {
            id: guildId,
            name,
            ownerId: 'owner-id',
            memberCount: 100,
            available: true,
            channels: {
                cache: new Map(),
                create: vi.fn().mockImplementation(async (options) => {
                    return this.createChannel(guild, options.name, options.type);
                }),
                fetch: vi.fn(),
            },
            members: {
                cache: new Map(),
                fetch: vi.fn(),
            },
            roles: {
                cache: new Map(),
                create: vi.fn(),
            },
            commands: {
                set: vi.fn().mockImplementation(async (commands) => {
                    this.registeredCommands.set(guildId, commands);
                    return commands;
                }),
                fetch: vi.fn().mockImplementation(async () => {
                    return this.registeredCommands.get(guildId) || [];
                }),
            },
            toString: () => name,
        } as any;

        this.guilds.set(guildId, guild);
        return guild;
    }

    /**
     * Create a mock text channel
     */
    async createChannel(guild: Guild, name: string, type: number = 0, id?: string): Promise<TextChannel> {
        const channelId = id || `channel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const channel = {
            id: channelId,
            name,
            type,
            guild,
            guildId: guild.id,
            position: 0,
            parentId: null,
            permissionOverwrites: {
                cache: new Map(),
            },
            send: vi.fn().mockImplementation(async (options) => {
                return {
                    id: `message-${Date.now()}`,
                    content: typeof options === 'string' ? options : options.content,
                    embeds: typeof options === 'object' ? options.embeds : [],
                    components: typeof options === 'object' ? options.components : [],
                    author: { id: 'bot-id' },
                    channel,
                };
            }),
            bulkDelete: vi.fn(),
            toString: () => `#${name}`,
        } as any;

        this.channels.set(channelId, channel);
        guild.channels.cache.set(channelId, channel);

        return channel;
    }

    /**
     * Create a mock user
     */
    async createUser(username: string, displayName?: string, id?: string): Promise<User> {
        const userId = id || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const user = {
            id: userId,
            username,
            displayName: displayName || username,
            tag: `${username}#0001`,
            discriminator: '0001',
            avatar: null,
            bot: false,
            system: false,
            flags: null,
            send: vi.fn().mockImplementation(async (options) => {
                if (this.rateLimitActive) {
                    throw new Error('Rate limited');
                }

                return {
                    id: `dm-message-${Date.now()}`,
                    content: typeof options === 'string' ? options : options.content,
                    embeds: typeof options === 'object' ? options.embeds : [],
                    components: typeof options === 'object' ? options.components : [],
                    author: { id: 'bot-id' },
                };
            }),
            createDM: vi.fn().mockResolvedValue({
                id: `dm-channel-${userId}`,
                type: 1, // DM
                send: vi.fn(),
            }),
            toString: () => `<@${userId}>`,
        } as any;

        this.users.set(userId, user);
        return user;
    }

    /**
     * Add bot to guild (simulate bot joining)
     */
    async addBotToGuild(guild: Guild, botClient: Client): Promise<void> {
        // Simulate bot joining guild and registering commands
        const commands = [
            { name: 'ping', description: 'Ping the bot' },
            { name: 'pay', description: 'Send a payment' },
            { name: 'request', description: 'Request a payment' },
            { name: 'transactions', description: 'View transaction history' },
            { name: 'setup-payment', description: 'Set up payment methods' },
            { name: 'payment-config', description: 'Configure server payment settings' },
        ];

        this.registeredCommands.set(guild.id, commands as any);
    }

    /**
     * Get registered commands for a guild
     */
    async getRegisteredCommands(guild: Guild): Promise<ApplicationCommand[]> {
        return this.registeredCommands.get(guild.id) || [];
    }

    /**
     * Simulate a slash command interaction
     */
    async simulateSlashCommand(
        user: User,
        channel: TextChannel,
        commandName: string,
        options: any = {}
    ): Promise<CommandInteraction> {
        const interactionId = `interaction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const interaction = {
            id: interactionId,
            type: 2, // APPLICATION_COMMAND
            commandName,
            user,
            guild: channel.guild,
            guildId: channel.guildId,
            channel,
            channelId: channel.id,
            token: `mock-token-${interactionId}`,
            options: {
                getUser: vi.fn((name: string) => options[name] || options.user),
                getNumber: vi.fn((name: string) => options[name] || options.amount),
                getString: vi.fn((name: string) => options[name] || options.description),
                getBoolean: vi.fn((name: string) => options[name]),
                getChannel: vi.fn((name: string) => options[name] || channel),
                getRole: vi.fn((name: string) => options[name]),
                getMentionable: vi.fn((name: string) => options[name]),
                getAttachment: vi.fn((name: string) => options[name]),
                ...options,
            },
            deferReply: vi.fn().mockImplementation(async (options) => {
                if (this.rateLimitActive) {
                    throw new Error('Rate limited');
                }
                interaction.deferred = true;
                return {};
            }),
            reply: vi.fn().mockImplementation(async (options) => {
                if (this.rateLimitActive) {
                    throw new Error('Rate limited');
                }
                interaction.replied = true;
                return {};
            }),
            followUp: vi.fn().mockImplementation(async (options) => {
                if (this.rateLimitActive) {
                    throw new Error('Rate limited');
                }
                return {};
            }),
            editReply: vi.fn().mockImplementation(async (options) => {
                if (this.rateLimitActive) {
                    throw new Error('Rate limited');
                }
                return {};
            }),
            deleteReply: vi.fn().mockResolvedValue({}),
            replied: false,
            deferred: false,
            ephemeral: false,
        } as any;

        this.interactions.set(interactionId, interaction);
        return interaction;
    }

    /**
     * Simulate a button interaction
     */
    async simulateButtonClick(
        user: User,
        customId: string,
        message?: any
    ): Promise<ButtonInteraction> {
        const interactionId = `button-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const interaction = {
            id: interactionId,
            type: 3, // MESSAGE_COMPONENT
            componentType: 2, // BUTTON
            customId,
            user,
            guild: message?.guild,
            guildId: message?.guildId,
            channel: message?.channel,
            channelId: message?.channelId,
            message: message || {
                id: 'mock-message',
                content: '',
                embeds: [],
                components: [],
            },
            token: `mock-token-${interactionId}`,
            update: vi.fn().mockImplementation(async (options) => {
                if (this.rateLimitActive) {
                    throw new Error('Rate limited');
                }
                return {};
            }),
            reply: vi.fn().mockImplementation(async (options) => {
                if (this.rateLimitActive) {
                    throw new Error('Rate limited');
                }
                interaction.replied = true;
                return {};
            }),
            followUp: vi.fn().mockResolvedValue({}),
            editReply: vi.fn().mockResolvedValue({}),
            deferUpdate: vi.fn().mockImplementation(async () => {
                if (this.rateLimitActive) {
                    throw new Error('Rate limited');
                }
                interaction.deferred = true;
                return {};
            }),
            deferReply: vi.fn().mockResolvedValue({}),
            replied: false,
            deferred: false,
        } as any;

        this.interactions.set(interactionId, interaction);
        return interaction;
    }

    /**
     * Wait for interaction response (simulate network delay)
     */
    async waitForResponse(interaction: any, timeout: number = 1000): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, Math.random() * 100); // Random delay up to 100ms
        });
    }

    /**
     * Reset all interactions (for test isolation)
     */
    resetInteractions(): void {
        this.interactions.clear();

        // Reset all mock function calls
        this.users.forEach(user => {
            vi.clearAllMocks();
        });

        this.channels.forEach(channel => {
            vi.clearAllMocks();
        });
    }

    /**
     * Simulate Discord API rate limiting
     */
    simulateRateLimit(duration: number = 5000): void {
        this.rateLimitActive = true;
        setTimeout(() => {
            this.rateLimitActive = false;
        }, duration);
    }

    /**
     * Get interaction by ID
     */
    getInteraction(id: string): any {
        return this.interactions.get(id);
    }

    /**
     * Get all interactions for a user
     */
    getUserInteractions(userId: string): any[] {
        return Array.from(this.interactions.values()).filter(
            interaction => interaction.user.id === userId
        );
    }

    /**
     * Simulate network latency
     */
    async simulateNetworkDelay(min: number = 50, max: number = 200): Promise<void> {
        const delay = Math.random() * (max - min) + min;
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Simulate Discord server outage
     */
    simulateOutage(duration: number = 10000): void {
        const originalMethods = new Map();

        // Store original methods
        this.users.forEach((user, id) => {
            originalMethods.set(`user-${id}-send`, user.send);
            user.send = vi.fn().mockRejectedValue(new Error('Discord API unavailable'));
        });

        this.channels.forEach((channel, id) => {
            originalMethods.set(`channel-${id}-send`, channel.send);
            channel.send = vi.fn().mockRejectedValue(new Error('Discord API unavailable'));
        });

        // Restore after duration
        setTimeout(() => {
            this.users.forEach((user, id) => {
                user.send = originalMethods.get(`user-${id}-send`);
            });

            this.channels.forEach((channel, id) => {
                channel.send = originalMethods.get(`channel-${id}-send`);
            });
        }, duration);
    }

    /**
     * Get server statistics
     */
    getStats(): {
        guilds: number;
        channels: number;
        users: number;
        interactions: number;
    } {
        return {
            guilds: this.guilds.size,
            channels: this.channels.size,
            users: this.users.size,
            interactions: this.interactions.size,
        };
    }
}