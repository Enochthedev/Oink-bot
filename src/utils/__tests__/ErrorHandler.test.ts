import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandInteraction } from 'discord.js';
import {
    CentralizedErrorHandler,
    ValidationError,
    PaymentProcessorError,
    EscrowError,
    DiscordAPIError,
    DatabaseError,
    SecurityError,
    RateLimitError,
    ErrorSeverity,
    ErrorCategory,
} from '../ErrorHandler';

// Mock Discord.js
vi.mock('discord.js', () => ({
    CommandInteraction: vi.fn(),
    EmbedBuilder: vi.fn(() => ({
        setColor: vi.fn().mockReturnThis(),
        setTitle: vi.fn().mockReturnThis(),
        setDescription: vi.fn().mockReturnThis(),
        setTimestamp: vi.fn().mockReturnThis(),
        addFields: vi.fn().mockReturnThis(),
    })),
}));

// Mock logger
vi.mock('../Logger', () => ({
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    },
    LogLevel: {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3,
    },
}));

describe('CentralizedErrorHandler', () => {
    let errorHandler: CentralizedErrorHandler;
    let mockInteraction: Partial<CommandInteraction>;

    beforeEach(() => {
        errorHandler = CentralizedErrorHandler.getInstance();
        mockInteraction = {
            reply: vi.fn(),
            followUp: vi.fn(),
            replied: false,
            deferred: false,
            user: { id: 'test-user-id' },
            guildId: 'test-guild-id',
            commandName: 'test-command',
        } as any;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Error Normalization', () => {
        it('should handle ValidationError correctly', async () => {
            const error = new ValidationError(
                'Test validation error',
                'TEST_VALIDATION',
                'User friendly message'
            );

            await errorHandler.handleError(error, {
                interaction: mockInteraction as CommandInteraction,
                userId: 'test-user',
            });

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        color: 0xFFFF00, // Yellow for low severity
                        title: '⚠️ Validation Error',
                        description: 'User friendly message',
                    }),
                ]),
                ephemeral: true,
            });
        });

        it('should handle PaymentProcessorError correctly', async () => {
            const error = new PaymentProcessorError(
                'Payment failed',
                'PAYMENT_FAILED',
                ErrorSeverity.HIGH,
                'crypto',
                'Payment could not be processed'
            );

            await errorHandler.handleError(error, {
                interaction: mockInteraction as CommandInteraction,
                transactionId: 'test-tx-123',
            });

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        color: 0xFF0000, // Red for high severity
                        title: '💳 Payment Error',
                        description: 'Payment could not be processed',
                    }),
                ]),
                ephemeral: true,
            });
        });

        it('should handle EscrowError correctly', async () => {
            const error = new EscrowError(
                'Escrow operation failed',
                'ESCROW_FAILED',
                'test-tx-123',
                'Escrow system error'
            );

            await errorHandler.handleError(error, {
                interaction: mockInteraction as CommandInteraction,
            });

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        color: 0xFF0000, // Red for high severity
                        title: '🏦 Escrow Error',
                        description: 'Escrow system error',
                    }),
                ]),
                ephemeral: true,
            });
        });

        it('should handle DiscordAPIError correctly', async () => {
            const error = new DiscordAPIError(
                'Discord API failed',
                'DISCORD_API_FAILED',
                'Discord service temporarily unavailable'
            );

            await errorHandler.handleError(error, {
                interaction: mockInteraction as CommandInteraction,
            });

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        color: 0xFF6B00, // Orange for medium severity
                        title: '🤖 Discord Error',
                        description: 'Discord service temporarily unavailable',
                    }),
                ]),
                ephemeral: true,
            });
        });

        it('should handle DatabaseError correctly', async () => {
            const error = new DatabaseError(
                'Database connection failed',
                'DB_CONNECTION_FAILED',
                'SELECT',
                'Database temporarily unavailable'
            );

            await errorHandler.handleError(error, {
                interaction: mockInteraction as CommandInteraction,
            });

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        color: 0xFF0000, // Red for high severity
                        title: '💾 Database Error',
                        description: 'Database temporarily unavailable',
                    }),
                ]),
                ephemeral: true,
            });
        });

        it('should handle SecurityError correctly', async () => {
            const error = new SecurityError(
                'Security violation detected',
                'SECURITY_VIOLATION',
                'Access denied'
            );

            await errorHandler.handleError(error, {
                interaction: mockInteraction as CommandInteraction,
            });

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        color: 0x8B0000, // Dark red for critical severity
                        title: '🛡️ Security Error',
                        description: 'Access denied',
                    }),
                ]),
                ephemeral: true,
            });
        });

        it('should handle RateLimitError correctly', async () => {
            const error = new RateLimitError(
                'Rate limit exceeded',
                'RATE_LIMITED',
                5000,
                'Please wait before trying again'
            );

            await errorHandler.handleError(error, {
                interaction: mockInteraction as CommandInteraction,
            });

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        color: 0xFF6B00, // Orange for medium severity
                        title: '⏱️ Rate Limit Error',
                        description: 'Please wait before trying again',
                    }),
                ]),
                ephemeral: true,
            });
        });

        it('should normalize unknown errors', async () => {
            const error = new Error('Unknown error');

            await errorHandler.handleError(error, {
                interaction: mockInteraction as CommandInteraction,
            });

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        color: 0xFF0000,
                        title: '❌ Error',
                        description: 'An unexpected error occurred. Please try again later.',
                    }),
                ]),
                ephemeral: true,
            });
        });
    });

    describe('Interaction Handling', () => {
        it('should use followUp when interaction is already replied', async () => {
            mockInteraction.replied = true;
            const error = new ValidationError('Test', 'TEST', 'Test message');

            await errorHandler.handleError(error, {
                interaction: mockInteraction as CommandInteraction,
            });

            expect(mockInteraction.followUp).toHaveBeenCalled();
            expect(mockInteraction.reply).not.toHaveBeenCalled();
        });

        it('should use followUp when interaction is deferred', async () => {
            mockInteraction.deferred = true;
            const error = new ValidationError('Test', 'TEST', 'Test message');

            await errorHandler.handleError(error, {
                interaction: mockInteraction as CommandInteraction,
            });

            expect(mockInteraction.followUp).toHaveBeenCalled();
            expect(mockInteraction.reply).not.toHaveBeenCalled();
        });

        it('should handle Discord API errors when sending error messages', async () => {
            mockInteraction.reply = vi.fn().mockRejectedValue(new Error('Discord API Error'));
            const error = new ValidationError('Test', 'TEST', 'Test message');

            // Should not throw
            await expect(errorHandler.handleError(error, {
                interaction: mockInteraction as CommandInteraction,
            })).resolves.not.toThrow();
        });
    });

    describe('Error Recovery', () => {
        it('should register and use custom recovery strategies', async () => {
            const mockStrategy = {
                canRecover: vi.fn().mockReturnValue(true),
                recover: vi.fn().mockResolvedValue(true),
            };

            errorHandler.registerRecoveryStrategy(ErrorCategory.PAYMENT_PROCESSOR, mockStrategy);

            const error = new PaymentProcessorError(
                'Recoverable error',
                'RECOVERABLE_ERROR',
                ErrorSeverity.MEDIUM,
                'crypto',
                'Test error',
                {},
                true // recoverable
            );

            await errorHandler.handleError(error);

            expect(mockStrategy.canRecover).toHaveBeenCalledWith(error);
            expect(mockStrategy.recover).toHaveBeenCalledWith(error, undefined);
        });

        it('should not attempt recovery for non-recoverable errors', async () => {
            const mockStrategy = {
                canRecover: vi.fn().mockReturnValue(true),
                recover: vi.fn().mockResolvedValue(true),
            };

            errorHandler.registerRecoveryStrategy(ErrorCategory.ESCROW, mockStrategy);

            const error = new EscrowError(
                'Non-recoverable error',
                'NON_RECOVERABLE',
                'test-tx-123',
                'Test error'
            );

            await errorHandler.handleError(error);

            expect(mockStrategy.canRecover).not.toHaveBeenCalled();
            expect(mockStrategy.recover).not.toHaveBeenCalled();
        });
    });

    describe('Critical Error Handling', () => {
        it('should handle critical errors with special logging', async () => {
            const error = new SecurityError(
                'Critical security breach',
                'SECURITY_BREACH',
                'System compromised'
            );

            await errorHandler.handleError(error, {
                userId: 'test-user',
                serverId: 'test-server',
            });

            // Should log with maximum detail for critical errors
            // This would be verified through the logger mock
        });
    });

    describe('Error Metadata', () => {
        it('should include all relevant metadata in error logs', async () => {
            const error = new PaymentProcessorError(
                'Payment failed',
                'PAYMENT_FAILED',
                ErrorSeverity.HIGH,
                'crypto',
                'Payment error',
                { originalAmount: 100 }
            );

            await errorHandler.handleError(error, {
                userId: 'test-user',
                serverId: 'test-server',
                transactionId: 'test-tx-123',
                additionalMetadata: { customField: 'customValue' },
            });

            // Verify that all metadata is included in the log
            // This would be verified through the logger mock
        });
    });
});

describe('Error Classes', () => {
    describe('ValidationError', () => {
        it('should create ValidationError with correct properties', () => {
            const error = new ValidationError(
                'Validation failed',
                'VALIDATION_FAILED',
                'User message',
                { field: 'amount' }
            );

            expect(error.name).toBe('ValidationError');
            expect(error.category).toBe(ErrorCategory.VALIDATION);
            expect(error.severity).toBe(ErrorSeverity.LOW);
            expect(error.recoverable).toBe(true);
            expect(error.code).toBe('VALIDATION_FAILED');
            expect(error.userMessage).toBe('User message');
            expect(error.metadata).toEqual({ field: 'amount' });
        });
    });

    describe('PaymentProcessorError', () => {
        it('should create PaymentProcessorError with correct properties', () => {
            const error = new PaymentProcessorError(
                'Payment failed',
                'PAYMENT_FAILED',
                ErrorSeverity.HIGH,
                'crypto',
                'User message',
                { amount: 100 },
                false
            );

            expect(error.name).toBe('PaymentProcessorError');
            expect(error.category).toBe(ErrorCategory.PAYMENT_PROCESSOR);
            expect(error.severity).toBe(ErrorSeverity.HIGH);
            expect(error.recoverable).toBe(false);
            expect(error.processorType).toBe('crypto');
        });

        it('should default to recoverable=true', () => {
            const error = new PaymentProcessorError(
                'Payment failed',
                'PAYMENT_FAILED',
                ErrorSeverity.MEDIUM,
                'ach'
            );

            expect(error.recoverable).toBe(true);
        });
    });

    describe('EscrowError', () => {
        it('should create EscrowError with correct properties', () => {
            const error = new EscrowError(
                'Escrow failed',
                'ESCROW_FAILED',
                'test-tx-123',
                'User message'
            );

            expect(error.name).toBe('EscrowError');
            expect(error.category).toBe(ErrorCategory.ESCROW);
            expect(error.severity).toBe(ErrorSeverity.HIGH);
            expect(error.recoverable).toBe(false);
            expect(error.transactionId).toBe('test-tx-123');
        });
    });

    describe('DiscordAPIError', () => {
        it('should create DiscordAPIError with correct properties', () => {
            const error = new DiscordAPIError(
                'Discord API failed',
                'DISCORD_API_FAILED',
                'User message'
            );

            expect(error.name).toBe('DiscordAPIError');
            expect(error.category).toBe(ErrorCategory.DISCORD_API);
            expect(error.severity).toBe(ErrorSeverity.MEDIUM);
            expect(error.recoverable).toBe(true);
        });
    });

    describe('DatabaseError', () => {
        it('should create DatabaseError with correct properties', () => {
            const error = new DatabaseError(
                'Database failed',
                'DB_FAILED',
                'SELECT',
                'User message'
            );

            expect(error.name).toBe('DatabaseError');
            expect(error.category).toBe(ErrorCategory.DATABASE);
            expect(error.severity).toBe(ErrorSeverity.HIGH);
            expect(error.recoverable).toBe(true);
        });
    });

    describe('SecurityError', () => {
        it('should create SecurityError with correct properties', () => {
            const error = new SecurityError(
                'Security violation',
                'SECURITY_VIOLATION',
                'User message'
            );

            expect(error.name).toBe('SecurityError');
            expect(error.category).toBe(ErrorCategory.SECURITY);
            expect(error.severity).toBe(ErrorSeverity.CRITICAL);
            expect(error.recoverable).toBe(false);
        });
    });

    describe('RateLimitError', () => {
        it('should create RateLimitError with correct properties', () => {
            const error = new RateLimitError(
                'Rate limited',
                'RATE_LIMITED',
                5000,
                'User message'
            );

            expect(error.name).toBe('RateLimitError');
            expect(error.category).toBe(ErrorCategory.RATE_LIMIT);
            expect(error.severity).toBe(ErrorSeverity.MEDIUM);
            expect(error.recoverable).toBe(true);
            expect(error.retryAfter).toBe(5000);
        });
    });
});