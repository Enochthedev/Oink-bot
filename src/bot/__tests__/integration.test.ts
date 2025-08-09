import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiscordBot } from '../DiscordBot';
import { PingCommandHandler } from '../../handlers/PingCommandHandler';

// Mock the environment to avoid requiring actual Discord tokens
vi.mock('../../config/environment', () => ({
    config: {
        DISCORD_TOKEN: 'mock-token',
        DISCORD_CLIENT_ID: 'mock-client-id'
    }
}));

describe('Discord Bot Integration', () => {
    let bot: DiscordBot;

    beforeEach(() => {
        bot = new DiscordBot();
    });

    afterEach(async () => {
        // Clean up any resources
        try {
            await bot.stop();
        } catch (error) {
            // Ignore cleanup errors in tests
        }
    });

    it('should initialize bot with proper structure', () => {
        expect(bot).toBeDefined();
        expect(typeof bot.registerCommand).toBe('function');
        expect(typeof bot.registerSlashCommands).toBe('function');
        expect(typeof bot.start).toBe('function');
        expect(typeof bot.stop).toBe('function');
        expect(typeof bot.getClient).toBe('function');
    });

    it('should register command handlers', () => {
        const handler = new PingCommandHandler();

        // This should not throw
        expect(() => {
            bot.registerCommand(handler);
        }).not.toThrow();
    });

    it('should have Discord client instance', () => {
        const client = bot.getClient();
        expect(client).toBeDefined();
        expect(client.options).toBeDefined();
    });

    it('should build slash commands correctly', () => {
        // Access private method for testing
        const commands = (bot as any).buildSlashCommands();

        expect(Array.isArray(commands)).toBe(true);
        expect(commands.length).toBeGreaterThan(0);

        // Should include our expected commands
        const commandNames = commands.map((cmd: any) => cmd.name);
        expect(commandNames).toContain('ping');
        expect(commandNames).toContain('pay');
        expect(commandNames).toContain('request');
        expect(commandNames).toContain('transactions');
        expect(commandNames).toContain('setup-payment');
        expect(commandNames).toContain('payment-config');
    });
});