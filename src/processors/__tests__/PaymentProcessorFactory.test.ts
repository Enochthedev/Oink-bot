import { describe, it, expect, vi } from 'vitest';
import { DefaultPaymentProcessorFactory, MockPaymentProcessor } from '../PaymentProcessorFactory';
import { PaymentMethodType } from '../../models/UserAccount';

// Note: Using MockPaymentProcessor directly since concrete implementations are not yet available

describe('DefaultPaymentProcessorFactory', () => {
    let factory: DefaultPaymentProcessorFactory;

    beforeEach(() => {
        factory = new DefaultPaymentProcessorFactory();
    });

    describe('getSupportedMethods', () => {
        it('should return all supported payment methods', () => {
            const methods = factory.getSupportedMethods();
            expect(methods).toEqual(['crypto', 'ach', 'other']);
        });

        it('should return a copy of the array', () => {
            const methods1 = factory.getSupportedMethods();
            const methods2 = factory.getSupportedMethods();
            expect(methods1).not.toBe(methods2);
            expect(methods1).toEqual(methods2);
        });
    });

    describe('createProcessor', () => {
        it('should create crypto processor', () => {
            const processor = factory.createProcessor('crypto');
            expect(processor).toBeDefined();
            expect(typeof processor.validatePaymentMethod).toBe('function');
            expect(typeof processor.withdrawFunds).toBe('function');
            expect(typeof processor.depositFunds).toBe('function');
            expect(typeof processor.getProcessingTime).toBe('function');
            expect(typeof processor.calculateFees).toBe('function');
        });

        it('should create ACH processor', () => {
            const processor = factory.createProcessor('ach');
            expect(processor).toBeDefined();
            expect(typeof processor.validatePaymentMethod).toBe('function');
            expect(typeof processor.withdrawFunds).toBe('function');
            expect(typeof processor.depositFunds).toBe('function');
            expect(typeof processor.getProcessingTime).toBe('function');
            expect(typeof processor.calculateFees).toBe('function');
        });

        it('should create mock processor for other type', () => {
            const processor = factory.createProcessor('other');
            expect(processor).toBeDefined();
            expect(processor).toBeInstanceOf(MockPaymentProcessor);
        });

        it('should throw error for unsupported type', () => {
            expect(() => {
                factory.createProcessor('unsupported' as PaymentMethodType);
            }).toThrow('Unsupported payment method type: unsupported');
        });
    });

    describe('factory pattern compliance', () => {
        it('should create different instances for each call', () => {
            const processor1 = factory.createProcessor('crypto');
            const processor2 = factory.createProcessor('crypto');
            expect(processor1).not.toBe(processor2);
        });

        it('should create processors that implement PaymentProcessor interface', async () => {
            const supportedMethods: PaymentMethodType[] = ['crypto', 'ach', 'other'];

            for (const method of supportedMethods) {
                const processor = factory.createProcessor(method);

                // Test interface compliance
                expect(typeof processor.validatePaymentMethod).toBe('function');
                expect(typeof processor.withdrawFunds).toBe('function');
                expect(typeof processor.depositFunds).toBe('function');
                expect(typeof processor.getProcessingTime).toBe('function');
                expect(typeof processor.calculateFees).toBe('function');

                // Test that methods return expected types
                const accountDetails = { type: method, accountInfo: { test: 'data' } };

                const isValid = await processor.validatePaymentMethod(accountDetails);
                expect(typeof isValid).toBe('boolean');

                const withdrawal = await processor.withdrawFunds(accountDetails, 100);
                expect(withdrawal).toHaveProperty('success');
                expect(withdrawal).toHaveProperty('transactionId');

                const deposit = await processor.depositFunds(accountDetails, 100);
                expect(deposit).toHaveProperty('success');
                expect(deposit).toHaveProperty('transactionId');

                const processingTime = await processor.getProcessingTime();
                expect(processingTime).toHaveProperty('minMinutes');
                expect(processingTime).toHaveProperty('maxMinutes');
                expect(typeof processingTime.minMinutes).toBe('number');
                expect(typeof processingTime.maxMinutes).toBe('number');

                const fees = await processor.calculateFees(100);
                expect(fees).toHaveProperty('processingFee');
                expect(fees).toHaveProperty('percentage');
                expect(fees).toHaveProperty('total');
                expect(typeof fees.processingFee).toBe('number');
                expect(typeof fees.percentage).toBe('number');
                expect(typeof fees.total).toBe('number');
            }
        });
    });
});

describe('MockPaymentProcessor', () => {
    let mockProcessor: MockPaymentProcessor;

    beforeEach(() => {
        mockProcessor = new MockPaymentProcessor();
    });

    describe('validatePaymentMethod', () => {
        it('should always return true', async () => {
            const result = await mockProcessor.validatePaymentMethod({
                type: 'mock',
                accountInfo: {}
            });
            expect(result).toBe(true);
        });
    });

    describe('withdrawFunds', () => {
        it('should return successful withdrawal result', async () => {
            const result = await mockProcessor.withdrawFunds({
                type: 'mock',
                accountInfo: {}
            }, 100);

            expect(result.success).toBe(true);
            expect(result.transactionId).toMatch(/^mock_withdrawal_\d+_[a-z0-9]+$/);
        });

        it('should generate unique transaction IDs', async () => {
            const result1 = await mockProcessor.withdrawFunds({
                type: 'mock',
                accountInfo: {}
            }, 100);

            const result2 = await mockProcessor.withdrawFunds({
                type: 'mock',
                accountInfo: {}
            }, 100);

            expect(result1.transactionId).not.toBe(result2.transactionId);
        });
    });

    describe('depositFunds', () => {
        it('should return successful deposit result', async () => {
            const result = await mockProcessor.depositFunds({
                type: 'mock',
                accountInfo: {}
            }, 100);

            expect(result.success).toBe(true);
            expect(result.transactionId).toMatch(/^mock_deposit_\d+_[a-z0-9]+$/);
        });
    });

    describe('getProcessingTime', () => {
        it('should return processing time estimate', async () => {
            const result = await mockProcessor.getProcessingTime();
            expect(result.minMinutes).toBe(1);
            expect(result.maxMinutes).toBe(5);
        });
    });

    describe('calculateFees', () => {
        it('should calculate fees correctly', async () => {
            const amount = 100;
            const result = await mockProcessor.calculateFees(amount);

            expect(result.processingFee).toBe(0.50);
            expect(result.percentage).toBe(amount * 0.029);
            expect(result.total).toBe(0.50 + (amount * 0.029));
        });

        it('should handle different amounts', async () => {
            const testAmounts = [10, 50, 200, 1000];

            for (const amount of testAmounts) {
                const result = await mockProcessor.calculateFees(amount);
                const expectedPercentage = amount * 0.029;
                const expectedTotal = 0.50 + expectedPercentage;

                expect(result.processingFee).toBe(0.50);
                expect(result.percentage).toBeCloseTo(expectedPercentage, 2);
                expect(result.total).toBeCloseTo(expectedTotal, 2);
            }
        });
    });

    describe('constructor', () => {
        it('should accept custom processor type', () => {
            const customProcessor = new MockPaymentProcessor('custom');
            expect((customProcessor as any).processorType).toBe('custom');
        });

        it('should default to mock type', () => {
            const defaultProcessor = new MockPaymentProcessor();
            expect((defaultProcessor as any).processorType).toBe('mock');
        });
    });
});