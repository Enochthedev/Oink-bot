import { logger, LogLevel } from './Logger';

export enum CircuitBreakerState {
    CLOSED = 'CLOSED',     // Normal operation
    OPEN = 'OPEN',         // Circuit is open, calls are failing
    HALF_OPEN = 'HALF_OPEN' // Testing if service has recovered
}

export interface CircuitBreakerConfig {
    failureThreshold: number;    // Number of failures before opening circuit
    recoveryTimeout: number;     // Time in ms before attempting recovery
    monitoringPeriod: number;    // Time window for failure counting
    successThreshold: number;    // Successes needed in half-open state to close circuit
    timeout: number;             // Request timeout in ms
}

export interface CircuitBreakerMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    timeouts: number;
    circuitOpenCount: number;
    lastFailureTime?: Date;
    lastSuccessTime?: Date;
}

export class CircuitBreakerError extends Error {
    constructor(message: string, public readonly state: CircuitBreakerState) {
        super(message);
        this.name = 'CircuitBreakerError';
    }
}

export class CircuitBreaker<T = unknown> {
    private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
    private failureCount = 0;
    private successCount = 0;
    private lastFailureTime?: Date;
    private nextAttemptTime?: Date;
    private metrics: CircuitBreakerMetrics;

    constructor(
        private readonly name: string,
        private readonly config: CircuitBreakerConfig
    ) {
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            timeouts: 0,
            circuitOpenCount: 0,
        };

        logger.info(`Circuit breaker initialized: ${name}`, {
            config: this.config,
        });
    }

    public async execute<R>(operation: () => Promise<R>): Promise<R> {
        this.metrics.totalRequests++;

        // Check if circuit should be opened or if we can attempt a call
        if (this.state === CircuitBreakerState.OPEN) {
            if (this.shouldAttemptReset()) {
                this.state = CircuitBreakerState.HALF_OPEN;
                this.successCount = 0;
                logger.info(`Circuit breaker transitioning to HALF_OPEN: ${this.name}`);
            } else {
                this.metrics.failedRequests++;
                throw new CircuitBreakerError(
                    `Circuit breaker is OPEN for ${this.name}. Next attempt at ${this.nextAttemptTime?.toISOString()}`,
                    this.state
                );
            }
        }

        try {
            // Execute the operation with timeout
            const result = await this.executeWithTimeout(operation);

            // Handle success
            this.onSuccess();
            return result;
        } catch (error) {
            // Handle failure
            this.onFailure(error);
            throw error;
        }
    }

    private async executeWithTimeout<R>(operation: () => Promise<R>): Promise<R> {
        return new Promise<R>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.metrics.timeouts++;
                reject(new Error(`Operation timed out after ${this.config.timeout}ms`));
            }, this.config.timeout);

            operation()
                .then((result) => {
                    clearTimeout(timeoutId);
                    resolve(result);
                })
                .catch((error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                });
        });
    }

    private onSuccess(): void {
        this.metrics.successfulRequests++;
        this.metrics.lastSuccessTime = new Date();
        this.failureCount = 0;

        if (this.state === CircuitBreakerState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.config.successThreshold) {
                this.state = CircuitBreakerState.CLOSED;
                logger.info(`Circuit breaker closed after successful recovery: ${this.name}`);
            }
        }
    }

    private onFailure(error: unknown): void {
        this.metrics.failedRequests++;
        this.metrics.lastFailureTime = new Date();
        this.lastFailureTime = new Date();
        this.failureCount++;

        logger.logPaymentProcessor(
            LogLevel.WARN,
            `Circuit breaker failure recorded: ${this.name}`,
            this.name,
            {
                failureCount: this.failureCount,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        );

        if (this.state === CircuitBreakerState.HALF_OPEN) {
            // If we fail in half-open state, go back to open
            this.openCircuit();
        } else if (this.failureCount >= this.config.failureThreshold) {
            // If we've reached the failure threshold, open the circuit
            this.openCircuit();
        }
    }

    private openCircuit(): void {
        this.state = CircuitBreakerState.OPEN;
        this.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeout);
        this.metrics.circuitOpenCount++;

        logger.logPaymentProcessor(
            LogLevel.ERROR,
            `Circuit breaker opened: ${this.name}`,
            this.name,
            {
                failureCount: this.failureCount,
                nextAttemptTime: this.nextAttemptTime.toISOString(),
            }
        );
    }

    private shouldAttemptReset(): boolean {
        return this.nextAttemptTime ? Date.now() >= this.nextAttemptTime.getTime() : false;
    }

    // Public methods for monitoring and management
    public getState(): CircuitBreakerState {
        return this.state;
    }

    public getMetrics(): CircuitBreakerMetrics {
        return { ...this.metrics };
    }

    public getHealthStatus(): {
        state: CircuitBreakerState;
        healthy: boolean;
        failureRate: number;
        uptime: number;
    } {
        const failureRate = this.metrics.totalRequests > 0
            ? this.metrics.failedRequests / this.metrics.totalRequests
            : 0;

        return {
            state: this.state,
            healthy: this.state === CircuitBreakerState.CLOSED,
            failureRate,
            uptime: this.metrics.totalRequests > 0
                ? this.metrics.successfulRequests / this.metrics.totalRequests
                : 1,
        };
    }

    public reset(): void {
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = undefined;
        this.nextAttemptTime = undefined;

        logger.info(`Circuit breaker manually reset: ${this.name}`);
    }

    public forceOpen(): void {
        this.state = CircuitBreakerState.OPEN;
        this.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeout);

        logger.info(`Circuit breaker manually opened: ${this.name}`);
    }
}

// Circuit breaker factory for managing multiple circuit breakers
export class CircuitBreakerFactory {
    private static instance: CircuitBreakerFactory;
    private circuitBreakers: Map<string, CircuitBreaker> = new Map();

    private constructor() { }

    public static getInstance(): CircuitBreakerFactory {
        if (!CircuitBreakerFactory.instance) {
            CircuitBreakerFactory.instance = new CircuitBreakerFactory();
        }
        return CircuitBreakerFactory.instance;
    }

    public getCircuitBreaker(
        name: string,
        config?: Partial<CircuitBreakerConfig>
    ): CircuitBreaker {
        if (!this.circuitBreakers.has(name)) {
            const defaultConfig: CircuitBreakerConfig = {
                failureThreshold: 5,
                recoveryTimeout: 60000, // 1 minute
                monitoringPeriod: 300000, // 5 minutes
                successThreshold: 3,
                timeout: 30000, // 30 seconds
            };

            const finalConfig = { ...defaultConfig, ...config };
            this.circuitBreakers.set(name, new CircuitBreaker(name, finalConfig));
        }

        return this.circuitBreakers.get(name)!;
    }

    public getAllCircuitBreakers(): Map<string, CircuitBreaker> {
        return new Map(this.circuitBreakers);
    }

    public getHealthSummary(): Record<string, ReturnType<CircuitBreaker['getHealthStatus']>> {
        const summary: Record<string, ReturnType<CircuitBreaker['getHealthStatus']>> = {};

        for (const [name, breaker] of this.circuitBreakers) {
            summary[name] = breaker.getHealthStatus();
        }

        return summary;
    }

    public resetAll(): void {
        for (const breaker of this.circuitBreakers.values()) {
            breaker.reset();
        }
        logger.info('All circuit breakers reset');
    }
}

// Export singleton instance
export const circuitBreakerFactory = CircuitBreakerFactory.getInstance();