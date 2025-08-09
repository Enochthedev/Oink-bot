import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorHandler } from '../ErrorHandler';
import { CommandInteraction, EmbedBuilder } from 'discord.js';

// Mock Discord.js
vi.mock('discord.js', () => ({
    EmbedBuilder: vi.fn().mockImplementation(() => ({
        setColor: vi.fn().mockReturnThis(),
        setTitle: vi.fn().mockReturnThis(),
        setDescription: vi.fn().mockReturnThis(),
        setTimestamp: vi.fn().mockReturnThis(),
        addFields: vi.fn().mockReturnThis()
    }))
}));

describe('ErrorHandler', () => {
    let errorHandler: ErrorHandler;
    let mockInteraction: Partial<CommandInteraction>;
    let mockEmbed: any;

    beforeEach(() => {
        vi.clearAllMocks();
        errorHandler = new ErrorHandler();

        mockEmbed = {
            setColor: vi.fn().mockReturnThis(),
            setTitle: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            setTimestamp: vi.fn().mockReturnThis(),
            addFields: vi.fn().mockReturnThis()
        };

        (EmbedBuilder as any).mockImplementation(() => mockEmbed);

        mockInteraction = {
            reply: vi.fn().mockResolvedValue(undefined),
            followUp: vi.fn().mockResolvedValue(undefined),
            replied: false,
            deferred: false
        };
    });

    describe('handleUnknownCommand', () => {
        it('should send unknown command error message', async () => {
            await errorHandler.handleUnknownCommand(mockInteraction as CommandInteraction);

            expect(mockEmbed.setColor).toHaveBeenCalledWith(0xFF0000);
            expect(mockEmbed.setTitle).toHaveBeenCalledWith('❌ Unknown Command');
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: [mockEmbed],
                ephemeral: true
            });
        });

        it('should use followUp if interaction already replied', async () => {
            mockInteraction.replied = true;

            await errorHandler.handleUnknownCommand(mockInteraction as CommandInteraction);

            expect(mockInteraction.followUp).toHaveBeenCalledWith({
                embeds: [mockEmbed],
                ephemeral: true
            });
        });
    });

    describe('handleValidationError', () => {
        it('should send validation error message with custom message', async () => {
            const customMessage = 'Invalid parameters provided';

            await errorHandler.handleValidationError(mockInteraction as CommandInteraction, customMessage);

            expect(mockEmbed.setColor).toHaveBeenCalledWith(0xFF6B00);
            expect(mockEmbed.setTitle).toHaveBeenCalledWith('⚠️ Validation Error');
            expect(mockEmbed.setDescription).toHaveBeenCalledWith(customMessage);
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: [mockEmbed],
                ephemeral: true
            });
        });
    });

    describe('handleCommandError', () => {
        it('should send generic error message in production', async () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const error = new Error('Test error');

            await errorHandler.handleCommandError(mockInteraction as CommandInteraction, error);

            expect(mockEmbed.setColor).toHaveBeenCalledWith(0xFF0000);
            expect(mockEmbed.setTitle).toHaveBeenCalledWith('❌ Command Error');
            expect(mockEmbed.addFields).not.toHaveBeenCalled();

            process.env.NODE_ENV = originalEnv;
        });

        it('should include error details in development', async () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            const error = new Error('Test error');

            await errorHandler.handleCommandError(mockInteraction as CommandInteraction, error);

            expect(mockEmbed.addFields).toHaveBeenCalledWith({
                name: 'Error Details',
                value: '```Test error```',
                inline: false
            });

            process.env.NODE_ENV = originalEnv;
        });
    });

    describe('handlePermissionError', () => {
        it('should send permission denied message', async () => {
            await errorHandler.handlePermissionError(mockInteraction as CommandInteraction);

            expect(mockEmbed.setColor).toHaveBeenCalledWith(0xFF0000);
            expect(mockEmbed.setTitle).toHaveBeenCalledWith('🚫 Permission Denied');
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: [mockEmbed],
                ephemeral: true
            });
        });
    });

    describe('handleRateLimitError', () => {
        it('should send rate limit message without retry time', async () => {
            await errorHandler.handleRateLimitError(mockInteraction as CommandInteraction);

            expect(mockEmbed.setColor).toHaveBeenCalledWith(0xFF6B00);
            expect(mockEmbed.setTitle).toHaveBeenCalledWith('⏱️ Rate Limited');
            expect(mockEmbed.setDescription).toHaveBeenCalledWith(
                expect.stringContaining('Please try again later.')
            );
        });

        it('should send rate limit message with retry time', async () => {
            const retryAfter = 5000; // 5 seconds

            await errorHandler.handleRateLimitError(mockInteraction as CommandInteraction, retryAfter);

            expect(mockEmbed.setDescription).toHaveBeenCalledWith(
                expect.stringContaining('Please try again in 5 seconds.')
            );
        });
    });
});