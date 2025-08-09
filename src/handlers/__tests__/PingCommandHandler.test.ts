import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PingCommandHandler } from '../PingCommandHandler';
import { CommandInteraction, EmbedBuilder } from 'discord.js';

// Mock Discord.js
vi.mock('discord.js', () => ({
    EmbedBuilder: vi.fn().mockImplementation(() => ({
        setColor: vi.fn().mockReturnThis(),
        setTitle: vi.fn().mockReturnThis(),
        setDescription: vi.fn().mockReturnThis(),
        addFields: vi.fn().mockReturnThis(),
        setTimestamp: vi.fn().mockReturnThis()
    }))
}));

describe('PingCommandHandler', () => {
    let handler: PingCommandHandler;
    let mockInteraction: Partial<CommandInteraction>;
    let mockEmbed: any;

    beforeEach(() => {
        vi.clearAllMocks();
        handler = new PingCommandHandler();

        mockEmbed = {
            setColor: vi.fn().mockReturnThis(),
            setTitle: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            addFields: vi.fn().mockReturnThis(),
            setTimestamp: vi.fn().mockReturnThis()
        };

        (EmbedBuilder as any).mockImplementation(() => mockEmbed);

        mockInteraction = {
            commandName: 'ping',
            createdTimestamp: Date.now() - 100, // 100ms ago
            client: {
                ws: { ping: 50 }
            } as any,
            reply: vi.fn().mockResolvedValue(undefined),
            followUp: vi.fn().mockResolvedValue(undefined),
            deferReply: vi.fn().mockResolvedValue(undefined),
            replied: false,
            deferred: false
        };
    });

    describe('getCommandName', () => {
        it('should return "ping"', () => {
            expect(handler.getCommandName()).toBe('ping');
        });
    });

    describe('validateParameters', () => {
        it('should return true for ping command', () => {
            const result = handler.validateParameters(mockInteraction as CommandInteraction);
            expect(result).toBe(true);
        });

        it('should return false for non-ping command', () => {
            mockInteraction.commandName = 'different';
            const result = handler.validateParameters(mockInteraction as CommandInteraction);
            expect(result).toBe(false);
        });
    });

    describe('handle', () => {
        it('should defer reply and send pong response', async () => {
            // Mock the safeReply method to track calls
            const safeReplySpy = vi.spyOn(handler as any, 'safeReply').mockResolvedValue(undefined);

            await handler.handle(mockInteraction as CommandInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalled();
            expect(EmbedBuilder).toHaveBeenCalled();
            expect(mockEmbed.setColor).toHaveBeenCalledWith(0x00FF00);
            expect(mockEmbed.setTitle).toHaveBeenCalledWith('🏓 Pong!');
            expect(mockEmbed.setDescription).toHaveBeenCalledWith('Bot is responding correctly.');
            expect(mockEmbed.addFields).toHaveBeenCalledWith(
                { name: 'Latency', value: expect.stringMatching(/\d+ms/), inline: true },
                { name: 'API Latency', value: '50ms', inline: true }
            );
            expect(mockEmbed.setTimestamp).toHaveBeenCalled();
            expect(safeReplySpy).toHaveBeenCalledWith(mockInteraction, { embeds: [mockEmbed] });
        });

        it('should calculate latency correctly', async () => {
            const startTime = Date.now();
            mockInteraction.createdTimestamp = startTime - 150; // 150ms ago

            await handler.handle(mockInteraction as CommandInteraction);

            expect(mockEmbed.addFields).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Latency',
                    value: expect.stringMatching(/1\d\dms/) // Should be around 150ms
                }),
                expect.objectContaining({
                    name: 'API Latency',
                    value: '50ms'
                })
            );
        });
    });
});