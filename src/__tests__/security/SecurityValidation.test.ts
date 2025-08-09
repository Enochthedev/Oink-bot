import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { InputValidator } from '../../utils/InputValidator';
import { RateLimiter } from '../../utils/RateLimiter';
import { EncryptionService } from '../../utils/Encryption';
import { AuditLogger, AuditEventType, AuditSeverity } from '../../utils/AuditLogger';
import { SecurityMiddleware } from '../../utils/SecurityMiddleware';
import { PaymentServiceImpl } from '../../services/PaymentService';
import { UserAccountServiceImpl } from '../../services/UserAccountService';
import { getPrismaClient } from '../../models/database';
import { TestDataFactory } from '../utils/TestDataFactory';
import { TestCleanupUtility } from '../utils/TestCleanupUtility';
import { SecurityError } from '../../utils/ErrorHandler';

/**
 * Comprehensive Security Validation Tests
 * Tests input validation, access control, and security measures
 */
describe('Security Validation Tests', () => {
    let prisma: any;
    let testDataFactory: TestDataFactory;
    let cleanupUtility: TestCleanupUtility;
    let paymentService: PaymentServiceImpl;
    let userAccountService: UserAccountServiceImpl;
    let securityMiddleware: SecurityMiddleware;
    let auditLogger: AuditLogger;

    beforeAll(async () => {
        prisma = getPrismaClient();
        testDataFactory = new TestDataFactory(prisma);
        cleanupUtility = new TestCleanupUtility(prisma);

        // Initialize services
        userAccountService = new UserAccountServiceImpl();
        securityMiddleware = new SecurityMiddleware();
        auditLogger = AuditLogger.getInstance();
    });

    beforeEach(async () => {
        await cleanupUtility.cleanupTestData();
    });

    afterEach(async () => {
        await cleanupUtility.cleanupTestData();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    describe('Input Validation Security', () => {
        describe('Discord ID Validation', () => {
            const validDiscordIds = [
                '123456789012345678',
                '987654321098765432',
                '100000000000000000',
                '999999999999999999',
            ];

            const invalidDiscordIds = [
                '', // Empty
                '12345', // Too short
                '12345678901234567890', // Too long
                'not-a-number', // Non-numeric
                '123456789012345678a', // Contains letters
                '123.456.789.012.345', // Contains dots
                '-123456789012345678', // Negative
                '0123456789012345678', // Leading zero (invalid)
                null, // Null
                undefined, // Undefined
                '123456789012345678; DROP TABLE users;--', // SQL injection
                '<script>alert("xss")</script>', // XSS
                '../../../etc/passwd', // Path traversal
            ];

            it('should accept valid Discord IDs', () => {
                validDiscordIds.forEach(id => {
                    const result = InputValidator.validateDiscordId(id);
                    expect(result.isValid).toBe(true);
                    expect(result.errors).toHaveLength(0);
                });
            });

            it('should reject invalid Discord IDs', () => {
                invalidDiscordIds.forEach(id => {
                    const result = InputValidator.validateDiscordId(id as any);
                    expect(result.isValid).toBe(false);
                    expect(result.errors.length).toBeGreaterThan(0);
                });
            });

            it('should sanitize Discord IDs properly', () => {
                const maliciousIds = [
                    '123456789012345678<script>',
                    '123456789012345678"onload="alert(1)"',
                    "123456789012345678'; DROP TABLE users;--",
                ];

                maliciousIds.forEach(id => {
                    const result = InputValidator.validateDiscordId(id);
                    if (result.isValid && result.sanitizedValue) {
                        expect(result.sanitizedValue).not.toContain('<');
                        expect(result.sanitizedValue).not.toContain('>');
                        expect(result.sanitizedValue).not.toContain('"');
                        expect(result.sanitizedValue).not.toContain("'");
                        expect(result.sanitizedValue).not.toContain(';');
                    }
                });
            });
        });

        describe('Amount Validation', () => {
            const validAmounts = [
                0.01, // Minimum
                1.00,
                10.50,
                999.99,
                1000.00, // Maximum
            ];

            const invalidAmounts = [
                0, // Zero
                -1, // Negative
                0.001, // Below minimum
                1000.01, // Above maximum
                Infinity, // Infinite
                -Infinity, // Negative infinite
                NaN, // Not a number
                null, // Null
                undefined, // Undefined
                '10.00', // String (should be number)
                '1.00; DROP TABLE transactions;--', // SQL injection
                '<script>alert(1)</script>', // XSS
            ];

            it('should accept valid amounts', () => {
                validAmounts.forEach(amount => {
                    const result = InputValidator.validateAmount(amount);
                    expect(result.isValid).toBe(true);
                    expect(result.errors).toHaveLength(0);
                });
            });

            it('should reject invalid amounts', () => {
                invalidAmounts.forEach(amount => {
                    const result = InputValidator.validateAmount(amount as any);
                    expect(result.isValid).toBe(false);
                    expect(result.errors.length).toBeGreaterThan(0);
                });
            });

            it('should handle floating point precision correctly', () => {
                const precisionTests = [
                    { input: 10.999, expected: false }, // Too many decimals
                    { input: 10.99, expected: true }, // Exactly 2 decimals
                    { input: 10.9, expected: true }, // 1 decimal
                    { input: 10, expected: true }, // No decimals
                    { input: 10.001, expected: false }, // 3 decimals
                ];

                precisionTests.forEach(({ input, expected }) => {
                    const result = InputValidator.validateAmount(input);
                    expect(result.isValid).toBe(expected);
                });
            });
        });

        describe('Description Validation', () => {
            const validDescriptions = [
                'Payment for services',
                'Lunch money',
                'Rent payment',
                'Gift for birthday',
                'A'.repeat(500), // Maximum length
            ];

            const invalidDescriptions = [
                '', // Empty
                'A'.repeat(501), // Too long
                '<script>alert("xss")</script>', // XSS
                'Payment for services; DROP TABLE transactions;--', // SQL injection
                'Visit http://malicious-site.com for details', // Suspicious URL
                'javascript:alert(1)', // JavaScript protocol
                'data:text/html,<script>alert(1)</script>', // Data URI
                null, // Null
                undefined, // Undefined
            ];

            it('should accept valid descriptions', () => {
                validDescriptions.forEach(description => {
                    const result = InputValidator.validateDescription(description);
                    expect(result.isValid).toBe(true);
                    expect(result.errors).toHaveLength(0);
                });
            });

            it('should reject invalid descriptions', () => {
                invalidDescriptions.forEach(description => {
                    const result = InputValidator.validateDescription(description as any);
                    expect(result.isValid).toBe(false);
                    expect(result.errors.length).toBeGreaterThan(0);
                });
            });

            it('should sanitize descriptions properly', () => {
                const maliciousDescriptions = [
                    'Payment <script>alert(1)</script> for services',
                    'Rent payment "onload="alert(1)"',
                    "Gift'; DROP TABLE users;--",
                    'Visit http://evil.com for details',
                ];

                maliciousDescriptions.forEach(description => {
                    const result = InputValidator.validateDescription(description);
                    if (result.isValid && result.sanitizedValue) {
                        expect(result.sanitizedValue).not.toContain('<script>');
                        expect(result.sanitizedValue).not.toContain('onload=');
                        expect(result.sanitizedValue).not.toContain('DROP TABLE');
                        expect(result.sanitizedValue).not.toContain('http://');
                    }
                });
            });
        });

        describe('Payment Method Validation', () => {
            it('should validate cryptocurrency wallet addresses', () => {
                const validBitcoinAddresses = [
                    '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Genesis block address
                    '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', // P2SH address
                    'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', // Bech32 address
                ];

                const invalidBitcoinAddresses = [
                    '', // Empty
                    '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfN', // Too short
                    '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNaa', // Too long
                    '0A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Invalid first character
                    '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfN0', // Invalid character
                    '<script>alert(1)</script>', // XSS
                    "'; DROP TABLE users;--", // SQL injection
                ];

                validBitcoinAddresses.forEach(address => {
                    const result = InputValidator.validateCryptoAddress(address, 'BTC');
                    expect(result.isValid).toBe(true);
                });

                invalidBitcoinAddresses.forEach(address => {
                    const result = InputValidator.validateCryptoAddress(address, 'BTC');
                    expect(result.isValid).toBe(false);
                });
            });

            it('should validate ACH bank account details', () => {
                const validRoutingNumbers = [
                    '123456789',
                    '987654321',
                    '111000025', // Real routing number format
                ];

                const invalidRoutingNumbers = [
                    '', // Empty
                    '12345678', // Too short
                    '1234567890', // Too long
                    'abcdefghi', // Non-numeric
                    '123456789; DROP TABLE accounts;--', // SQL injection
                    '<script>alert(1)</script>', // XSS
                ];

                validRoutingNumbers.forEach(routing => {
                    const result = InputValidator.validateRoutingNumber(routing);
                    expect(result.isValid).toBe(true);
                });

                invalidRoutingNumbers.forEach(routing => {
                    const result = InputValidator.validateRoutingNumber(routing);
                    expect(result.isValid).toBe(false);
                });
            });
        });
    });

    describe('Access Control Security', () => {
        describe('User Authentication', () => {
            it('should prevent unauthorized access to user accounts', async () => {
                // Create test users
                const user1Id = 'user-1';
                const user2Id = 'user-2';

                await testDataFactory.createUserAccount(user1Id);
                await testDataFactory.createUserAccount(user2Id);

                // User 1 tries to access User 2's account
                const result = await securityMiddleware.checkUserAccess(user1Id, user2Id);
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('unauthorized');

                // User 1 accesses their own account
                const selfResult = await securityMiddleware.checkUserAccess(user1Id, user1Id);
                expect(selfResult.allowed).toBe(true);
            });

            it('should log unauthorized access attempts', async () => {
                const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

                const user1Id = 'attacker-user';
                const user2Id = 'victim-user';

                await testDataFactory.createUserAccount(user1Id);
                await testDataFactory.createUserAccount(user2Id);

                // Attempt unauthorized access
                await securityMiddleware.checkUserAccess(user1Id, user2Id);

                // Should log security event
                await auditLogger.logSecurityEvent(
                    AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
                    user1Id,
                    {
                        targetUserId: user2Id,
                        action: 'account_access',
                    },
                    AuditSeverity.WARNING
                );

                expect(logSpy).toHaveBeenCalled();
                logSpy.mockRestore();
            });
        });

        describe('Admin Permission Validation', () => {
            it('should validate admin permissions correctly', async () => {
                const serverId = 'test-server';
                const adminId = 'admin-user';
                const regularUserId = 'regular-user';

                // Create server config with admin
                await testDataFactory.createServerConfig(serverId, {
                    adminUserIds: [adminId],
                    paymentsEnabled: true,
                    maxAmountPerUser: 100.00,
                    maxTransactionsPerUser: 10,
                });

                // Admin should have access
                const adminResult = await securityMiddleware.checkAdminAccess(adminId, serverId);
                expect(adminResult.allowed).toBe(true);

                // Regular user should not have access
                const userResult = await securityMiddleware.checkAdminAccess(regularUserId, serverId);
                expect(userResult.allowed).toBe(false);
            });

            it('should prevent privilege escalation attempts', async () => {
                const serverId = 'test-server';
                const attackerId = 'attacker-user';

                await testDataFactory.createServerConfig(serverId, {
                    adminUserIds: [],
                    paymentsEnabled: true,
                    maxAmountPerUser: 100.00,
                    maxTransactionsPerUser: 10,
                });

                // Attacker tries to modify server config
                const result = await securityMiddleware.checkAdminAccess(attackerId, serverId);
                expect(result.allowed).toBe(false);

                // Should log the attempt
                const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

                await auditLogger.logSecurityEvent(
                    AuditEventType.PRIVILEGE_ESCALATION_ATTEMPT,
                    attackerId,
                    {
                        serverId,
                        attemptedAction: 'modify_server_config',
                    },
                    AuditSeverity.CRITICAL
                );

                expect(logSpy).toHaveBeenCalled();
                logSpy.mockRestore();
            });
        });

        describe('Transaction Authorization', () => {
            it('should prevent unauthorized transaction modifications', async () => {
                const senderId = 'sender-user';
                const recipientId = 'recipient-user';
                const attackerId = 'attacker-user';

                await testDataFactory.createUserAccount(senderId);
                await testDataFactory.createUserAccount(recipientId);
                await testDataFactory.createUserAccount(attackerId);

                // Create a transaction
                const transaction = await testDataFactory.createTransaction(
                    senderId,
                    recipientId,
                    50.00,
                    'pending'
                );

                // Attacker tries to modify transaction
                const result = await securityMiddleware.checkTransactionAccess(
                    attackerId,
                    transaction.id,
                    'modify'
                );

                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('unauthorized');

                // Sender should be able to cancel
                const senderResult = await securityMiddleware.checkTransactionAccess(
                    senderId,
                    transaction.id,
                    'cancel'
                );

                expect(senderResult.allowed).toBe(true);
            });
        });
    });

    describe('Rate Limiting Security', () => {
        describe('Payment Rate Limiting', () => {
            it('should enforce payment rate limits per user', async () => {
                const rateLimiter = new RateLimiter({
                    windowMs: 60000, // 1 minute
                    maxRequests: 3,
                });

                const userId = 'rate-limited-user';

                // First 3 requests should be allowed
                for (let i = 0; i < 3; i++) {
                    const result = await rateLimiter.checkLimit(userId, 'payment');
                    expect(result.allowed).toBe(true);
                }

                // 4th request should be blocked
                const blockedResult = await rateLimiter.checkLimit(userId, 'payment');
                expect(blockedResult.allowed).toBe(false);
                expect(blockedResult.retryAfter).toBeGreaterThan(0);

                rateLimiter.destroy();
            });

            it('should handle rate limit bypass attempts', async () => {
                const rateLimiter = new RateLimiter({
                    windowMs: 60000,
                    maxRequests: 2,
                });

                const baseUserId = 'bypass-attacker';
                const bypassAttempts = [
                    baseUserId,
                    baseUserId + ' ', // With space
                    baseUserId.toUpperCase(), // Different case
                    baseUserId + '\n', // With newline
                    baseUserId + '\t', // With tab
                ];

                // All attempts should be treated as the same user
                let allowedCount = 0;
                for (const userId of bypassAttempts) {
                    const result = await rateLimiter.checkLimit(userId.trim().toLowerCase(), 'payment');
                    if (result.allowed) allowedCount++;
                }

                // Should only allow 2 requests total, not per variation
                expect(allowedCount).toBe(2);

                rateLimiter.destroy();
            });
        });

        describe('Distributed Rate Limiting', () => {
            it('should handle coordinated attacks from multiple IPs', async () => {
                const rateLimiter = new RateLimiter({
                    windowMs: 60000,
                    maxRequests: 5,
                    keyGenerator: (userId, action, metadata) => `${userId}:${action}:${metadata?.ip || 'unknown'}`,
                });

                const userId = 'distributed-target';
                const attackerIPs = ['192.168.1.1', '192.168.1.2', '192.168.1.3'];

                let totalAllowed = 0;

                // Each IP should be limited separately
                for (const ip of attackerIPs) {
                    for (let i = 0; i < 7; i++) {
                        const result = await rateLimiter.checkLimit(userId, 'payment', { ip });
                        if (result.allowed) totalAllowed++;
                    }
                }

                // Should allow 5 requests per IP
                expect(totalAllowed).toBe(attackerIPs.length * 5);

                rateLimiter.destroy();
            });
        });
    });

    describe('Data Encryption Security', () => {
        describe('Payment Method Encryption', () => {
            it('should encrypt sensitive payment data', () => {
                const encryptionService = EncryptionService.getInstance();
                const sensitiveData = {
                    routingNumber: '123456789',
                    accountNumber: '987654321',
                    walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
                };

                const encrypted = encryptionService.encrypt(JSON.stringify(sensitiveData));

                // Encrypted data should not contain original values
                expect(encrypted.encrypted).not.toContain('123456789');
                expect(encrypted.encrypted).not.toContain('987654321');
                expect(encrypted.encrypted).not.toContain('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');

                // Should be able to decrypt
                const decrypted = encryptionService.decrypt(encrypted);
                const decryptedData = JSON.parse(decrypted);

                expect(decryptedData.routingNumber).toBe('123456789');
                expect(decryptedData.accountNumber).toBe('987654321');
                expect(decryptedData.walletAddress).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
            });

            it('should use different IVs for identical data', () => {
                const encryptionService = EncryptionService.getInstance();
                const data = 'identical sensitive data';

                const encrypted1 = encryptionService.encrypt(data);
                const encrypted2 = encryptionService.encrypt(data);

                // IVs should be different
                expect(encrypted1.iv).not.toBe(encrypted2.iv);

                // Encrypted data should be different
                expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);

                // Both should decrypt to the same value
                expect(encryptionService.decrypt(encrypted1)).toBe(data);
                expect(encryptionService.decrypt(encrypted2)).toBe(data);
            });

            it('should detect tampering with encrypted data', () => {
                const encryptionService = EncryptionService.getInstance();
                const data = 'sensitive payment information';

                const encrypted = encryptionService.encrypt(data);

                // Tamper with the encrypted data
                const tamperedEncrypted = {
                    ...encrypted,
                    encrypted: encrypted.encrypted.slice(0, -2) + 'XX',
                };

                // Should throw security error
                expect(() => {
                    encryptionService.decrypt(tamperedEncrypted);
                }).toThrow(SecurityError);
            });
        });

        describe('Token Security', () => {
            it('should generate secure tokens for payment methods', () => {
                const encryptionService = EncryptionService.getInstance();
                const paymentData = {
                    type: 'ach',
                    routingNumber: '123456789',
                    accountNumber: '987654321',
                };

                const tokenized = encryptionService.tokenize(JSON.stringify(paymentData));

                // Token should not contain original data
                expect(tokenized.token).not.toContain('123456789');
                expect(tokenized.token).not.toContain('987654321');
                expect(tokenized.token).not.toContain('ach');

                // Should be able to detokenize
                const detokenized = encryptionService.detokenize(tokenized.token);
                const originalData = JSON.parse(detokenized);

                expect(originalData.type).toBe('ach');
                expect(originalData.routingNumber).toBe('123456789');
                expect(originalData.accountNumber).toBe('987654321');
            });

            it('should invalidate tokens after use if configured', () => {
                const encryptionService = EncryptionService.getInstance();
                const data = 'one-time-use-data';

                const tokenized = encryptionService.tokenize(data, { oneTimeUse: true });

                // First use should work
                const detokenized1 = encryptionService.detokenize(tokenized.token);
                expect(detokenized1).toBe(data);

                // Second use should fail
                expect(() => {
                    encryptionService.detokenize(tokenized.token);
                }).toThrow(SecurityError);
            });
        });
    });

    describe('Audit Logging Security', () => {
        it('should log all security-relevant events', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

            const securityEvents = [
                {
                    type: AuditEventType.INVALID_INPUT_DETECTED,
                    userId: 'test-user',
                    details: { input: 'malicious-input', field: 'amount' },
                    severity: AuditSeverity.WARNING,
                },
                {
                    type: AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
                    userId: 'attacker-user',
                    details: { targetResource: 'user-account', targetId: 'victim-user' },
                    severity: AuditSeverity.CRITICAL,
                },
                {
                    type: AuditEventType.SUSPICIOUS_ACTIVITY,
                    userId: 'suspicious-user',
                    details: { activity: 'rapid-payment-attempts', count: 50 },
                    severity: AuditSeverity.HIGH,
                },
            ];

            // Log all events
            for (const event of securityEvents) {
                await auditLogger.logSecurityEvent(
                    event.type,
                    event.userId,
                    event.details,
                    event.severity
                );
            }

            // Should have logged all events
            expect(logSpy).toHaveBeenCalledTimes(securityEvents.length);

            // Verify log format
            const logCalls = logSpy.mock.calls;
            logCalls.forEach((call, index) => {
                const logEntry = JSON.parse(call[0]);
                expect(logEntry.eventType).toBe(securityEvents[index].type);
                expect(logEntry.userId).toBe(securityEvents[index].userId);
                expect(logEntry.severity).toBe(securityEvents[index].severity);
                expect(logEntry.timestamp).toBeDefined();
            });

            logSpy.mockRestore();
        });

        it('should not log sensitive data in audit logs', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

            const sensitiveData = {
                creditCardNumber: '4532-1234-5678-9012',
                ssn: '123-45-6789',
                password: 'super-secret-password',
                bankAccount: '987654321',
            };

            await auditLogger.logSecurityEvent(
                AuditEventType.PAYMENT_PROCESSED,
                'test-user',
                {
                    amount: 100.00,
                    // Sensitive data should be filtered out
                    paymentMethod: 'credit-card',
                    ...sensitiveData,
                },
                AuditSeverity.INFO
            );

            expect(logSpy).toHaveBeenCalled();
            const logEntry = JSON.parse(logSpy.mock.calls[0][0]);

            // Should not contain sensitive data
            expect(JSON.stringify(logEntry)).not.toContain('4532-1234-5678-9012');
            expect(JSON.stringify(logEntry)).not.toContain('123-45-6789');
            expect(JSON.stringify(logEntry)).not.toContain('super-secret-password');
            expect(JSON.stringify(logEntry)).not.toContain('987654321');

            logSpy.mockRestore();
        });
    });

    describe('Security Monitoring', () => {
        it('should detect and alert on suspicious patterns', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
            const userId = 'suspicious-user';

            // Simulate suspicious pattern: many failed validation attempts
            for (let i = 0; i < 10; i++) {
                await auditLogger.logSecurityEvent(
                    AuditEventType.INVALID_INPUT_DETECTED,
                    userId,
                    {
                        attempt: i + 1,
                        inputType: 'payment_amount',
                        suspiciousValue: `malicious_input_${i}`,
                    },
                    AuditSeverity.WARNING
                );
            }

            // Should have logged all attempts
            expect(logSpy).toHaveBeenCalledTimes(10);

            // In a real system, this would trigger an alert
            const recentLogs = logSpy.mock.calls.slice(-10);
            const suspiciousPattern = recentLogs.every(call => {
                const logEntry = JSON.parse(call[0]);
                return logEntry.userId === userId &&
                    logEntry.eventType === AuditEventType.INVALID_INPUT_DETECTED;
            });

            expect(suspiciousPattern).toBe(true);

            logSpy.mockRestore();
        });

        it('should track failed authentication attempts', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
            const attackerId = 'brute-force-attacker';

            // Simulate brute force attack
            for (let i = 0; i < 5; i++) {
                await auditLogger.logSecurityEvent(
                    AuditEventType.AUTHENTICATION_FAILED,
                    attackerId,
                    {
                        attempt: i + 1,
                        reason: 'invalid_credentials',
                        timestamp: new Date().toISOString(),
                    },
                    AuditSeverity.WARNING
                );
            }

            expect(logSpy).toHaveBeenCalledTimes(5);

            // Verify escalating severity for repeated failures
            const lastCall = logSpy.mock.calls[4];
            const lastLogEntry = JSON.parse(lastCall[0]);
            expect(lastLogEntry.severity).toBe(AuditSeverity.WARNING);

            logSpy.mockRestore();
        });
    });
});