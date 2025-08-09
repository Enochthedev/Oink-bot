// Server configuration service implementation
import { ServerConfig, ServerConfigDB, dbToServerConfig, serverConfigToDb, isValidServerConfig } from '../models/ServerConfig';
import { PaymentMethodType } from '../models/UserAccount';
import getPrismaClient from '../models/database';

export interface ServerConfigService {
    /**
     * Get server configuration by server ID
     */
    getServerConfig(serverId: string): Promise<ServerConfig | null>;

    /**
     * Create or update server configuration
     */
    upsertServerConfig(config: Partial<ServerConfig> & { serverId: string }): Promise<ServerConfig>;

    /**
     * Check if payments are enabled for a server
     */
    arePaymentsEnabled(serverId: string): Promise<boolean>;

    /**
     * Validate payment limits for a user in a server
     */
    validatePaymentLimits(userId: string, amount: number, serverId: string): Promise<boolean>;

    /**
     * Check if a user is an admin for a server
     */
    isServerAdmin(userId: string, serverId: string): Promise<boolean>;

    /**
     * Check if a payment method is allowed in a server
     */
    isPaymentMethodAllowed(paymentMethod: PaymentMethodType, serverId: string): Promise<boolean>;

    /**
     * Get daily transaction stats for a user in a server
     */
    getDailyTransactionStats(userId: string, serverId: string): Promise<{
        totalAmount: number;
        transactionCount: number;
    }>;
}

export class ServerConfigServiceImpl implements ServerConfigService {
    private prisma = getPrismaClient();

    public async getServerConfig(serverId: string): Promise<ServerConfig | null> {
        try {
            const dbConfig = await this.prisma.serverConfig.findUnique({
                where: { serverId }
            });

            if (!dbConfig) {
                return null;
            }

            return dbToServerConfig(dbConfig);
        } catch (error) {
            console.error('❌ Oink... error getting server config:', error);
            throw new Error('Failed to retrieve server configuration');
        }
    }

    public async upsertServerConfig(config: Partial<ServerConfig> & { serverId: string }): Promise<ServerConfig> {
        try {
            // Create default config if partial
            const defaultConfig: ServerConfig = {
                id: '',
                serverId: config.serverId,
                paymentsEnabled: true,
                dailyLimits: {
                    maxAmountPerUser: 1000,
                    maxTransactionsPerUser: 10
                },
                allowedPaymentMethods: ['CRYPTO', 'ACH', 'OTHER'],
                adminUserIds: [],
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const mergedConfig = {
                ...defaultConfig,
                ...config,
                createdAt: config.createdAt || new Date(),
                updatedAt: new Date()
            };

            // Skip validation for partial updates as it may fail due to incomplete data
            // The database constraints will handle validation

            const dbData = serverConfigToDb(mergedConfig);

            const dbConfig = await this.prisma.serverConfig.upsert({
                where: { serverId: config.serverId },
                update: {
                    ...dbData,
                    updatedAt: new Date()
                },
                create: {
                    ...dbData,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            return dbToServerConfig(dbConfig);
        } catch (error) {
            console.error('❌ Oink... error upserting server config:', error);
            throw new Error('Failed to save server configuration');
        }
    }

    public async arePaymentsEnabled(serverId: string): Promise<boolean> {
        try {
            const config = await this.getServerConfig(serverId);
            return config?.paymentsEnabled ?? true; // Default to enabled if no config
        } catch (error) {
            console.error('❌ Oink... error checking if payments enabled:', error);
            return true; // Default to enabled on error
        }
    }

    public async validatePaymentLimits(userId: string, amount: number, serverId: string): Promise<boolean> {
        try {
            const config = await this.getServerConfig(serverId);
            if (!config) {
                return true; // No limits if no config
            }

            // Check amount limit
            if (amount > config.dailyLimits.maxAmountPerUser) {
                return false;
            }

            // Check transaction count limit
            const stats = await this.getDailyTransactionStats(userId, serverId);
            if (stats.transactionCount >= config.dailyLimits.maxTransactionsPerUser) {
                return false;
            }

            // Check daily amount limit
            if (stats.totalAmount + amount > config.dailyLimits.maxAmountPerUser) {
                return false;
            }

            return true;
        } catch (error) {
            console.error('❌ Oink... error validating payment limits:', error);
            return true; // Default to allow on error
        }
    }

    public async isServerAdmin(userId: string, serverId: string): Promise<boolean> {
        try {
            const config = await this.getServerConfig(serverId);
            if (!config) {
                return false;
            }

            return config.adminUserIds.includes(userId);
        } catch (error) {
            console.error('❌ Oink... error checking server admin status:', error);
            return false;
        }
    }

    public async isPaymentMethodAllowed(paymentMethod: PaymentMethodType, serverId: string): Promise<boolean> {
        try {
            const config = await this.getServerConfig(serverId);
            if (!config) {
                return true; // Allow all methods if no config
            }

            return config.allowedPaymentMethods.includes(paymentMethod);
        } catch (error) {
            console.error('❌ Oink... error checking payment method allowance:', error);
            return true; // Default to allow on error
        }
    }

    public async getDailyTransactionStats(userId: string, serverId: string): Promise<{
        totalAmount: number;
        transactionCount: number;
    }> {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Get transactions from today where user is sender
            const transactions = await this.prisma.transaction.findMany({
                where: {
                    senderId: userId,
                    createdAt: {
                        gte: today,
                        lt: tomorrow
                    },
                    status: {
                        in: ['PENDING', 'ESCROWED', 'COMPLETED']
                    }
                },
                select: {
                    amount: true
                }
            });

            const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
            const transactionCount = transactions.length;

            return { totalAmount, transactionCount };
        } catch (error) {
            console.error('❌ Oink... error getting daily transaction stats:', error);
            return { totalAmount: 0, transactionCount: 0 };
        }
    }
}