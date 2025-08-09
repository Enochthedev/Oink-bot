import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    PaymentProcessorError,
    ErrorSeverity,
    errorHandler
} from '../ErrorHandler';
import { paymentRecoveryManager } from '../PaymentRecovery';
import { circuitBreakerFactory } from '../CircuitBreaker';

// Mock logger
vi.mock('../Logger', () => ({
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        logPaymentProcessor: vi.fn(),
        logTransaction: vi.fn(),
    },
    LogLevel: {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3,
    },
}));

describe('Error Handling Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        // Reset circuit breakers
        circuitBreakerFactory.resetAll();
    });

    describe('Payment Processor Error Handling', () => {
        it('should handle payment processor errors with proper categorization', async () => {
            const error = new PaymentProcessorError(
                'Payment failed due to network error',
                'NETWORK_ERROR',
                ErrorSeverity.MEDIUM,
                'crypto',
                'Payment temporarily unavailable. Please try again.',
                { transactionId: 'test-tx-123' }
            );

            // Should not throw when handling the error
            await expect(errorHandler.handleError(error, {
                userId: 'test-user',
                transactionId: 'test-tx-123',
            })).resolves.not.toThrow();
        });

        it('should create proper error instances', () => {
            const error = new PaymentProcessorError(
                'Test error',
                'TEST_ERROR',
                ErrorSeverity.HIGH,
                'crypto',
                'User message'
            );

            expect(error.name).toBe('PaymentProcessorError');
            expect(error.category).toBe('PAYMENT_PROCESSOR');
            expect(error.severity).toBe(ErrorSeverity.HIGH);
            expect(error.processorType).toBe('crypto');
            expect(error.recoverable).toBe(true); // default
        });
    });

    describe('Circuit Breaker Integration', () => {
        it('should create circuit breakers for different services', () => {
            const cryptoBreaker = circuitBreakerFactory.getCircuitBreaker('crypto-processor');
            const achBreaker = circuitBreakerFactory.getCircuitBreaker('ach-processor');

            expect(cryptoBreaker).toBeDefined();
            expect(achBreaker).toBeDefined();
            expect(cryptoBreaker).not.toBe(achBreaker);
        });

        it('should provide health status for circuit breakers', () => {
            const cryptoBreaker = circuitBreakerFactory.getCircuitBreaker('crypto-processor');
            const health = cryptoBreaker.getHealthStatus();

            expect(health).toHaveProperty('state');
            expect(health).toHaveProperty('healthy');
            expect(health).toHaveProperty('failureRate');
            expect(health).toHaveProperty('uptime');
        });
    });

    describe('Recovery Manager Integration', () => {
        it('should provide processor health information', () => {
            const health = paymentRecoveryManager.getProcessorHealth();
            expect(typeof health).toBe('object');
        });

        it('should allow configuration updates', () => {
            expect(() => {
                paymentRecoveryManager.setRetryConfig('test-processor', {
                    maxAttempts: 5,
                    baseDelay: 1000,
                });
            }).not.toThrow();
        });

        it('should allow processor resets', () => {
            expect(() => {
                paymentRecoveryManager.resetProcessor('crypto');
                paymentRecoveryManager.resetAllProcessors();
            }).not.toThrow();
        });
    });

    describe('Error Categories', () => {
        it('should properly categorize different error types', () => {
            const validationError = new PaymentProcessorError(
                'Invalid amount',
                'INVALID_AMOUNT',
                ErrorSeverity.LOW,
                'crypto'
            );

            const networkError = new PaymentProcessorError(
                'Network timeout',
                'NETWORK_TIMEOUT',
                ErrorSeverity.MEDIUM,
                'crypto'
            );

            const criticalError = new PaymentProcessorError(
                'System failure',
                'SYSTEM_FAILURE',
                ErrorSeverity.CRITICAL,
                'crypto'
            );

            expect(validationError.severity).toBe(ErrorSeverity.LOW);
            expect(networkError.severity).toBe(ErrorSeverity.MEDIUM);
            expect(criticalError.severity).toBe(ErrorSeverity.CRITICAL);
        });
    });

    describe('Error Recovery Strategies', () => {
        it('should identify recoverable vs non-recoverable errors', () => {
            const recoverableError = new PaymentProcessorError(
                'Temporary network error',
                'NETWORK_ERROR',
                ErrorSeverity.MEDIUM,
                'crypto',
                'Please try again',
                {},
                true // recoverable
            );

            const nonRecoverableError = new PaymentProcessorError(
                'Invalid credentials',
                'INVALID_CREDENTIALS',
                ErrorSeverity.HIGH,
                'crypto',
                'Please check your credentials',
                {},
                false // not recoverable
            );

            expect(recoverableError.recoverable).toBe(true);
            expect(nonRecoverableError.recoverable).toBe(false);
        });
    });

    describe('Comprehensive Error Flow', () => {
        it('should handle a complete error scenario', async () => {
            // Create a payment processor error
            const error = new PaymentProcessorError(
                'Payment processing failed due to temporary network issue',
                'NETWORK_TIMEOUT',
                ErrorSeverity.MEDIUM,
                'crypto',
                'Payment temporarily unavailable. Please try again in a few minutes.',
                {
                    transactionId: 'tx-12345',
                    amount: 100,
                    processorType: 'crypto',
                    attempt: 1,
                },
                true // recoverable
            );

            // Handle the error through the centralized error handler
            await errorHandler.handleError(error, {
                userId: 'user-123',
                serverId: 'server-456',
                transactionId: 'tx-12345',
                additionalMetadata: {
                    commandName: 'pay',
                    targetUser: 'user-789',
                },
            });

            // The error should be handled without throwing
            // In a real scenario, this would:
            // 1. Log the error with appropriate level and metadata
            // 2. Attempt recovery if the error is recoverable
            // 3. Send user-friendly error message if interaction is provided
            // 4. Handle critical errors with special alerting
        });
    });
});