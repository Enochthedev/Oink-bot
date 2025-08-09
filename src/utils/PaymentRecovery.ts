import { logger, LogLevel } from './Logger';
import {
    PaymentProcessorError,
    ErrorSeverity,
    ErrorRecoveryStrategy,
    BaseError
} from './ErrorHandler';
import { CircuitBreaker, circuitBreakerFactory } from './CircuitBreaker';

export interface RetryConfig {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    jitter: boolean;
}

export interface PaymentRecoveryContext {
    transactionId: string;
    processorType: string;
    operation: 'withdraw' | 'deposit' | 'validate';
    amount?: number;
    attempt: number;
    originalError: Error;
}

export class PaymentRecoveryManager {
    private static instance: PaymentRecoveryManager;
    private retryConfigs: Map<string, RetryConfig> = new Map();
    private circuitBreakers: Map<string, CircuitBreaker> = new Map();

    private constructor() {
        this.initializeDefaultConfigs();
    }

    public static getInstance(): PaymentRecoveryManager {
        if (!PaymentRecoveryManager.instance) {
            PaymentRecoveryManager.instance = new PaymentRecoveryManager();
        }
        return PaymentRecoveryManager.instance;
    }

    private initializeDefaultConfigs(): void {
        // Default retry configurations for different processor types
        const defaultConfig: RetryConfig = {
            maxAttempts: 3,
            baseDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2,
            jitter: true,
        };

        // Crypto processors might need different retry logic
        this.retryConfigs.set('crypto', {
            ...defaultConfig,
            maxAttempts: 5,
            baseDelay: 2000,
            maxDelay: 60000,
        });

        // ACH processors typically have longer delays
        this.retryConfigs.set('ach', {
            ...defaultConfig,
            maxAttempts: 2,
            baseDelay: 5000,
            maxDelay: 120000,
            backoffMultiplier: 3,
        });

        // Generic processor config
        this.retryConfigs.set('default', defaultConfig);
    }

    public async executeWithRecovery<T>(
        operation: () => Promise<T>,
        context: PaymentRecoveryContext
    ): Promise<T> {
        const config = this.getRetryConfig(context.processorType);
        const circuitBreaker = this.getCircuitBreaker(context.processorType);

        return await circuitBreaker.execute(async () => {
            return await this.retryWithBackoff(operation, config, context);
        });
    }

    private async retryWithBackoff<T>(
        operation: () => Promise<T>,
        config: RetryConfig,
        context: PaymentRecoveryContext
    ): Promise<T> {
        let lastError: Error;

        for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
            try {
                logger.logPaymentProcessor(
                    LogLevel.DEBUG,
                    `Attempting payment operation: ${context.operation}`,
                    context.processorType,
                    {
                        transactionId: context.transactionId,
                        attempt,
                        maxAttempts: config.maxAttempts,
                    }
                );

                const result = await operation();

                if (attempt > 1) {
                    logger.logPaymentProcessor(
                        LogLevel.INFO,
                        `Payment operation succeeded after retry`,
                        context.processorType,
                        {
                            transactionId: context.transactionId,
                            attempt,
                            operation: context.operation,
                        }
                    );
                }

                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');

                logger.logPaymentProcessor(
                    LogLevel.WARN,
                    `Payment operation failed on attempt ${attempt}`,
                    context.processorType,
                    {
                        transactionId: context.transactionId,
                        attempt,
                        operation: context.operation,
                        error: lastError.message,
                    },
                    lastError
                );

                // Check if error is recoverable
                if (!this.isRecoverableError(lastError, context)) {
                    logger.logPaymentProcessor(
                        LogLevel.ERROR,
                        `Non-recoverable error encountered, stopping retries`,
                        context.processorType,
                        {
                            transactionId: context.transactionId,
                            error: lastError.message,
                        }
                    );
                    throw lastError;
                }

                // Don't wait after the last attempt
                if (attempt < config.maxAttempts) {
                    const delay = this.calculateDelay(attempt, config);
                    logger.logPaymentProcessor(
                        LogLevel.DEBUG,
                        `Waiting ${delay}ms before retry`,
                        context.processorType,
                        {
                            transactionId: context.transactionId,
                            attempt,
                            delay,
                        }
                    );
                    await this.sleep(delay);
                }
            }
        }

        // All attempts failed
        logger.logPaymentProcessor(
            LogLevel.ERROR,
            `All retry attempts exhausted for payment operation`,
            context.processorType,
            {
                transactionId: context.transactionId,
                operation: context.operation,
                maxAttempts: config.maxAttempts,
                finalError: lastError!.message,
            },
            lastError!
        );

        throw new PaymentProcessorError(
            `Payment operation failed after ${config.maxAttempts} attempts: ${lastError!.message}`,
            'RETRY_EXHAUSTED',
            ErrorSeverity.HIGH,
            context.processorType,
            'Payment processing failed. Please try again later.',
            {
                transactionId: context.transactionId,
                operation: context.operation,
                attempts: config.maxAttempts,
                originalError: lastError!.message,
            }
        );
    }

    private isRecoverableError(error: Error, context: PaymentRecoveryContext): boolean {
        // Network-related errors are usually recoverable
        const networkErrors = [
            'ECONNRESET',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'EAI_AGAIN',
        ];

        if (networkErrors.some(code => error.message.includes(code))) {
            return true;
        }

        // Timeout errors are recoverable
        if (error.message.includes('timeout') || error.message.includes('timed out')) {
            return true;
        }

        // Rate limiting errors are recoverable
        if (error.message.includes('rate limit') || error.message.includes('too many requests')) {
            return true;
        }

        // Server errors (5xx) are usually recoverable
        if (error.message.includes('500') || error.message.includes('502') ||
            error.message.includes('503') || error.message.includes('504')) {
            return true;
        }

        // Processor-specific recoverable errors
        if (context.processorType === 'crypto') {
            return this.isCryptoRecoverableError(error);
        }

        if (context.processorType === 'ach') {
            return this.isACHRecoverableError(error);
        }

        // Default: assume non-recoverable for safety
        return false;
    }

    private isCryptoRecoverableError(error: Error): boolean {
        const recoverableMessages = [
            'network congestion',
            'insufficient gas',
            'nonce too low',
            'replacement transaction underpriced',
            'blockchain temporarily unavailable',
        ];

        return recoverableMessages.some(msg =>
            error.message.toLowerCase().includes(msg.toLowerCase())
        );
    }

    private isACHRecoverableError(error: Error): boolean {
        const recoverableMessages = [
            'bank temporarily unavailable',
            'processing system maintenance',
            'temporary service interruption',
        ];

        return recoverableMessages.some(msg =>
            error.message.toLowerCase().includes(msg.toLowerCase())
        );
    }

    private calculateDelay(attempt: number, config: RetryConfig): number {
        let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
        delay = Math.min(delay, config.maxDelay);

        if (config.jitter) {
            // Add jitter to prevent thundering herd
            const jitterAmount = delay * 0.1;
            delay += (Math.random() - 0.5) * 2 * jitterAmount;
        }

        return Math.max(delay, 0);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private getRetryConfig(processorType: string): RetryConfig {
        return this.retryConfigs.get(processorType) || this.retryConfigs.get('default')!;
    }

    private getCircuitBreaker(processorType: string): CircuitBreaker {
        if (!this.circuitBreakers.has(processorType)) {
            this.circuitBreakers.set(
                processorType,
                circuitBreakerFactory.getCircuitBreaker(`payment-processor-${processorType}`, {
                    failureThreshold: 5,
                    recoveryTimeout: 60000,
                    timeout: 30000,
                })
            );
        }
        return this.circuitBreakers.get(processorType)!;
    }

    // Configuration methods
    public setRetryConfig(processorType: string, config: Partial<RetryConfig>): void {
        const currentConfig = this.getRetryConfig(processorType);
        this.retryConfigs.set(processorType, { ...currentConfig, ...config });

        logger.info(`Updated retry configuration for processor: ${processorType}`, {
            processorType,
            config: { ...currentConfig, ...config },
        });
    }

    public getProcessorHealth(): Record<string, unknown> {
        const health: Record<string, unknown> = {};

        for (const [processorType, circuitBreaker] of this.circuitBreakers) {
            health[processorType] = circuitBreaker.getHealthStatus();
        }

        return health;
    }

    public resetProcessor(processorType: string): void {
        const circuitBreaker = this.circuitBreakers.get(processorType);
        if (circuitBreaker) {
            circuitBreaker.reset();
            logger.info(`Reset circuit breaker for processor: ${processorType}`);
        }
    }

    public resetAllProcessors(): void {
        for (const [processorType, circuitBreaker] of this.circuitBreakers) {
            circuitBreaker.reset();
        }
        logger.info('Reset all payment processor circuit breakers');
    }
}

// Recovery strategies for the centralized error handler
export class PaymentProcessorRecoveryStrategy implements ErrorRecoveryStrategy {
    private recoveryManager = PaymentRecoveryManager.getInstance();

    canRecover(error: BaseError): boolean {
        return error instanceof PaymentProcessorError && error.recoverable;
    }

    async recover(error: BaseError, context?: unknown): Promise<boolean> {
        if (!(error instanceof PaymentProcessorError)) {
            return false;
        }

        // For now, we don't automatically retry failed operations
        // This would require storing the original operation context
        // In a real implementation, you might queue failed operations for retry

        logger.logPaymentProcessor(
            LogLevel.INFO,
            'Payment processor error recovery attempted',
            error.metadata?.processorType as string || 'unknown',
            {
                errorCode: error.code,
                recoverable: error.recoverable,
            }
        );

        return false; // Placeholder - would implement actual recovery logic
    }
}

// Export singleton instance
export const paymentRecoveryManager = PaymentRecoveryManager.getInstance();