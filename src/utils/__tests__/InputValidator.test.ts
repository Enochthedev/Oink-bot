import { describe, it, expect } from 'vitest';
import { InputValidator } from '../InputValidator';

describe('InputValidator', () => {
    describe('sanitizeString', () => {
        it('should remove dangerous characters', () => {
            const maliciousInput = "'; DROP TABLE users; --";
            const sanitized = InputValidator.sanitizeString(maliciousInput);

            expect(sanitized).not.toContain("'");
            expect(sanitized).not.toContain(';');
            expect(sanitized).not.toContain('--');
        });

        it('should remove XSS characters', () => {
            const xssInput = '<script>alert("xss")</script>';
            const sanitized = InputValidator.sanitizeString(xssInput);

            expect(sanitized).not.toContain('<');
            expect(sanitized).not.toContain('>');
            expect(sanitized).not.toContain('"');
        });
    });

    describe('validateDiscordId', () => {
        it('should validate correct Discord IDs', () => {
            const validId = '123456789012345678';
            const result = InputValidator.validateDiscordId(validId);

            expect(result.isValid).toBe(true);
            expect(result.sanitizedValue).toBe(validId);
        });

        it('should reject invalid Discord IDs', () => {
            const invalidId = 'invalid-id';
            const result = InputValidator.validateDiscordId(invalidId);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe('validateAmount', () => {
        it('should validate correct amounts', () => {
            const validAmount = 100.50;
            const result = InputValidator.validateAmount(validAmount);

            expect(result.isValid).toBe(true);
            expect(result.sanitizedValue).toBe(100.50);
        });

        it('should reject negative amounts', () => {
            const invalidAmount = -100;
            const result = InputValidator.validateAmount(invalidAmount);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });
});