import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';

/**
 * Global test setup
 * Runs once before all tests to prepare the test environment
 */
export default async function globalSetup() {
            console.log('🐷 Oink! Setting up global test environment... 🐽🔧');

    try {
        // Clean up any existing test database
        const testDbPath = path.join(process.cwd(), 'prisma', 'test.db');
        if (existsSync(testDbPath)) {
            unlinkSync(testDbPath);
            console.log('🐷 Oink! Removed existing test database 🐽🗑️');
        }

        // Set test environment
        process.env.NODE_ENV = 'test';
        process.env.DATABASE_URL = 'file:./test.db';

        // Run database migrations for test database
        console.log('📊 Running database migrations...');
        execSync('npx prisma migrate deploy', {
            stdio: 'inherit',
            env: {
                ...process.env,
                DATABASE_URL: 'file:./test.db',
            },
        });

        // Generate Prisma client for test environment
        console.log('🔄 Generating Prisma client...');
        execSync('npx prisma generate', {
            stdio: 'inherit',
        });

        console.log('✅ Global test environment setup complete');

    } catch (error) {
        console.error('❌ Failed to set up global test environment:', error);
        throw error;
    }
}

/**
 * Global test teardown
 * Runs once after all tests to clean up the test environment
 */
export async function globalTeardown() {
    console.log('🧹 Tearing down global test environment...');

    try {
        // Clean up test database
        const testDbPath = path.join(process.cwd(), 'prisma', 'test.db');
        if (existsSync(testDbPath)) {
            unlinkSync(testDbPath);
            console.log('🗑️  Removed test database');
        }

        // Clean up any test log files
        const testLogPath = path.join(process.cwd(), 'logs', 'test.log');
        if (existsSync(testLogPath)) {
            unlinkSync(testLogPath);
            console.log('🗑️  Removed test log files');
        }

        console.log('✅ Global test environment teardown complete');

    } catch (error) {
        console.error('❌ Failed to tear down global test environment:', error);
        // Don't throw error in teardown to avoid masking test failures
    }
}