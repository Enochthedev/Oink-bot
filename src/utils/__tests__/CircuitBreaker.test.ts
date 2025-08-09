import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    CircuitBreaker,
    CircuitBreakerState,
    CircuitBreakerError,
    CircuitBreakerFactory,
    circuitBreakerFactory,
} from '../CircuitBreaker';

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

describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;
    let mockOperation: vi.Mock;

    beforeEach(() => {
        circuitBreaker = new CircuitBreaker('test-service', {
            failureThreshold: 3,
            recoveryTimeout: 1000,
            monitoringPeriod: 5000,
            successThreshold: 2,
            timeout: 500,
        });
        mockOperation = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    describe('Closed State', () => {
        it('should execute operations successfully in closed state', async () => {
            mockOperation.mockResolvedValue('success');

            const result = await circuitBreaker.execute(mockOperation);

            expect(result).toBe('success');
            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should track successful operations', async () => {
            mockOperation.mockResolvedValue('success');

            await circuitBreaker.execute(mockOperation);
            await circuitBreaker.execute(mockOperation);

            const metrics = circuitBreaker.getMetrics();
            expect(metrics.totalRequests).toBe(2);
            expect(metrics.successfulRequests).toBe(2);
            expect(metrics.failedRequests).toBe(0);
        });

        it('should track failed operations', async () => {
            mockOperation.mockRejectedValue(new Error('Operation failed'));

            await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Operation failed');

            const metrics = circuitBreaker.getMetrics();
            expect(metrics.totalRequests).toBe(1);
            expect(metrics.successfulRequests).toBe(0);
            expect(metrics.failedRequests).toBe(1);
        });

        it('should open circuit after reaching failure threshold', async () => {
            mockOperation.mockRejectedValue(new Error('Operation failed'));

            // Fail 3 times to reach threshold
            for (let i = 0; i < 3; i++) {
                await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Operation failed');
            }

            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
        });
    });

    describe('Open State', () => {
        beforeEach(async () => {
            // Force circuit to open state
            mockOperation.mockRejectedValue(new Error('Operation failed'));
            for (let i = 0; i < 3; i++) {
                await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
            }
            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
        });

        it('should reject operations immediately in open state', async () => {
            mockOperation.mockResolvedValue('success');

            await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow(CircuitBreakerError);
            expect(mockOperation).not.toHaveBeenCalled();
        });

        it('should transition to half-open after recovery timeout', async () => {
            vi.useFakeTimers();
            mockOperation.mockResolvedValue('success');

            // Fast-forward time past recovery timeout
            vi.advanceTimersByTime(1100);

            await circuitBreaker.execute(mockOperation);

            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });
    });

    describe('Half-Open State', () => {
        beforeEach(async () => {
            vi.useFakeTimers();
            // Force circuit to open state
            mockOperation.mockRejectedValue(new Error('Operation failed'));
            for (let i = 0; i < 3; i++) {
                await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
            }

            // Transition to half-open
            vi.advanceTimersByTime(1100);
            mockOperation.mockResolvedValue('success');
            await circuitBreaker.execute(mockOperation);
            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
        });

        it('should close circuit after successful operations', async () => {
            mockOperation.mockResolvedValue('success');

            // Need 2 successes to close (successThreshold = 2)
            await circuitBreaker.execute(mockOperation);

            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
        });

        it('should reopen circuit on failure in half-open state', async () => {
            mockOperation.mockRejectedValue(new Error('Still failing'));

            await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Still failing');

            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
        });
    });

    describe('Timeout Handling', () => {
        it('should timeout long-running operations', async () => {
            vi.useFakeTimers();
            mockOperation.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));

            const executePromise = circuitBreaker.execute(mockOperation);

            // Fast-forward past timeout
            vi.advanceTimersByTime(600);

            await expect(executePromise).rejects.toThrow('Operation timed out after 500ms');

            const metrics = circuitBreaker.getMetrics();
            expect(metrics.timeouts).toBe(1);
        });

        it('should not timeout operations that complete in time', async () => {
            vi.useFakeTimers();
            mockOperation.mockImplementation(() =>
                new Promise(resolve => setTimeout(() => resolve('success'), 300))
            );

            const executePromise = circuitBreaker.execute(mockOperation);

            // Fast-forward to just before timeout
            vi.advanceTimersByTime(400);

            await expect(executePromise).resolves.toBe('success');

            const metrics = circuitBreaker.getMetrics();
            expect(metrics.timeouts).toBe(0);
        });
    });

    describe('Health Status', () => {
        it('should report healthy status when closed', () => {
            const health = circuitBreaker.getHealthStatus();

            expect(health.state).toBe(CircuitBreakerState.CLOSED);
            expect(health.healthy).toBe(true);
            expect(health.failureRate).toBe(0);
            expect(health.uptime).toBe(1);
        });

        it('should report unhealthy status when open', async () => {
            mockOperation.mockRejectedValue(new Error('Operation failed'));
            for (let i = 0; i < 3; i++) {
                await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
            }

            const health = circuitBreaker.getHealthStatus();

            expect(health.state).toBe(CircuitBreakerState.OPEN);
            expect(health.healthy).toBe(false);
            expect(health.failureRate).toBe(1);
            expect(health.uptime).toBe(0);
        });

        it('should calculate correct failure rate', async () => {
            mockOperation.mockResolvedValueOnce('success');
            mockOperation.mockRejectedValueOnce(new Error('failed'));
            mockOperation.mockResolvedValueOnce('success');

            await circuitBreaker.execute(mockOperation);
            await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
            await circuitBreaker.execute(mockOperation);

            const health = circuitBreaker.getHealthStatus();
            expect(health.failureRate).toBeCloseTo(1 / 3);
            expect(health.uptime).toBeCloseTo(2 / 3);
        });
    });

    describe('Manual Control', () => {
        it('should reset circuit breaker state', async () => {
            mockOperation.mockRejectedValue(new Error('Operation failed'));
            for (let i = 0; i < 3; i++) {
                await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
            }
            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

            circuitBreaker.reset();

            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
            const metrics = circuitBreaker.getMetrics();
            expect(metrics.totalRequests).toBe(3); // Metrics are not reset
        });

        it('should force circuit breaker open', () => {
            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);

            circuitBreaker.forceOpen();

            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
        });
    });
});

describe('CircuitBreakerFactory', () => {
    let factory: CircuitBreakerFactory;

    beforeEach(() => {
        factory = CircuitBreakerFactory.getInstance();
    });

    afterEach(() => {
        factory.resetAll();
    });

    it('should create circuit breakers with default config', () => {
        const breaker = factory.getCircuitBreaker('test-service');

        expect(breaker).toBeInstanceOf(CircuitBreaker);
        expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should create circuit breakers with custom config', () => {
        const breaker = factory.getCircuitBreaker('test-service', {
            failureThreshold: 10,
            timeout: 60000,
        });

        expect(breaker).toBeInstanceOf(CircuitBreaker);
    });

    it('should return same instance for same name', () => {
        const breaker1 = factory.getCircuitBreaker('test-service');
        const breaker2 = factory.getCircuitBreaker('test-service');

        expect(breaker1).toBe(breaker2);
    });

    it('should return different instances for different names', () => {
        const breaker1 = factory.getCircuitBreaker('service-1');
        const breaker2 = factory.getCircuitBreaker('service-2');

        expect(breaker1).not.toBe(breaker2);
    });

    it('should get all circuit breakers', () => {
        factory.getCircuitBreaker('service-1');
        factory.getCircuitBreaker('service-2');

        const allBreakers = factory.getAllCircuitBreakers();

        expect(allBreakers.size).toBe(2);
        expect(allBreakers.has('service-1')).toBe(true);
        expect(allBreakers.has('service-2')).toBe(true);
    });

    it('should get health summary for all circuit breakers', () => {
        factory.getCircuitBreaker('service-1');
        factory.getCircuitBreaker('service-2');

        const healthSummary = factory.getHealthSummary();

        expect(Object.keys(healthSummary)).toEqual(['service-1', 'service-2']);
        expect(healthSummary['service-1'].state).toBe(CircuitBreakerState.CLOSED);
        expect(healthSummary['service-2'].state).toBe(CircuitBreakerState.CLOSED);
    });

    it('should reset all circuit breakers', async () => {
        const breaker1 = factory.getCircuitBreaker('service-1', { failureThreshold: 1 });
        const breaker2 = factory.getCircuitBreaker('service-2', { failureThreshold: 1 });

        // Force both to open state
        const mockOperation = vi.fn().mockRejectedValue(new Error('failed'));
        await expect(breaker1.execute(mockOperation)).rejects.toThrow();
        await expect(breaker2.execute(mockOperation)).rejects.toThrow();

        expect(breaker1.getState()).toBe(CircuitBreakerState.OPEN);
        expect(breaker2.getState()).toBe(CircuitBreakerState.OPEN);

        factory.resetAll();

        expect(breaker1.getState()).toBe(CircuitBreakerState.CLOSED);
        expect(breaker2.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should be a singleton', () => {
        const factory1 = CircuitBreakerFactory.getInstance();
        const factory2 = CircuitBreakerFactory.getInstance();

        expect(factory1).toBe(factory2);
    });
});

describe('CircuitBreakerError', () => {
    it('should create CircuitBreakerError with correct properties', () => {
        const error = new CircuitBreakerError('Circuit is open', CircuitBreakerState.OPEN);

        expect(error.name).toBe('CircuitBreakerError');
        expect(error.message).toBe('Circuit is open');
        expect(error.state).toBe(CircuitBreakerState.OPEN);
    });
});

describe('Integration with circuitBreakerFactory singleton', () => {
    it('should use the exported singleton instance', () => {
        const breaker1 = circuitBreakerFactory.getCircuitBreaker('test');
        const breaker2 = circuitBreakerFactory.getCircuitBreaker('test');

        expect(breaker1).toBe(breaker2);
    });
});