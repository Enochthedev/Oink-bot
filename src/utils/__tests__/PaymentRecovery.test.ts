import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    PaymentRecoveryManager,
    PaymentProcessorRecoveryStrategy,
    paymentRecoveryManager,
} from '../PaymentRecovery';
import { PaymentProcessorError, ErrorSeverity } from '../ErrorHandler';

// Mock logger
vi.mock('../Logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        logPaymentProcessor: vi.fn(),
    },
    LogLevel: {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3,
    },
}));

// Mock CircuitBreaker
vi.mock('../CircuitBreaker', () => ({
    circuitBreakerFactory: {
        getCircuitBreaker: vi.fn(() => ({
            execute: vi.fn((operation) => operation()),
            getHealthStatus: vi.fn(() => ({ healthy: true })),
            reset: vi.fn(),
        })),
    },
}));

describe('PaymentRecoveryManager', () => {
    let recoveryManager: PaymentRecoveryManager;
    let mockOperation: vi.Mock;

    beforeEach(() => {
        recoveryManager = PaymentRecoveryManager.getInstance();
        mockOperation = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    describe('Successful Operations', () => {
        it('should execute operation successfully on first attempt', async () => {
            mockOperation.mockResolvedValue('success');

            const result = await recoveryManager.executeWithRecovery(mockOperation, {
                transactionId: 'test-tx-123',
                processorType: 'crypto',
                operation: 'withdraw',
                amount: 100,
                attempt: 1,
                originalError: new Error('test'),
            });

            expect(result).toBe('success');
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });
    });

    describe('Retry Logic', () => {
        it('should retry recoverable errors', async () => {
            vi.useFakeTimers();
            mockOperation
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockRejectedValueOnce(new Error('timeout'))
                .mockResolvedValueOnce('success');

            const executePromise = recoveryManager.executeWithRecovery(mockOperation, {
                transactionId: 'test-tx-123',
                processorType: 'crypto',
                operation: 'withdraw',
                amount: 100,
                attempt: 1,
                originalError: new Error('test'),
            });

            // Fast-forward through retry delays
            vi.runAllTimers();

            const result = await executePromise;
            expect(result).toBe('success');
            expect(mockOperation).toHaveBeenCalledTimes(3);
        });

        it('should not retry non-recoverable errors', async () => {
            mockOperation.mockRejectedValue(new Error('Invalid credentials'));

            await expect(recoveryManager.executeWithRecovery(mockOperation, {
                transactionId: 'test-tx-123',
                processorType: 'crypto',
                operation: 'withdraw',
                amount: 100,
                attempt: 1,
                originalError: new Error('test'),
            })).rejects.toThrow('Invalid credentials');

            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should exhaust retries and throw PaymentProcessorError', async () => {
            mockOperation.mockRejectedValue(new Error('ECONNRESET'));

            await expect(recoveryManager.executeWithRecovery(mockOperation, {
                transactionId: 'test-tx-123',
                processorType: 'crypto',
                operation: 'withdraw',
                amount: 100,
                attempt: 1,
                originalError: new Error('test'),
            })).rejects.toThrow(PaymentProcessorError);

            // Should retry 5 times for crypto (maxAttempts = 5)
            expect(mockOperation).toHaveBeenCalledTimes(5);
        });
    });

    describe('Error Recovery Detection', () => {
        it('should identify network errors as recoverable', async () => {
            const networkErrors = [
                'ECONNRESET',
                'ECONNREFUSED',
                'ETIMEDOUT',
                'ENOTFOUND',
                'EAI_AGAIN',
            ];

            for (const errorCode of networkErrors) {
                mockOperation.mockRejectedValueOnce(new Error(errorCode));
                mockOperation.mockResolvedValueOnce('success');

                const result = await recoveryManager.executeWithRecovery(mockOperation, {
                    transactionId: 'test-tx-123',
                    processorType: 'crypto',
                    operation: 'withdraw',
                    amount: 100,
                    attempt: 1,
                    originalError: new Error('test'),
                });

                expect(result).toBe('success');
                mockOperation.mockClear();
            }
        });

        it('should identify timeout errors as recoverable', async () => {
            mockOperation
                .mockRejectedValueOnce(new Error('Operation timed out'))
                .mockResolvedValueOnce('success');

            const result = await recoveryManager.executeWithRecovery(mockOperation, {
                transactionId: 'test-tx-123',
                processorType: 'crypto',
                operation: 'withdraw',
                amount: 100,
                attempt: 1,
                originalError: new Error('test'),
            });

            expect(result).toBe('success');
            expect(mockOperation).toHaveBeenCalledTimes(2);
        });

        it('should identify rate limit errors as recoverable', async () => {
            mockOperation
                .mockRejectedValueOnce(new Error('rate limit exceeded'))
                .mockResolvedValueOnce('success');

            const result = await recoveryManager.executeWithRecovery(mockOperation, {
                transactionId: 'test-tx-123',
                processorType: 'crypto',
                operation: 'withdraw',
                amount: 100,
                attempt: 1,
                originalError: new Error('test'),
            });

            expect(result).toBe('success');
            expect(mockOperation).toHaveBeenCalledTimes(2);
        });

        it('should identify server errors as recoverable', async () => {
            const serverErrors = ['500', '502', '503', '504'];

            for (const errorCode of serverErrors) {
                mockOperation.mockRejectedValueOnce(new Error(`Server error ${errorCode}`));
                mockOperation.mockResolvedValueOnce('success');

                const result = await recoveryManager.executeWithRecovery(mockOperation, {
                    transactionId: 'test-tx-123',
                    processorType: 'crypto',
                    operation: 'withdraw',
                    amount: 100,
                    attempt: 1,
                    originalError: new Error('test'),
                });

                expect(result).toBe('success');
                mockOperation.mockClear();
            }
        });
    });

    describe('Crypto-specific Recovery', () => {
        it('should identify crypto-specific recoverable errors', async () => {
            const cryptoErrors = [
                'network congestion',
                'insufficient gas',
                'nonce too low',
                'replacement transaction underpriced',
                'blockchain temporarily unavailable',
            ];

            for (const errorMessage of cryptoErrors) {
                mockOperation.mockRejectedValueOnce(new Error(errorMessage));
                mockOperation.mockResolvedValueOnce('success');

                const result = await recoveryManager.executeWithRecovery(mockOperation, {
                    transactionId: 'test-tx-123',
                    processorType: 'crypto',
                    operation: 'withdraw',
                    amount: 100,
                    attempt: 1,
                    originalError: new Error('test'),
                });

                expect(result).toBe('success');
                mockOperation.mockClear();
            }
        });
    });

    describe('ACH-specific Recovery', () => {
        it('should identify ACH-specific recoverable errors', async () => {
            const achErrors = [
                'bank temporarily unavailable',
                'processing system maintenance',
                'temporary service interruption',
            ];

            for (const errorMessage of achErrors) {
                mockOperation.mockRejectedValueOnce(new Error(errorMessage));
                mockOperation.mockResolvedValueOnce('success');

                const result = await recoveryManager.executeWithRecovery(mockOperation, {
                    transactionId: 'test-tx-123',
                    processorType: 'ach',
                    operation: 'withdraw',
                    amount: 100,
                    attempt: 1,
                    originalError: new Error('test'),
                });

                expect(result).toBe('success');
                mockOperation.mockClear();
            }
        });

        it('should use ACH-specific retry configuration', async () => {
            mockOperation.mockRejectedValue(new Error('ECONNRESET'));

            await expect(recoveryManager.executeWithRecovery(mockOperation, {
                transactionId: 'test-tx-123',
                processorType: 'ach',
                operation: 'withdraw',
                amount: 100,
                attempt: 1,
                originalError: new Error('test'),
            })).rejects.toThrow(PaymentProcessorError);

            // ACH should retry only 2 times (maxAttempts = 2)
            expect(mockOperation).toHaveBeenCalledTimes(2);
        });
    });

    describe('Backoff Strategy', () => {
        it('should implement exponential backoff with jitter', async () => {
            vi.useFakeTimers();
            const sleepSpy = vi.spyOn(global, 'setTimeout');

            mockOperation
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockResolvedValueOnce('success');

            const executePromise = recoveryManager.executeWithRecovery(mockOperation, {
                transactionId: 'test-tx-123',
                processorType: 'crypto',
                operation: 'withdraw',
                amount: 100,
                attempt: 1,
                originalError: new Error('test'),
            });

            // Fast-forward through delays
            vi.runAllTimers();

            await executePromise;

            // Should have called setTimeout for delays between retries
            expect(sleepSpy).toHaveBeenCalled();
        });
    });

    describe('Configuration Management', () => {
        it('should allow custom retry configuration', () => {
            recoveryManager.setRetryConfig('custom', {
                maxAttempts: 10,
                baseDelay: 500,
            });

            // Configuration should be updated
            // This would be tested by checking the actual retry behavior
        });

        it('should provide processor health information', () => {
            const health = recoveryManager.getProcessorHealth();
            expect(typeof health).toBe('object');
        });

        it('should reset individual processors', () => {
            expect(() => recoveryManager.resetProcessor('crypto')).not.toThrow();
        });

        it('should reset all processors', () => {
            expect(() => recoveryManager.resetAllProcessors()).not.toThrow();
        });
    });

    describe('Singleton Pattern', () => {
        it('should return the same instance', () => {
            const manager1 = PaymentRecoveryManager.getInstance();
            const manager2 = PaymentRecoveryManager.getInstance();

            expect(manager1).toBe(manager2);
        });

        it('should use the exported singleton', () => {
            const manager = PaymentRecoveryManager.getInstance();
            expect(paymentRecoveryManager).toBe(manager);
        });
    });
});

describe('PaymentProcessorRecoveryStrategy', () => {
    let strategy: PaymentProcessorRecoveryStrategy;

    beforeEach(() => {
        strategy = new PaymentProcessorRecoveryStrategy();
    });

    describe('canRecover', () => {
        it('should return true for recoverable PaymentProcessorError', () => {
            const error = new PaymentProcessorError(
                'Recoverable error',
                'RECOVERABLE',
                ErrorSeverity.MEDIUM,
                'crypto',
                'User message',
                {},
                true // recoverable
            );

            expect(strategy.canRecover(error)).toBe(true);
        });

        it('should return false for non-recoverable PaymentProcessorError', () => {
            const error = new PaymentProcessorError(
                'Non-recoverable error',
                'NON_RECOVERABLE',
                ErrorSeverity.HIGH,
                'crypto',
                'User message',
                {},
                false // not recoverable
            );

            expect(strategy.canRecover(error)).toBe(false);
        });

        it('should return false for non-PaymentProcessorError', () => {
            const error = new Error('Regular error');

            expect(strategy.canRecover(error as any)).toBe(false);
        });
    });

    describe('recover', () => {
        it('should return false for PaymentProcessorError (placeholder implementation)', async () => {
            const error = new PaymentProcessorError(
                'Recoverable error',
                'RECOVERABLE',
                ErrorSeverity.MEDIUM,
                'crypto',
                'User message',
                {},
                true
            );

            const result = await strategy.recover(error);
            expect(result).toBe(false);
        });

        it('should return false for non-PaymentProcessorError', async () => {
            const error = new Error('Regular error');

            const result = await strategy.recover(error as any);
            expect(result).toBe(false);
        });
    });
});