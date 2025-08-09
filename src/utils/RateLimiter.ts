import { RateLimitError } from './ErrorHandler';
import { logger } from './Logger';

export interface RateLimitConfig {
    windowMs: number; // Time window in milliseconds
    maxRequests: number; // Maximum requests per window
    skipSuccessfulRequests?: boolean; // Don't count successful requests
    skipFailedRequests?: boolean; // Don't count failed requests
    keyGenerator?: (userId: string, action: string) => string;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
}

interface RateLimitEntry {
    count: number;
    resetTime: number;
    firstRequest: number;
}

export class RateLimiter {
    private store: Map<string, RateLimitEntry> = new Map();
    private cleanupInterval: NodeJS.Timeout;

    constructor(private config: RateLimitConfig) {
        // Clean up expired entries every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000);
    }

    /**
     * Check if a request is allowed under rate limiting rules
     */
    async checkLimit(userId: string, action: string): Promise<RateLimitResult> {
        const key = this.config.keyGenerator
            ? this.config.keyGenerator(userId, action)
            : `${userId}:${action}`;

        const now = Date.now();
        const entry = this.store.get(key);

        if (!entry) {
            // First request for this key
            this.store.set(key, {
                count: 1,
                resetTime: now + this.config.windowMs,
                firstRequest: now,
            });

            return {
                allowed: true,
                remaining: this.config.maxRequests - 1,
                resetTime: now + this.config.windowMs,
            };
        }

        // Check if the window has expired
        if (now >= entry.resetTime) {
            // Reset the window
            this.store.set(key, {
                count: 1,
                resetTime: now + this.config.windowMs,
                firstRequest: now,
            });

            return {
                allowed: true,
                remaining: this.config.maxRequests - 1,
                resetTime: now + this.config.windowMs,
            };
        }

        // Check if limit is exceeded
        if (entry.count >= this.config.maxRequests) {
            const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

            logger.warn('Rate limit exceeded', {
                userId,
                action,
                count: entry.count,
                maxRequests: this.config.maxRequests,
                retryAfter,
            });

            return {
                allowed: false,
                remaining: 0,
                resetTime: entry.resetTime,
                retryAfter,
            };
        }

        // Increment counter
        entry.count++;
        this.store.set(key, entry);

        return {
            allowed: true,
            remaining: this.config.maxRequests - entry.count,
            resetTime: entry.resetTime,
        };
    }

    /**
     * Record a successful request (if configured to skip successful requests)
     */
    async recordSuccess(userId: string, action: string): Promise<void> {
        if (this.config.skipSuccessfulRequests) {
            const key = this.config.keyGenerator
                ? this.config.keyGenerator(userId, action)
                : `${userId}:${action}`;

            const entry = this.store.get(key);
            if (entry && entry.count > 0) {
                entry.count--;
                this.store.set(key, entry);
            }
        }
    }

    /**
     * Record a failed request (if configured to skip failed requests)
     */
    async recordFailure(userId: string, action: string): Promise<void> {
        if (this.config.skipFailedRequests) {
            const key = this.config.keyGenerator
                ? this.config.keyGenerator(userId, action)
                : `${userId}:${action}`;

            const entry = this.store.get(key);
            if (entry && entry.count > 0) {
                entry.count--;
                this.store.set(key, entry);
            }
        }
    }

    /**
     * Get current rate limit status for a user/action
     */
    async getStatus(userId: string, action: string): Promise<RateLimitResult> {
        const key = this.config.keyGenerator
            ? this.config.keyGenerator(userId, action)
            : `${userId}:${action}`;

        const now = Date.now();
        const entry = this.store.get(key);

        if (!entry || now >= entry.resetTime) {
            return {
                allowed: true,
                remaining: this.config.maxRequests,
                resetTime: now + this.config.windowMs,
            };
        }

        return {
            allowed: entry.count < this.config.maxRequests,
            remaining: Math.max(0, this.config.maxRequests - entry.count),
            resetTime: entry.resetTime,
            retryAfter: entry.count >= this.config.maxRequests
                ? Math.ceil((entry.resetTime - now) / 1000)
                : undefined,
        };
    }

    /**
     * Reset rate limit for a specific user/action
     */
    async reset(userId: string, action: string): Promise<void> {
        const key = this.config.keyGenerator
            ? this.config.keyGenerator(userId, action)
            : `${userId}:${action}`;

        this.store.delete(key);

        logger.info('Rate limit reset', { userId, action });
    }

    /**
     * Clean up expired entries
     */
    private cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.store.entries()) {
            if (now >= entry.resetTime) {
                this.store.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
        }
    }

    /**
     * Destroy the rate limiter and clean up resources
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.store.clear();
    }
}

// Pre-configured rate limiters for different actions
export class PaymentRateLimiters {
    private static instance: PaymentRateLimiters;

    private paymentLimiter: RateLimiter;
    private requestLimiter: RateLimiter;
    private setupLimiter: RateLimiter;
    private transactionQueryLimiter: RateLimiter;

    private constructor() {
        // Payment commands: 10 per hour
        this.paymentLimiter = new RateLimiter({
            windowMs: 60 * 60 * 1000, // 1 hour
            maxRequests: 10,
            skipFailedRequests: true, // Don't count failed payments against limit
        });

        // Payment requests: 20 per hour
        this.requestLimiter = new RateLimiter({
            windowMs: 60 * 60 * 1000, // 1 hour
            maxRequests: 20,
        });

        // Setup commands: 5 per hour (to prevent spam)
        this.setupLimiter = new RateLimiter({
            windowMs: 60 * 60 * 1000, // 1 hour
            maxRequests: 5,
        });

        // Transaction queries: 100 per hour
        this.transactionQueryLimiter = new RateLimiter({
            windowMs: 60 * 60 * 1000, // 1 hour
            maxRequests: 100,
            skipSuccessfulRequests: true, // Don't count successful queries
        });
    }

    public static getInstance(): PaymentRateLimiters {
        if (!PaymentRateLimiters.instance) {
            PaymentRateLimiters.instance = new PaymentRateLimiters();
        }
        return PaymentRateLimiters.instance;
    }

    async checkPaymentLimit(userId: string): Promise<void> {
        const result = await this.paymentLimiter.checkLimit(userId, 'payment');
        if (!result.allowed) {
            throw new RateLimitError(
                'Payment rate limit exceeded',
                'PAYMENT_RATE_LIMIT',
                result.retryAfter,
                `You can make another payment in ${result.retryAfter} seconds.`
            );
        }
    }

    async checkRequestLimit(userId: string): Promise<void> {
        const result = await this.requestLimiter.checkLimit(userId, 'request');
        if (!result.allowed) {
            throw new RateLimitError(
                'Payment request rate limit exceeded',
                'REQUEST_RATE_LIMIT',
                result.retryAfter,
                `You can make another payment request in ${result.retryAfter} seconds.`
            );
        }
    }

    async checkSetupLimit(userId: string): Promise<void> {
        const result = await this.setupLimiter.checkLimit(userId, 'setup');
        if (!result.allowed) {
            throw new RateLimitError(
                'Setup rate limit exceeded',
                'SETUP_RATE_LIMIT',
                result.retryAfter,
                `You can run setup again in ${result.retryAfter} seconds.`
            );
        }
    }

    async checkTransactionQueryLimit(userId: string): Promise<void> {
        const result = await this.transactionQueryLimiter.checkLimit(userId, 'query');
        if (!result.allowed) {
            throw new RateLimitError(
                'Transaction query rate limit exceeded',
                'QUERY_RATE_LIMIT',
                result.retryAfter,
                `You can query transactions again in ${result.retryAfter} seconds.`
            );
        }
    }

    /**
     * Check DM rate limit
     */
    async checkDMLimit(userId: string): Promise<void> {
        const result = await this.setupLimiter.checkLimit(userId, 'dm');
        if (!result.allowed) {
            throw new RateLimitError(
                'DM rate limit exceeded',
                'DM_RATE_LIMIT',
                result.retryAfter,
                `You can send DMs again in ${result.retryAfter} seconds.`
            );
        }
    }

    async recordPaymentSuccess(userId: string): Promise<void> {
        await this.paymentLimiter.recordSuccess(userId, 'payment');
    }

    async recordPaymentFailure(userId: string): Promise<void> {
        await this.paymentLimiter.recordFailure(userId, 'payment');
    }

    async recordQuerySuccess(userId: string): Promise<void> {
        await this.transactionQueryLimiter.recordSuccess(userId, 'query');
    }

    async resetUserLimits(userId: string): Promise<void> {
        await Promise.all([
            this.paymentLimiter.reset(userId, 'payment'),
            this.requestLimiter.reset(userId, 'request'),
            this.setupLimiter.reset(userId, 'setup'),
            this.transactionQueryLimiter.reset(userId, 'query'),
        ]);
    }

    destroy(): void {
        this.paymentLimiter.destroy();
        this.requestLimiter.destroy();
        this.setupLimiter.destroy();
        this.transactionQueryLimiter.destroy();
    }
}

export const rateLimiters = PaymentRateLimiters.getInstance();