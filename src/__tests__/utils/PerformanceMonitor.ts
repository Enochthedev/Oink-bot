/**
 * Performance Monitor
 * Utility for monitoring and measuring test performance
 */
export class PerformanceMonitor {
    private testStartTimes: Map<string, number> = new Map();
    private testResults: Map<string, PerformanceResult> = new Map();
    private memorySnapshots: Map<string, NodeJS.MemoryUsage> = new Map();

    /**
     * Start monitoring a test
     */
    startTest(testName: string): void {
        this.testStartTimes.set(testName, Date.now());
        this.memorySnapshots.set(`${testName}-start`, process.memoryUsage());
    }

    /**
     * End monitoring a test
     */
    endTest(testName: string): PerformanceResult {
        const startTime = this.testStartTimes.get(testName);
        if (!startTime) {
            throw new Error(`Test ${testName} was not started`);
        }

        const endTime = Date.now();
        const duration = endTime - startTime;
        const startMemory = this.memorySnapshots.get(`${testName}-start`);
        const endMemory = process.memoryUsage();

        const result: PerformanceResult = {
            testName,
            duration,
            startTime,
            endTime,
            memoryUsage: {
                start: startMemory || process.memoryUsage(),
                end: endMemory,
                delta: {
                    rss: endMemory.rss - (startMemory?.rss || 0),
                    heapTotal: endMemory.heapTotal - (startMemory?.heapTotal || 0),
                    heapUsed: endMemory.heapUsed - (startMemory?.heapUsed || 0),
                    external: endMemory.external - (startMemory?.external || 0),
                    arrayBuffers: endMemory.arrayBuffers - (startMemory?.arrayBuffers || 0),
                },
            },
        };

        this.testResults.set(testName, result);
        this.testStartTimes.delete(testName);
        this.memorySnapshots.delete(`${testName}-start`);

        return result;
    }

    /**
     * Get test result
     */
    getResult(testName: string): PerformanceResult | undefined {
        return this.testResults.get(testName);
    }

    /**
     * Get all test results
     */
    getAllResults(): PerformanceResult[] {
        return Array.from(this.testResults.values());
    }

    /**
     * Reset all monitoring data
     */
    reset(): void {
        this.testStartTimes.clear();
        this.testResults.clear();
        this.memorySnapshots.clear();
    }

    /**
     * Generate performance report
     */
    generateReport(): PerformanceReport {
        const results = this.getAllResults();

        if (results.length === 0) {
            return {
                totalTests: 0,
                totalDuration: 0,
                averageDuration: 0,
                fastestTest: null,
                slowestTest: null,
                memoryStats: {
                    totalMemoryUsed: 0,
                    averageMemoryUsed: 0,
                    peakMemoryUsage: 0,
                },
                tests: [],
            };
        }

        const totalDuration = results.reduce((sum, result) => sum + result.duration, 0);
        const averageDuration = totalDuration / results.length;

        const sortedByDuration = [...results].sort((a, b) => a.duration - b.duration);
        const fastestTest = sortedByDuration[0];
        const slowestTest = sortedByDuration[sortedByDuration.length - 1];

        const memoryUsages = results.map(r => r.memoryUsage.delta.heapUsed);
        const totalMemoryUsed = memoryUsages.reduce((sum, usage) => sum + usage, 0);
        const averageMemoryUsed = totalMemoryUsed / memoryUsages.length;
        const peakMemoryUsage = Math.max(...memoryUsages);

        return {
            totalTests: results.length,
            totalDuration,
            averageDuration,
            fastestTest,
            slowestTest,
            memoryStats: {
                totalMemoryUsed,
                averageMemoryUsed,
                peakMemoryUsage,
            },
            tests: results,
        };
    }

    /**
     * Print performance report to console
     */
    printReport(): void {
        const report = this.generateReport();

        console.log('\n=== Performance Report ===');
        console.log(`Total Tests: ${report.totalTests}`);
        console.log(`Total Duration: ${report.totalDuration}ms`);
        console.log(`Average Duration: ${report.averageDuration.toFixed(2)}ms`);

        if (report.fastestTest) {
            console.log(`Fastest Test: ${report.fastestTest.testName} (${report.fastestTest.duration}ms)`);
        }

        if (report.slowestTest) {
            console.log(`Slowest Test: ${report.slowestTest.testName} (${report.slowestTest.duration}ms)`);
        }

        console.log('\n=== Memory Usage ===');
        console.log(`Total Memory Used: ${this.formatBytes(report.memoryStats.totalMemoryUsed)}`);
        console.log(`Average Memory Used: ${this.formatBytes(report.memoryStats.averageMemoryUsed)}`);
        console.log(`Peak Memory Usage: ${this.formatBytes(report.memoryStats.peakMemoryUsage)}`);

        console.log('\n=== Individual Test Results ===');
        report.tests.forEach(test => {
            console.log(`${test.testName}: ${test.duration}ms (Memory: ${this.formatBytes(test.memoryUsage.delta.heapUsed)})`);
        });
        console.log('========================\n');
    }

    /**
     * Check if test meets performance criteria
     */
    checkPerformanceCriteria(testName: string, criteria: PerformanceCriteria): PerformanceCheck {
        const result = this.getResult(testName);
        if (!result) {
            return {
                passed: false,
                errors: [`Test ${testName} not found`],
                warnings: [],
            };
        }

        const errors: string[] = [];
        const warnings: string[] = [];

        // Check duration
        if (criteria.maxDuration && result.duration > criteria.maxDuration) {
            errors.push(`Duration ${result.duration}ms exceeds maximum ${criteria.maxDuration}ms`);
        }

        if (criteria.warningDuration && result.duration > criteria.warningDuration) {
            warnings.push(`Duration ${result.duration}ms exceeds warning threshold ${criteria.warningDuration}ms`);
        }

        // Check memory usage
        if (criteria.maxMemoryUsage && result.memoryUsage.delta.heapUsed > criteria.maxMemoryUsage) {
            errors.push(`Memory usage ${this.formatBytes(result.memoryUsage.delta.heapUsed)} exceeds maximum ${this.formatBytes(criteria.maxMemoryUsage)}`);
        }

        if (criteria.warningMemoryUsage && result.memoryUsage.delta.heapUsed > criteria.warningMemoryUsage) {
            warnings.push(`Memory usage ${this.formatBytes(result.memoryUsage.delta.heapUsed)} exceeds warning threshold ${this.formatBytes(criteria.warningMemoryUsage)}`);
        }

        return {
            passed: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Measure function execution time
     */
    async measureFunction<T>(name: string, fn: () => Promise<T>): Promise<T> {
        this.startTest(name);
        try {
            const result = await fn();
            this.endTest(name);
            return result;
        } catch (error) {
            this.endTest(name);
            throw error;
        }
    }

    /**
     * Measure synchronous function execution time
     */
    measureSync<T>(name: string, fn: () => T): T {
        this.startTest(name);
        try {
            const result = fn();
            this.endTest(name);
            return result;
        } catch (error) {
            this.endTest(name);
            throw error;
        }
    }

    /**
     * Create a performance benchmark
     */
    async benchmark(
        name: string,
        fn: () => Promise<void>,
        iterations: number = 100
    ): Promise<BenchmarkResult> {
        const results: number[] = [];
        const memoryUsages: number[] = [];

        for (let i = 0; i < iterations; i++) {
            const testName = `${name}-iteration-${i}`;
            this.startTest(testName);

            await fn();

            const result = this.endTest(testName);
            results.push(result.duration);
            memoryUsages.push(result.memoryUsage.delta.heapUsed);
        }

        results.sort((a, b) => a - b);
        memoryUsages.sort((a, b) => a - b);

        const sum = results.reduce((a, b) => a + b, 0);
        const memorySum = memoryUsages.reduce((a, b) => a + b, 0);

        return {
            name,
            iterations,
            totalTime: sum,
            averageTime: sum / iterations,
            medianTime: results[Math.floor(results.length / 2)],
            minTime: results[0],
            maxTime: results[results.length - 1],
            standardDeviation: this.calculateStandardDeviation(results),
            averageMemoryUsage: memorySum / iterations,
            medianMemoryUsage: memoryUsages[Math.floor(memoryUsages.length / 2)],
            minMemoryUsage: memoryUsages[0],
            maxMemoryUsage: memoryUsages[memoryUsages.length - 1],
        };
    }

    /**
     * Format bytes to human readable format
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Calculate standard deviation
     */
    private calculateStandardDeviation(values: number[]): number {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
        const avgSquaredDiff = squaredDifferences.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(avgSquaredDiff);
    }
}

// Type definitions
export interface PerformanceResult {
    testName: string;
    duration: number;
    startTime: number;
    endTime: number;
    memoryUsage: {
        start: NodeJS.MemoryUsage;
        end: NodeJS.MemoryUsage;
        delta: NodeJS.MemoryUsage;
    };
}

export interface PerformanceReport {
    totalTests: number;
    totalDuration: number;
    averageDuration: number;
    fastestTest: PerformanceResult | null;
    slowestTest: PerformanceResult | null;
    memoryStats: {
        totalMemoryUsed: number;
        averageMemoryUsed: number;
        peakMemoryUsage: number;
    };
    tests: PerformanceResult[];
}

export interface PerformanceCriteria {
    maxDuration?: number;
    warningDuration?: number;
    maxMemoryUsage?: number;
    warningMemoryUsage?: number;
}

export interface PerformanceCheck {
    passed: boolean;
    errors: string[];
    warnings: string[];
}

export interface BenchmarkResult {
    name: string;
    iterations: number;
    totalTime: number;
    averageTime: number;
    medianTime: number;
    minTime: number;
    maxTime: number;
    standardDeviation: number;
    averageMemoryUsage: number;
    medianMemoryUsage: number;
    minMemoryUsage: number;
    maxMemoryUsage: number;
}