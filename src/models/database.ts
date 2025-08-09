// Database utility functions and Prisma client setup
import { PrismaClient } from '@prisma/client';

// Global Prisma client instance
let prisma: PrismaClient;

declare global {
    var __prisma: PrismaClient | undefined;
}

// Initialize Prisma client with singleton pattern
export function getPrismaClient(): PrismaClient {
    if (!prisma) {
        if (process.env.NODE_ENV === 'production') {
            prisma = new PrismaClient();
        } else {
            // In development, use a global variable to prevent multiple instances
            if (!global.__prisma) {
                global.__prisma = new PrismaClient({
                    log: ['query', 'error', 'warn'],
                });
            }
            prisma = global.__prisma;
        }
    }
    return prisma;
}

// Database connection management
export async function connectDatabase(): Promise<void> {
    try {
        const client = getPrismaClient();
        await client.$connect();
        console.log('🐷 Oink! Database connected successfully! 🐽✨');
    } catch (error) {
        console.error('❌ Oink... failed to connect to database:', error);
        throw error;
    }
}

export async function disconnectDatabase(): Promise<void> {
    try {
        const client = getPrismaClient();
        await client.$disconnect();
        console.log('🐷 Oink! Database disconnected successfully! 🐽');
    } catch (error) {
        console.error('❌ Oink... failed to disconnect from database:', error);
        throw error;
    }
}

// Database health check
export async function checkDatabaseHealth(): Promise<boolean> {
    try {
        const client = getPrismaClient();
        await client.$queryRaw`SELECT 1`;
        return true;
    } catch (error) {
        console.error('❌ Oink... database health check failed:', error);
        return false;
    }
}

// Transaction wrapper for atomic operations
export async function withTransaction<T>(
    operation: (prisma: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>
): Promise<T> {
    const client = getPrismaClient();
    return await client.$transaction(operation);
}

// Cleanup function for graceful shutdown
export async function cleanup(): Promise<void> {
    await disconnectDatabase();
}

// Export the client getter as default
export default getPrismaClient;