import { logger } from './Logger';
import getPrismaClient from '../models/database';

export enum AuditEventType {
    // Authentication & Authorization
    USER_LOGIN = 'USER_LOGIN',
    USER_LOGOUT = 'USER_LOGOUT',
    PERMISSION_DENIED = 'PERMISSION_DENIED',

    // Payment Operations
    PAYMENT_INITIATED = 'PAYMENT_INITIATED',
    PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
    PAYMENT_FAILED = 'PAYMENT_FAILED',
    PAYMENT_CANCELLED = 'PAYMENT_CANCELLED',

    // Payment Requests
    PAYMENT_REQUEST_CREATED = 'PAYMENT_REQUEST_CREATED',
    PAYMENT_REQUEST_APPROVED = 'PAYMENT_REQUEST_APPROVED',
    PAYMENT_REQUEST_DECLINED = 'PAYMENT_REQUEST_DECLINED',
    PAYMENT_REQUEST_EXPIRED = 'PAYMENT_REQUEST_EXPIRED',

    // Account Management
    PAYMENT_METHOD_ADDED = 'PAYMENT_METHOD_ADDED',
    PAYMENT_METHOD_REMOVED = 'PAYMENT_METHOD_REMOVED',
    PAYMENT_METHOD_UPDATED = 'PAYMENT_METHOD_UPDATED',
    ACCOUNT_SETUP_STARTED = 'ACCOUNT_SETUP_STARTED',
    ACCOUNT_SETUP_COMPLETED = 'ACCOUNT_SETUP_COMPLETED',
    ACCOUNT_SETUP_CHOICE_MADE = 'ACCOUNT_SETUP_CHOICE_MADE',
    ACCOUNT_SETUP_FORM_SUBMITTED = 'ACCOUNT_SETUP_FORM_SUBMITTED',

    // DM Operations
    DM_RECEIVED = 'DM_RECEIVED',
    SETUP_PENDING_STORED = 'SETUP_PENDING_STORED',
    SETUP_DELIVERED = 'SETUP_DELIVERED',
    SETUP_DELIVERY_FAILED = 'SETUP_DELIVERY_FAILED',
    SETUP_EXPIRED = 'SETUP_EXPIRED',

    // Escrow Operations
    FUNDS_ESCROWED = 'FUNDS_ESCROWED',
    FUNDS_RELEASED = 'FUNDS_RELEASED',
    FUNDS_RETURNED = 'FUNDS_RETURNED',
    ESCROW_TIMEOUT = 'ESCROW_TIMEOUT',

    // Administrative Actions
    SERVER_CONFIG_UPDATED = 'SERVER_CONFIG_UPDATED',
    USER_LIMITS_CHANGED = 'USER_LIMITS_CHANGED',
    PAYMENT_METHODS_RESTRICTED = 'PAYMENT_METHODS_RESTRICTED',
    ADMIN_OVERRIDE = 'ADMIN_OVERRIDE',

    // Security Events
    SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    INVALID_INPUT_DETECTED = 'INVALID_INPUT_DETECTED',
    ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',
    DATA_ACCESS_VIOLATION = 'DATA_ACCESS_VIOLATION',

    // System Events
    SYSTEM_STARTUP = 'SYSTEM_STARTUP',
    SYSTEM_SHUTDOWN = 'SYSTEM_SHUTDOWN',
    DATABASE_ERROR = 'DATABASE_ERROR',
    EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
}

export enum AuditSeverity {
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    CRITICAL = 'CRITICAL',
}

export interface AuditEvent {
    id?: string;
    eventType: AuditEventType;
    severity: AuditSeverity;
    userId?: string;
    serverId?: string;
    transactionId?: string;
    paymentMethodId?: string;
    ipAddress?: string;
    userAgent?: string;
    details: Record<string, any>;
    timestamp: Date;
    sessionId?: string;
}

export interface AuditQuery {
    eventTypes?: AuditEventType[];
    severity?: AuditSeverity[];
    userId?: string;
    serverId?: string;
    transactionId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}

export class AuditLogger {
    private static instance: AuditLogger;
    private prisma = getPrismaClient();

    private constructor() { }

    public static getInstance(): AuditLogger {
        if (!AuditLogger.instance) {
            AuditLogger.instance = new AuditLogger();
        }
        return AuditLogger.instance;
    }

    /**
     * Log an audit event
     */
    async logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
        const auditEvent: AuditEvent = {
            ...event,
            timestamp: new Date(),
        };

        try {
            // Log to structured logger for immediate visibility
            logger.info('AUDIT_EVENT', {
                eventType: auditEvent.eventType,
                severity: auditEvent.severity,
                userId: auditEvent.userId,
                serverId: auditEvent.serverId,
                transactionId: auditEvent.transactionId,
                details: auditEvent.details,
            });

            // Store in database for long-term retention and querying
            await this.storeAuditEvent(auditEvent);

            // Handle critical events immediately
            if (auditEvent.severity === AuditSeverity.CRITICAL) {
                await this.handleCriticalEvent(auditEvent);
            }
        } catch (error) {
            // Audit logging should never fail the main operation
            logger.error('Failed to log audit event', {
                eventType: auditEvent.eventType,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Log payment-related events
     */
    async logPaymentEvent(
        eventType: AuditEventType,
        userId: string,
        transactionId: string,
        details: Record<string, any>,
        severity: AuditSeverity = AuditSeverity.INFO
    ): Promise<void> {
        await this.logEvent({
            eventType,
            severity,
            userId,
            transactionId,
            details: {
                ...details,
                category: 'payment',
            },
        });
    }

    /**
     * Log security-related events
     */
    async logSecurityEvent(
        eventType: AuditEventType,
        userId: string | undefined,
        details: Record<string, any>,
        severity: AuditSeverity = AuditSeverity.WARNING,
        ipAddress?: string,
        userAgent?: string
    ): Promise<void> {
        await this.logEvent({
            eventType,
            severity,
            userId,
            ipAddress,
            userAgent,
            details: {
                ...details,
                category: 'security',
            },
        });
    }

    /**
     * Log administrative actions
     */
    async logAdminEvent(
        eventType: AuditEventType,
        adminUserId: string,
        serverId: string,
        details: Record<string, any>,
        severity: AuditSeverity = AuditSeverity.INFO
    ): Promise<void> {
        await this.logEvent({
            eventType,
            severity,
            userId: adminUserId,
            serverId,
            details: {
                ...details,
                category: 'admin',
            },
        });
    }

    /**
     * Log system events
     */
    async logSystemEvent(
        eventType: AuditEventType,
        details: Record<string, any>,
        severity: AuditSeverity = AuditSeverity.INFO
    ): Promise<void> {
        await this.logEvent({
            eventType,
            severity,
            details: {
                ...details,
                category: 'system',
            },
        });
    }

    /**
     * Query audit events
     */
    async queryEvents(query: AuditQuery): Promise<AuditEvent[]> {
        try {
            // This would be implemented with actual database queries
            // For now, return empty array as placeholder
            return [];
        } catch (error) {
            logger.error('Failed to query audit events', {
                query,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Get audit events for a specific user
     */
    async getUserAuditTrail(
        userId: string,
        eventTypes?: AuditEventType[],
        limit: number = 100
    ): Promise<AuditEvent[]> {
        return this.queryEvents({
            userId,
            eventTypes,
            limit,
        });
    }

    /**
     * Get audit events for a specific transaction
     */
    async getTransactionAuditTrail(transactionId: string): Promise<AuditEvent[]> {
        return this.queryEvents({
            transactionId,
            eventTypes: [
                AuditEventType.PAYMENT_INITIATED,
                AuditEventType.PAYMENT_COMPLETED,
                AuditEventType.PAYMENT_FAILED,
                AuditEventType.PAYMENT_CANCELLED,
                AuditEventType.FUNDS_ESCROWED,
                AuditEventType.FUNDS_RELEASED,
                AuditEventType.FUNDS_RETURNED,
            ],
        });
    }

    /**
     * Get security events within a time range
     */
    async getSecurityEvents(
        startDate: Date,
        endDate: Date,
        severity?: AuditSeverity[]
    ): Promise<AuditEvent[]> {
        return this.queryEvents({
            eventTypes: [
                AuditEventType.SUSPICIOUS_ACTIVITY,
                AuditEventType.RATE_LIMIT_EXCEEDED,
                AuditEventType.INVALID_INPUT_DETECTED,
                AuditEventType.PERMISSION_DENIED,
                AuditEventType.DATA_ACCESS_VIOLATION,
            ],
            startDate,
            endDate,
            severity,
        });
    }

    /**
     * Store audit event in database
     */
    private async storeAuditEvent(event: AuditEvent): Promise<void> {
        // This would store the event in a dedicated audit table
        // For now, we'll just log it as a placeholder
        logger.debug('Storing audit event', {
            eventType: event.eventType,
            userId: event.userId,
            transactionId: event.transactionId,
        });
    }

    /**
     * Handle critical audit events
     */
    private async handleCriticalEvent(event: AuditEvent): Promise<void> {
        logger.error('CRITICAL AUDIT EVENT', {
            eventType: event.eventType,
            userId: event.userId,
            details: event.details,
        });

        // In production, this would:
        // 1. Send immediate alerts to administrators
        // 2. Trigger automated security responses
        // 3. Create incident tickets
        // 4. Potentially disable affected accounts temporarily

        if (process.env.NODE_ENV === 'production') {
            // TODO: Implement critical event handling
            // await this.sendCriticalAlert(event);
            // await this.triggerSecurityResponse(event);
        }
    }

    /**
     * Clean up old audit events (for data retention compliance)
     */
    async cleanupOldEvents(retentionDays: number = 365): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        try {
            // This would delete old audit events from the database
            // Return the number of deleted records
            logger.info('Audit cleanup completed', {
                cutoffDate,
                retentionDays,
            });

            return 0; // Placeholder
        } catch (error) {
            logger.error('Failed to cleanup old audit events', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }
}

// Convenience functions for common audit operations
export const auditLogger = AuditLogger.getInstance();

export const logPaymentInitiated = (userId: string, transactionId: string, amount: number, currency: string) =>
    auditLogger.logPaymentEvent(AuditEventType.PAYMENT_INITIATED, userId, transactionId, {
        amount,
        currency,
    });

export const logPaymentCompleted = (userId: string, transactionId: string, amount: number, currency: string) =>
    auditLogger.logPaymentEvent(AuditEventType.PAYMENT_COMPLETED, userId, transactionId, {
        amount,
        currency,
    });

export const logPaymentFailed = (userId: string, transactionId: string, reason: string) =>
    auditLogger.logPaymentEvent(AuditEventType.PAYMENT_FAILED, userId, transactionId, {
        reason,
    }, AuditSeverity.WARNING);

export const logSuspiciousActivity = (userId: string | undefined, activity: string, details: Record<string, any>) =>
    auditLogger.logSecurityEvent(AuditEventType.SUSPICIOUS_ACTIVITY, userId, {
        activity,
        ...details,
    }, AuditSeverity.WARNING);

export const logRateLimitExceeded = (userId: string, action: string, limit: number) =>
    auditLogger.logSecurityEvent(AuditEventType.RATE_LIMIT_EXCEEDED, userId, {
        action,
        limit,
    }, AuditSeverity.WARNING);

export const logInvalidInput = (userId: string | undefined, input: string, validation: string) =>
    auditLogger.logSecurityEvent(AuditEventType.INVALID_INPUT_DETECTED, userId, {
        input: input.substring(0, 100), // Truncate for security
        validation,
    }, AuditSeverity.WARNING);