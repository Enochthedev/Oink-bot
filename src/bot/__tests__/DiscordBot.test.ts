import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiscordBot } from '../DiscordBot';
import { PingCommandHandler } from '../../handlers/PingCommandHandler';

// Create mock instances
const mockClient = {
    once: vi.fn(),
    on: vi.fn(),
    login: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    user: { tag: 'TestBot#1234' },
    ws: { ping: 50 }
};

const mockRest = {
    setToken: vi.fn().mockReturnThis(),
    put: vi.fn().mockResolvedValue([])
};

const mockCommands = {
    set: vi.fn(),
    get: vi.fn(),
    has: vi.fn(),
    delete: vi.fn()
};

// Mock Discord.js
vi.mock('discord.js', () => ({
    Client: vi.fn(() => mockClient),
    GatewayIntentBits: {
        Guilds: 1,
        GuildMessages: 2,
        DirectMessages: 4,
        MessageContent: 8
    },
    REST: vi.fn(() => mockRest),
    Routes: {
        applicationCommands: vi.fn().mockReturnValue('mock-route')
    },
    SlashCommandBuilder: vi.fn().mockImplementation(() => ({
        setName: vi.fn().mockReturnThis(),
        setDescription: vi.fn().mockReturnThis(),
        addUserOption: vi.fn().mockReturnThis(),
        addNumberOption: vi.fn().mockReturnThis(),
        addStringOption: vi.fn().mockReturnThis(),
        addIntegerOption: vi.fn().mockReturnThis(),
        addBooleanOption: vi.fn().mockReturnThis(),
        setDefaultMemberPermissions: vi.fn().mockReturnThis(),
        toJSON: vi.fn().mockReturnValue({})
    })),
    Collection: vi.fn(() => mockCommands),
    Events: {
        InteractionCreate: 'interactionCreate',
        Error: 'error'
    }
}));

// Mock environment config
vi.mock('../../config/environment', () => ({
    config: {
        DISCORD_TOKEN: 'mock-token',
        DISCORD_CLIENT_ID: 'mock-client-id'
    }
}));

describe('DiscordBot', () => {
    let bot: DiscordBot;

    beforeEach(() => {
        vi.clearAllMocks();
        bot = new DiscordBot();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize Discord client with correct intents', () => {
            const { Client } = require('discord.js');
            expect(Client).toHaveBeenCalledWith({
                intents: [1, 2, 4, 8] // Guilds, GuildMessages, DirectMessages, MessageContent
            });
        });

        it('should set up event handlers', () => {
            expect(mockClient.once).toHaveBeenCalledWith('ready', expect.any(Function));
            expect(mockClient.on).toHaveBeenCalledWith('interactionCreate', expect.any(Function));
            expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
        });
    });

    describe('registerCommand', () => {
        it('should register a command handler', () => {
            const handler = new PingCommandHandler();

            bot.registerCommand(handler);

            expect(mockCommands.set).toHaveBeenCalledWith('ping', handler);
        });
    });

    describe('registerSlashCommands', () => {
        it('should register slash commands with Discord API', async () => {
            const mockCommandData = [{ name: 'ping' }, { name: 'pay' }];
            vi.spyOn(bot as any, 'buildSlashCommands').mockReturnValue(mockCommandData);
            mockRest.put.mockResolvedValue(mockCommandData);

            await bot.registerSlashCommands();

            expect(mockRest.put).toHaveBeenCalledWith('mock-route', {
                body: mockCommandData
            });
        });

        it('should handle registration errors', async () => {
            const error = new Error('Registration failed');
            mockRest.put.mockRejectedValue(error);

            await expect(bot.registerSlashCommands()).rejects.toThrow('Registration failed');
        });
    });

    describe('start', () => {
        it('should login the Discord client', async () => {
            await bot.start();

            expect(mockClient.login).toHaveBeenCalledWith('mock-token');
        });

        it('should handle login errors', async () => {
            const error = new Error('Login failed');
            mockClient.login.mockRejectedValue(error);

            await expect(bot.start()).rejects.toThrow('Login failed');
        });
    });

    describe('stop', () => {
        it('should destroy the Discord client', async () => {
            await bot.stop();

            expect(mockClient.destroy).toHaveBeenCalled();
        });
    });

    describe('buildSlashCommands', () => {
        it('should build all required slash commands', () => {
            const commands = (bot as any).buildSlashCommands();

            expect(commands).toHaveLength(6); // ping, pay, request, transactions, setup-payment, payment-config
            expect(commands).toEqual(expect.arrayContaining([
                expect.any(Object)
            ]));
        });
    });
});