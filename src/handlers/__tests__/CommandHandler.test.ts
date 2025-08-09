import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseCommandHandler } from '../CommandHandler';
import { CommandInteraction } from 'discord.js';

// Create a test implementation of BaseCommandHandler
class TestCommandHandler extends BaseCommandHandler {
    public getCommandName(): string {
        return 'test';
    }

    public async handle(interaction: CommandInteraction): Promise<void> {
        await this.safeReply(interaction, { content: 'Test response' });
    }
}

// Mock Discord.js
vi.mock('discord.js', () => ({
    CommandInteraction: vi.fn()
}));

describe('BaseCommandHandler', () => {
    let handler: TestCommandHandler;
    let mockInteraction: Partial<CommandInteraction>;

    beforeEach(() => {
        vi.clearAllMocks();
        handler = new TestCommandHandler();

        mockInteraction = {
            commandName: 'test',
            memberPermissions: {
                has: vi.fn().mockReturnValue(true)
            } as any,
            reply: vi.fn().mockResolvedValue(undefined),
            followUp: vi.fn().mockResolvedValue(undefined),
            deferReply: vi.fn().mockResolvedValue(undefined),
            replied: false,
            deferred: false
        };
    });

    describe('validateParameters', () => {
        it('should return true for matching command name', () => {
            const result = handler.validateParameters(mockInteraction as CommandInteraction);
            expect(result).toBe(true);
        });

        it('should return false for non-matching command name', () => {
            mockInteraction.commandName = 'different';
            const result = handler.validateParameters(mockInteraction as CommandInteraction);
            expect(result).toBe(false);
        });
    });

    describe('hasPermission', () => {
        it('should return true when no permissions required', () => {
            const result = (handler as any).hasPermission(mockInteraction);
            expect(result).toBe(true);
        });

        it('should return true when user has required permissions', () => {
            const result = (handler as any).hasPermission(mockInteraction, ['ADMINISTRATOR']);
            expect(mockInteraction.memberPermissions?.has).toHaveBeenCalledWith('ADMINISTRATOR');
            expect(result).toBe(true);
        });

        it('should return false when user lacks required permissions', () => {
            mockInteraction.memberPermissions!.has = vi.fn().mockReturnValue(false);
            const result = (handler as any).hasPermission(mockInteraction, ['ADMINISTRATOR']);
            expect(result).toBe(false);
        });

        it('should return false when memberPermissions is null', () => {
            mockInteraction.memberPermissions = null;
            const result = (handler as any).hasPermission(mockInteraction, ['ADMINISTRATOR']);
            expect(result).toBe(false);
        });
    });

    describe('deferReply', () => {
        it('should defer reply when not already replied or deferred', async () => {
            await (handler as any).deferReply(mockInteraction);
            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: false });
        });

        it('should defer reply as ephemeral when specified', async () => {
            await (handler as any).deferReply(mockInteraction, true);
            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        });

        it('should not defer when already replied', async () => {
            mockInteraction.replied = true;
            await (handler as any).deferReply(mockInteraction);
            expect(mockInteraction.deferReply).not.toHaveBeenCalled();
        });

        it('should not defer when already deferred', async () => {
            mockInteraction.deferred = true;
            await (handler as any).deferReply(mockInteraction);
            expect(mockInteraction.deferReply).not.toHaveBeenCalled();
        });
    });

    describe('safeReply', () => {
        it('should use reply when not replied or deferred', async () => {
            const content = { content: 'Test message' };
            await (handler as any).safeReply(mockInteraction, content);
            expect(mockInteraction.reply).toHaveBeenCalledWith(content);
        });

        it('should use followUp when already replied', async () => {
            mockInteraction.replied = true;
            const content = { content: 'Test message' };
            await (handler as any).safeReply(mockInteraction, content);
            expect(mockInteraction.followUp).toHaveBeenCalledWith(content);
        });

        it('should use followUp when already deferred', async () => {
            mockInteraction.deferred = true;
            const content = { content: 'Test message' };
            await (handler as any).safeReply(mockInteraction, content);
            expect(mockInteraction.followUp).toHaveBeenCalledWith(content);
        });

        it('should handle reply errors gracefully', async () => {
            const error = new Error('Reply failed');
            mockInteraction.reply = vi.fn().mockRejectedValue(error);
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            const content = { content: 'Test message' };
            await (handler as any).safeReply(mockInteraction, content);

            expect(consoleSpy).toHaveBeenCalledWith(
                'Failed to reply to interaction test:',
                error
            );

            consoleSpy.mockRestore();
        });
    });

    describe('handle', () => {
        it('should execute the command handler', async () => {
            await handler.handle(mockInteraction as CommandInteraction);
            expect(mockInteraction.reply).toHaveBeenCalledWith({ content: 'Test response' });
        });
    });
});