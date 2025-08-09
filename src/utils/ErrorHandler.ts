import { CommandInteraction, ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction } from 'discord.js';
import { logger, LogLevel } from './Logger';

// Error categories for better organization and handling
export enum ErrorCategory {
    VALIDATION = 'VALIDATION',
    PAYMENT_PROCESSOR = 'PAYMENT_PROCESSOR',
    ESCROW = 'ESCROW',
    DISCORD_API = 'DISCORD_API',
    DATABASE = 'DATABASE',
    AUTHENTICATION = 'AUTHENTICATION',
    AUTHORIZATION = 'AUTHORIZATION',
    RATE_LIMIT = 'RATE_LIMIT',
    NETWORK = 'NETWORK',
    CONFIGURATION = 'CONFIGURATION',
    SECURITY = 'SECURITY',
    UNKNOWN = 'UNKNOWN',
}

// Error severity levels
export enum ErrorSeverity {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL',
}

// Base error interface
export interface BaseError extends Error {
    category: ErrorCategory;
    severity: ErrorSeverity;
    code: string;
    metadata?: Record<string, unknown>;
    recoverable: boolean;
    userMessage?: string;
}

// Specific error classes
export class ValidationError extends Error implements BaseError {
    public readonly category = ErrorCategory.VALIDATION;
    public readonly severity = ErrorSeverity.LOW;
    public readonly recoverable = true;

    constructor(
        message: string,
        public readonly code: string,
        public readonly userMessage?: string,
        public readonly metadata?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class PaymentProcessorError extends Error implements BaseError {
    public readonly category = ErrorCategory.PAYMENT_PROCESSOR;
    public readonly recoverable: boolean;

    constructor(
        message: string,
        public readonly code: string,
        public readonly severity: ErrorSeverity,
        public readonly processorType: string,
        public readonly userMessage?: string,
        public readonly metadata?: Record<string, unknown>,
        recoverable = true
    ) {
        super(message);
        this.name = 'PaymentProcessorError';
        this.recoverable = recoverable;
    }
}

export class EscrowError extends Error implements BaseError {
    public readonly category = ErrorCategory.ESCROW;
    public readonly severity = ErrorSeverity.HIGH;
    public readonly recoverable = false;

    constructor(
        message: string,
        public readonly code: string,
        public readonly transactionId: string,
        public readonly userMessage?: string,
        public readonly metadata?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'EscrowError';
    }
}

export class DiscordAPIError extends Error implements BaseError {
    public readonly category = ErrorCategory.DISCORD_API;
    public readonly severity = ErrorSeverity.MEDIUM;
    public readonly recoverable = true;

    constructor(
        message: string,
        public readonly code: string,
        public readonly userMessage?: string,
        public readonly metadata?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'DiscordAPIError';
    }
}

export class DatabaseError extends Error implements BaseError {
    public readonly category = ErrorCategory.DATABASE;
    public readonly severity = ErrorSeverity.HIGH;
    public readonly recoverable = true;

    constructor(
        message: string,
        public readonly code: string,
        public readonly operation: string,
        public readonly userMessage?: string,
        public readonly metadata?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'DatabaseError';
    }
}

export class SecurityError extends Error implements BaseError {
    public readonly category = ErrorCategory.SECURITY;
    public readonly severity = ErrorSeverity.CRITICAL;
    public readonly recoverable = false;

    constructor(
        message: string,
        public readonly code: string,
        public readonly userMessage?: string,
        public readonly metadata?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'SecurityError';
    }
}

export class RateLimitError extends Error implements BaseError {
    public readonly category = ErrorCategory.RATE_LIMIT;
    public readonly severity = ErrorSeverity.MEDIUM;
    public readonly recoverable = true;

    constructor(
        message: string,
        public readonly code: string,
        public readonly retryAfter?: number,
        public readonly userMessage?: string,
        public readonly metadata?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'RateLimitError';
    }
}

// Error recovery strategies
export interface ErrorRecoveryStrategy {
    canRecover(error: BaseError): boolean;
    recover(error: BaseError, context?: unknown): Promise<boolean>;
}

// Centralized error handler
export class CentralizedErrorHandler {
    private static instance: CentralizedErrorHandler;
    private recoveryStrategies: Map<ErrorCategory, ErrorRecoveryStrategy[]> = new Map();

    private constructor() {
        this.initializeRecoveryStrategies();
    }

    public static getInstance(): CentralizedErrorHandler {
        if (!CentralizedErrorHandler.instance) {
            CentralizedErrorHandler.instance = new CentralizedErrorHandler();
        }
        return CentralizedErrorHandler.instance;
    }

    public async handleError(
        error: Error | BaseError,
        context?: {
            interaction?: CommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
            userId?: string;
            serverId?: string;
            transactionId?: string;
            additionalMetadata?: Record<string, unknown>;
        }
    ): Promise<void> {
        const baseError = this.normalizeError(error);

        // Log the error with appropriate level
        const logLevel = this.getLogLevelForSeverity(baseError.severity);
        logger.error(
            `${baseError.category}: ${baseError.message}`,
            {
                code: baseError.code,
                severity: baseError.severity,
                recoverable: baseError.recoverable,
                userId: context?.userId,
                serverId: context?.serverId,
                transactionId: context?.transactionId,
                ...baseError.metadata,
                ...context?.additionalMetadata,
            },
            baseError
        );

        // Attempt recovery if the error is recoverable
        if (baseError.recoverable) {
            const recovered = await this.attemptRecovery(baseError, context);
            if (recovered) {
                logger.info(`Successfully recovered from error: ${baseError.code}`, {
                    errorCategory: baseError.category,
                    transactionId: context?.transactionId,
                });
                return;
            }
        }

        // Send user-friendly error message if interaction is available
        if (context?.interaction) {
            await this.sendErrorToUser(context.interaction, baseError);
        }

        // Handle critical errors
        if (baseError.severity === ErrorSeverity.CRITICAL) {
            await this.handleCriticalError(baseError, context);
        }
    }

    private normalizeError(error: Error | BaseError): BaseError {
        if (this.isBaseError(error)) {
            return error;
        }

        // Convert standard errors to BaseError
        return {
            ...error,
            category: ErrorCategory.UNKNOWN,
            severity: ErrorSeverity.MEDIUM,
            code: 'UNKNOWN_ERROR',
            recoverable: false,
            userMessage: 'An unexpected error occurred. Please try again later.',
        };
    }

    private isBaseError(error: Error): error is BaseError {
        return 'category' in error && 'severity' in error && 'code' in error;
    }

    private getLogLevelForSeverity(severity: ErrorSeverity): LogLevel {
        switch (severity) {
            case ErrorSeverity.LOW:
                return LogLevel.WARN;
            case ErrorSeverity.MEDIUM:
                return LogLevel.ERROR;
            case ErrorSeverity.HIGH:
            case ErrorSeverity.CRITICAL:
                return LogLevel.ERROR;
            default:
                return LogLevel.ERROR;
        }
    }

    private async attemptRecovery(error: BaseError, context?: unknown): Promise<boolean> {
        const strategies = this.recoveryStrategies.get(error.category) || [];

        for (const strategy of strategies) {
            if (strategy.canRecover(error)) {
                try {
                    const recovered = await strategy.recover(error, context);
                    if (recovered) {
                        return true;
                    }
                } catch (recoveryError) {
                    logger.error('Error recovery strategy failed', {
                        originalError: error.code,
                        recoveryError: recoveryError instanceof Error ? recoveryError.message : 'Unknown',
                    });
                }
            }
        }

        return false;
    }

    private async sendErrorToUser(
        interaction: CommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
        error: BaseError
    ): Promise<void> {
        const userMessage = error.userMessage || 'An error occurred while processing your request.';

        try {
            const embed = {
                color: this.getColorForSeverity(error.severity),
                title: this.getTitleForCategory(error.category),
                description: userMessage,
                timestamp: new Date().toISOString(),
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [embed], flags: 64 });
            } else {
                await interaction.reply({ embeds: [embed], flags: 64 });
            }
        } catch (discordError) {
            logger.error('Failed to send error message to user', {
                originalError: error.code,
                discordError: discordError instanceof Error ? discordError.message : 'Unknown',
            });
        }
    }

    private getColorForSeverity(severity: ErrorSeverity): number {
        switch (severity) {
            case ErrorSeverity.LOW:
                return 0xFFFF00; // Yellow
            case ErrorSeverity.MEDIUM:
                return 0xFF6B00; // Orange
            case ErrorSeverity.HIGH:
                return 0xFF0000; // Red
            case ErrorSeverity.CRITICAL:
                return 0x8B0000; // Dark Red
            default:
                return 0xFF0000;
        }
    }

    private getTitleForCategory(category: ErrorCategory): string {
        switch (category) {
            case ErrorCategory.VALIDATION:
                return '⚠️ Validation Error';
            case ErrorCategory.PAYMENT_PROCESSOR:
                return '💳 Payment Error';
            case ErrorCategory.ESCROW:
                return '🏦 Escrow Error';
            case ErrorCategory.DISCORD_API:
                return '🤖 Discord Error';
            case ErrorCategory.DATABASE:
                return '💾 Database Error';
            case ErrorCategory.AUTHENTICATION:
                return '🔐 Authentication Error';
            case ErrorCategory.AUTHORIZATION:
                return '🚫 Authorization Error';
            case ErrorCategory.RATE_LIMIT:
                return '⏱️ Rate Limit Error';
            case ErrorCategory.NETWORK:
                return '🌐 Network Error';
            case ErrorCategory.SECURITY:
                return '🛡️ Security Error';
            default:
                return '❌ Error';
        }
    }

    private async handleCriticalError(error: BaseError, context?: unknown): Promise<void> {
        // Log critical error with maximum detail
        logger.error('CRITICAL ERROR DETECTED', {
            error: error.message,
            code: error.code,
            category: error.category,
            stack: error.stack,
            context: JSON.stringify(context),
        });

        // In production, you would send alerts to monitoring services
        if (process.env.NODE_ENV === 'production') {
            // TODO: Send to monitoring service (e.g., Sentry, PagerDuty)
            // await this.sendCriticalAlert(error, context);
        }
    }

    private initializeRecoveryStrategies(): void {
        // Initialize recovery strategies for different error categories
        // These would be implemented based on specific recovery needs

        // Example: Payment processor recovery strategy
        this.recoveryStrategies.set(ErrorCategory.PAYMENT_PROCESSOR, [
            {
                canRecover: (error: BaseError) => error.code === 'NETWORK_TIMEOUT',
                recover: async (error: BaseError, context?: unknown) => {
                    // Implement retry logic for network timeouts
                    return false; // Placeholder
                },
            },
        ]);

        // Example: Discord API recovery strategy
        this.recoveryStrategies.set(ErrorCategory.DISCORD_API, [
            {
                canRecover: (error: BaseError) => error.code === 'RATE_LIMITED',
                recover: async (error: BaseError, context?: unknown) => {
                    // Implement retry with backoff for rate limits
                    return false; // Placeholder
                },
            },
        ]);
    }

    // Method to register custom recovery strategies
    public registerRecoveryStrategy(category: ErrorCategory, strategy: ErrorRecoveryStrategy): void {
        if (!this.recoveryStrategies.has(category)) {
            this.recoveryStrategies.set(category, []);
        }
        this.recoveryStrategies.get(category)!.push(strategy);
    }
}

// Export singleton instance
export const errorHandler = CentralizedErrorHandler.getInstance();