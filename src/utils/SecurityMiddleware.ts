import { CommandInteraction, ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction } from 'discord.js';
import { InputValidator } from './InputValidator';
import { rateLimiters } from './RateLimiter';
import { auditLogger, AuditEventType, AuditSeverity, logInvalidInput, logRateLimitExceeded } from './AuditLogger';
import { errorHandler, ValidationError, RateLimitError, SecurityError } from './ErrorHandler';
import { logger } from './Logger';
import { ServerConfigService, ServerConfigServiceImpl } from '../services/ServerConfigService';
import { TransactionManagementService } from '../services/payment/TransactionManagementService';
import { TransactionStatus } from '../models/Transaction';

export type DiscordInteraction = CommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

export interface SecurityContext {
    userId: string;
    serverId?: string;
    command?: string;
    action?: string;
    ipAddress?: string;
    userAgent?: string;
}

export class SecurityMiddleware {
    private static instance: SecurityMiddleware;
    private serverConfigService: ServerConfigService;
    private transactionService: TransactionManagementService;

    private constructor() {
        this.serverConfigService = new ServerConfigServiceImpl();
        this.transactionService = new TransactionManagementService();
    }

    public static getInstance(): SecurityMiddleware {
        if (!SecurityMiddleware.instance) {
            SecurityMiddleware.instance = new SecurityMiddleware();
        }
        return SecurityMiddleware.instance;
    }

    /**
     * Comprehensive security check for Discord interactions
     */
    async validateInteraction(
        interaction: DiscordInteraction,
        context: SecurityContext
    ): Promise<{ isValid: boolean; sanitizedData?: any; errors?: string[] }> {
        try {
            // 1. Validate user ID format
            const userIdValidation = InputValidator.validateDiscordId(context.userId);
            if (!userIdValidation.isValid) {
                await logInvalidInput(context.userId, context.userId, 'Invalid user ID format');
                throw new ValidationError(
                    'Invalid user ID',
                    'INVALID_USER_ID',
                    'Authentication failed',
                    { userId: context.userId }
                );
            }

            // 2. Rate limiting check
            await this.checkRateLimits(context);

            // 3. Input validation and sanitization
            const sanitizedData = await this.validateAndSanitizeInputs(interaction, context);

            // 4. Log successful validation
            await auditLogger.logEvent({
                eventType: AuditEventType.USER_LOGIN,
                severity: AuditSeverity.INFO,
                userId: context.userId,
                serverId: context.serverId,
                details: {
                    command: context.command,
                    action: context.action,
                    validationPassed: true,
                },
            });

            return {
                isValid: true,
                sanitizedData,
            };

        } catch (error) {
            // Handle and log security violations
            await this.handleSecurityViolation(error as Error, context);

            return {
                isValid: false,
                errors: [error instanceof Error ? error.message : 'Security validation failed'],
            };
        }
    }

    /**
     * Check rate limits for different actions
     */
    private async checkRateLimits(context: SecurityContext): Promise<void> {
        try {
            switch (context.action) {
                case 'payment':
                    await rateLimiters.checkPaymentLimit(context.userId);
                    break;
                case 'request':
                    await rateLimiters.checkRequestLimit(context.userId);
                    break;
                case 'setup':
                    await rateLimiters.checkSetupLimit(context.userId);
                    break;
                case 'query':
                    await rateLimiters.checkTransactionQueryLimit(context.userId);
                    break;
                default:
                    // Default rate limiting for unknown actions
                    break;
            }
        } catch (error) {
            if (error instanceof RateLimitError) {
                await logRateLimitExceeded(context.userId, context.action || 'unknown', 0);
                throw error;
            }
            throw error;
        }
    }

    /**
     * Validate and sanitize all inputs from the interaction
     */
    private async validateAndSanitizeInputs(
        interaction: DiscordInteraction,
        context: SecurityContext
    ): Promise<any> {
        const sanitizedData: any = {};

        if ('options' in interaction && interaction.options) {
            // Handle command interactions
            const commandData = this.extractCommandData(interaction as CommandInteraction);
            const validationResult = InputValidator.validateCommandParams(commandData);

            if (!validationResult.isValid) {
                await logInvalidInput(
                    context.userId,
                    JSON.stringify(commandData).substring(0, 100),
                    validationResult.errors.join(', ')
                );
                throw new ValidationError(
                    'Invalid command parameters',
                    'INVALID_COMMAND_PARAMS',
                    'Invalid input provided',
                    { errors: validationResult.errors }
                );
            }

            sanitizedData.command = validationResult.sanitizedValue;
        }

        if ('customId' in interaction && interaction.customId) {
            // Handle button/select menu interactions
            const customIdValidation = this.validateCustomId(interaction.customId);
            if (!customIdValidation.isValid) {
                await logInvalidInput(
                    context.userId,
                    interaction.customId,
                    'Invalid custom ID format'
                );
                throw new ValidationError(
                    'Invalid interaction ID',
                    'INVALID_CUSTOM_ID',
                    'Invalid interaction',
                    { customId: interaction.customId }
                );
            }

            sanitizedData.customId = customIdValidation.sanitizedValue;
        }

        if ('fields' in interaction && interaction.fields) {
            // Handle modal submissions
            const modalData = this.extractModalData(interaction as ModalSubmitInteraction);
            const validationResult = InputValidator.validateCommandParams(modalData);

            if (!validationResult.isValid) {
                await logInvalidInput(
                    context.userId,
                    JSON.stringify(modalData).substring(0, 100),
                    validationResult.errors.join(', ')
                );
                throw new ValidationError(
                    'Invalid modal data',
                    'INVALID_MODAL_DATA',
                    'Invalid form data provided',
                    { errors: validationResult.errors }
                );
            }

            sanitizedData.modal = validationResult.sanitizedValue;
        }

        return sanitizedData;
    }

    /**
     * Extract command data for validation
     */
    private extractCommandData(interaction: CommandInteraction): Record<string, any> {
        const data: Record<string, any> = {};

        // Extract common command options - check if options exist first
        if ('options' in interaction && interaction.options) {
            const recipient = (interaction.options as any).getUser('recipient');
            if (recipient) {
                data.recipientId = recipient.id;
            }

            const amount = (interaction.options as any).getNumber('amount');
            if (amount !== null) {
                data.amount = amount;
            }

            const description = (interaction.options as any).getString('description');
            if (description) {
                data.description = description;
            }

            const currency = (interaction.options as any).getString('currency');
            if (currency) {
                data.currency = currency;
            }
        }

        return data;
    }

    /**
     * Extract modal data for validation
     */
    private extractModalData(interaction: ModalSubmitInteraction): Record<string, any> {
        const data: Record<string, any> = {};

        // Extract all text input values
        interaction.fields.fields.forEach((field, key) => {
            if (field.value) {
                data[key] = field.value;
            }
        });

        return data;
    }

    /**
     * Validate custom ID format
     */
    private validateCustomId(customId: string): { isValid: boolean; sanitizedValue?: string; errors: string[] } {
        const errors: string[] = [];

        if (!customId || typeof customId !== 'string') {
            errors.push('Custom ID is required');
        } else if (customId.length > 100) {
            errors.push('Custom ID too long');
        } else if (!/^[a-zA-Z0-9_-]+$/.test(customId)) {
            errors.push('Custom ID contains invalid characters');
        }

        return {
            isValid: errors.length === 0,
            sanitizedValue: errors.length === 0 ? customId : undefined,
            errors,
        };
    }

    /**
     * Handle security violations
     */
    private async handleSecurityViolation(error: Error, context: SecurityContext): Promise<void> {
        // Determine severity based on error type
        let severity = AuditSeverity.WARNING;
        let eventType = AuditEventType.INVALID_INPUT_DETECTED;

        if (error instanceof RateLimitError) {
            eventType = AuditEventType.RATE_LIMIT_EXCEEDED;
            severity = AuditSeverity.WARNING;
        } else if (error instanceof ValidationError) {
            eventType = AuditEventType.INVALID_INPUT_DETECTED;
            severity = AuditSeverity.WARNING;
        } else if (error instanceof SecurityError) {
            eventType = AuditEventType.SUSPICIOUS_ACTIVITY;
            severity = AuditSeverity.CRITICAL;
        }

        // Log the security violation
        await auditLogger.logEvent({
            eventType,
            severity,
            userId: context.userId,
            serverId: context.serverId,
            details: {
                error: error.message,
                command: context.command,
                action: context.action,
                errorType: error.constructor.name,
                ipAddress: context.ipAddress,
                userAgent: context.userAgent,
            },
        });

        // Handle critical violations
        if (severity === AuditSeverity.CRITICAL) {
            await this.handleCriticalViolation(error, context);
        }
    }

    /**
     * Handle critical security violations
     */
    private async handleCriticalViolation(error: Error, context: SecurityContext): Promise<void> {
        // Log critical violation
        await auditLogger.logEvent({
            eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
            severity: AuditSeverity.CRITICAL,
            userId: context.userId,
            serverId: context.serverId,
            details: {
                criticalViolation: true,
                error: error.message,
                command: context.command,
                action: context.action,
                timestamp: new Date().toISOString(),
            },
        });

        // In production, this could:
        // 1. Temporarily disable the user account
        // 2. Send alerts to administrators
        // 3. Trigger additional security measures
        // 4. Create incident reports
    }

    /**
     * Record successful operation for rate limiting
     */
    async recordSuccess(context: SecurityContext): Promise<void> {
        try {
            switch (context.action) {
                case 'payment':
                    await rateLimiters.recordPaymentSuccess(context.userId);
                    break;
                case 'query':
                    await rateLimiters.recordQuerySuccess(context.userId);
                    break;
                default:
                    // No specific success recording needed
                    break;
            }
        } catch (error) {
            // Don't throw errors for success recording failures
            console.warn('Failed to record success:', error);
        }
    }

    /**
     * Record failed operation for rate limiting
     */
    async recordFailure(context: SecurityContext): Promise<void> {
        try {
            switch (context.action) {
                case 'payment':
                    await rateLimiters.recordPaymentFailure(context.userId);
                    break;
                default:
                    // No specific failure recording needed
                    break;
            }
        } catch (error) {
            // Don't throw errors for failure recording
            console.warn('Failed to record failure:', error);
        }
    }

    /**
     * Check if user has access to another user's resources
     */
    async checkUserAccess(requestingUserId: string, targetUserId: string): Promise<{ allowed: boolean; reason?: string }> {
        // Users can only access their own resources
        if (requestingUserId === targetUserId) {
            return { allowed: true };
        }

        // Log unauthorized access attempt
        await auditLogger.logEvent({
            eventType: AuditEventType.PERMISSION_DENIED,
            severity: AuditSeverity.WARNING,
            userId: requestingUserId,
            details: {
                targetUserId,
                action: 'user_access',
                denied: true,
            },
        });

        return {
            allowed: false,
            reason: 'Users can only access their own resources - unauthorized access attempt logged'
        };
    }

    /**
     * Check if user has admin access to a server
     */
    async checkAdminAccess(userId: string, serverId: string): Promise<{ allowed: boolean; reason?: string }> {
        try {
            // Get server configuration
            const serverConfig = await this.serverConfigService.getServerConfig(serverId);
            if (!serverConfig) {
                return { allowed: false, reason: 'Server not configured' };
            }

            // Check if user is in admin list
            const adminUserIds = serverConfig.adminUserIds;
            const isAdmin = adminUserIds.includes(userId);

            if (!isAdmin) {
                // Log unauthorized access attempt
                await auditLogger.logEvent({
                    eventType: AuditEventType.PERMISSION_DENIED,
                    severity: AuditSeverity.WARNING,
                    userId,
                    serverId,
                    details: {
                        action: 'admin_access_check',
                        reason: 'User not in admin list',
                    },
                });

                return { allowed: false, reason: 'Insufficient permissions' };
            }

            return { allowed: true };
        } catch (error) {
            logger.error('Error checking admin access', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId,
                serverId,
            });

            return { allowed: false, reason: 'System error' };
        }
    }

    /**
     * Check if user can access a specific transaction
     */
    async checkTransactionAccess(
        userId: string,
        transactionId: string,
        action: 'view' | 'modify' | 'cancel'
    ): Promise<{ allowed: boolean; reason?: string }> {
        try {
            // Get transaction details
            const transaction = await this.transactionService.getTransaction(transactionId);
            if (!transaction) {
                return { allowed: false, reason: 'Transaction not found' };
            }

            // Check if user is involved in the transaction
            const isInvolved = transaction.senderId === userId || transaction.recipientId === userId;
            if (!isInvolved) {
                // Log unauthorized access attempt
                await auditLogger.logEvent({
                    eventType: AuditEventType.PERMISSION_DENIED,
                    severity: AuditSeverity.WARNING,
                    userId,
                    details: {
                        transactionId,
                        action,
                        denied: true,
                        reason: 'not_participant',
                    },
                });

                return { allowed: false, reason: 'Not involved in transaction' };
            }

            // Check transaction status for specific actions
            if (action === 'cancel' && transaction.status === TransactionStatus.COMPLETED) {
                return { allowed: false, reason: 'Cannot cancel completed transaction' };
            }

            return { allowed: true };
        } catch (error) {
            logger.error('Error checking transaction access', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId,
                transactionId,
                action,
            });

            return { allowed: false, reason: 'System error' };
        }
    }

    /**
     * Create security context from interaction
     */
    static createSecurityContext(
        interaction: DiscordInteraction,
        action?: string
    ): SecurityContext {
        return {
            userId: interaction.user.id,
            serverId: interaction.guildId || undefined,
            command: 'commandName' in interaction ? interaction.commandName : undefined,
            action,
            // In a real implementation, you might extract IP and user agent from headers
            ipAddress: undefined,
            userAgent: undefined,
        };
    }
}

// Export singleton instance
export const securityMiddleware = SecurityMiddleware.getInstance();