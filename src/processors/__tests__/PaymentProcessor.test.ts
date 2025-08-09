import { describe, it, expect, vi } from 'vitest';
import { BasePaymentProcessor, PaymentMethodDetails } from '../PaymentProcessor';

// Concrete implementation for testing
class TestPaymentProcessor extends BasePaymentProcessor {
    constructor() {
        super('test');
    }

    async validatePaymentMethod(accountDetails: PaymentMethodDetails): Promise<boolean> {
        return this.validateAccountDetails(accountDetails);
    }

    async withdrawFunds(accountDetails: PaymentMethodDetails, amount: number) {
        if (!this.validateAmount(amount)) {
            return this.createErrorResult('Invalid amount');
        }
        return {
            success: true,
            transactionId: 'test_withdrawal_123',
        };
    }

    async depositFunds(accountDetails: PaymentMethodDetails, amount: number) {
        if (!this.validateAmount(amount)) {
            return this.createErrorResult('Invalid amount');
        }
        return {
            success: true,
            transactionId: 'test_deposit_123',
        };
    }

    async getProcessingTime() {
        return {
            minMinutes: 5,
            maxMinutes: 15,
        };
    }

    async calculateFees(amount: number) {
        return {
            processingFee: 1.0,
            percentage: amount * 0.03,
            total: 1.0 + (amount * 0.03),
        };
    }
}

describe('BasePaymentProcessor', () => {
    let processor: TestPaymentProcessor;

    beforeEach(() => {
        processor = new TestPaymentProcessor();
    });

    describe('validateAmount', () => {
        it('should return true for positive numbers', () => {
            expect((processor as any).validateAmount(100)).toBe(true);
            expect((processor as any).validateAmount(0.01)).toBe(true);
        });

        it('should return false for zero or negative numbers', () => {
            expect((processor as any).validateAmount(0)).toBe(false);
            expect((processor as any).validateAmount(-10)).toBe(false);
        });

        it('should return false for non-finite numbers', () => {
            expect((processor as any).validateAmount(Infinity)).toBe(false);
            expect((processor as any).validateAmount(NaN)).toBe(false);
        });
    });

    describe('validateAccountDetails', () => {
        it('should return true for valid account details', () => {
            const validDetails: PaymentMethodDetails = {
                type: 'test',
                accountInfo: { account: '123456' },
            };
            expect((processor as any).validateAccountDetails(validDetails)).toBe(true);
        });

        it('should return false for invalid account details', () => {
            expect((processor as any).validateAccountDetails(null)).toBe(false);
            expect((processor as any).validateAccountDetails(undefined)).toBe(false);
            expect((processor as any).validateAccountDetails({})).toBe(false);
            expect((processor as any).validateAccountDetails({ type: 'test' })).toBe(false);
            expect((processor as any).validateAccountDetails({ accountInfo: {} })).toBe(false);
        });
    });

    describe('createErrorResult', () => {
        it('should create proper error result', () => {
            const result = (processor as any).createErrorResult('Test error');
            expect(result).toEqual({
                success: false,
                transactionId: '',
                error: 'Test error',
            });
        });
    });

    describe('interface compliance', () => {
        it('should implement all PaymentProcessor methods', async () => {
            const accountDetails: PaymentMethodDetails = {
                type: 'test',
                accountInfo: { account: '123456' },
            };

            // Test validatePaymentMethod
            const isValid = await processor.validatePaymentMethod(accountDetails);
            expect(typeof isValid).toBe('boolean');

            // Test withdrawFunds
            const withdrawal = await processor.withdrawFunds(accountDetails, 100);
            expect(withdrawal).toHaveProperty('success');
            expect(withdrawal).toHaveProperty('transactionId');

            // Test depositFunds
            const deposit = await processor.depositFunds(accountDetails, 100);
            expect(deposit).toHaveProperty('success');
            expect(deposit).toHaveProperty('transactionId');

            // Test getProcessingTime
            const processingTime = await processor.getProcessingTime();
            expect(processingTime).toHaveProperty('minMinutes');
            expect(processingTime).toHaveProperty('maxMinutes');

            // Test calculateFees
            const fees = await processor.calculateFees(100);
            expect(fees).toHaveProperty('processingFee');
            expect(fees).toHaveProperty('percentage');
            expect(fees).toHaveProperty('total');
        });

        it('should handle invalid amounts in withdrawFunds', async () => {
            const accountDetails: PaymentMethodDetails = {
                type: 'test',
                accountInfo: { account: '123456' },
            };

            const result = await processor.withdrawFunds(accountDetails, -10);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid amount');
        });

        it('should handle invalid amounts in depositFunds', async () => {
            const accountDetails: PaymentMethodDetails = {
                type: 'test',
                accountInfo: { account: '123456' },
            };

            const result = await processor.depositFunds(accountDetails, 0);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid amount');
        });
    });
});