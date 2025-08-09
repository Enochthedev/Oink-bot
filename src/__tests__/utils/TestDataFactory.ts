import { vi } from 'vitest';
import { User, Guild, TextChannel, CommandInteraction, ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import { PaymentMethodType } from '../../models/UserAccount';
import { TransactionStatus } from '../../models/Transaction';

/**
 * Test Data Factory
 * Utility class for creating test data and mock Discord objects
 */
export class TestDataFactory {
    constructor(private prisma: any) { }

    /**
     * Create a mock Discord user
     */
    async createMockUser(username: string, id?: string): Promise<User> {
        const userId = id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        return {
            id: userId,
            username,
            displayName: username,
            tag: `${username}#0001`,
            discriminator: '0001',
            avatar: null,
            bot: false,
            system: false,
            flags: null,
            send: vi.fn().mockResolvedValue({}),
            createDM: vi.fn().mockResolvedValue({}),
            toString: () => `<@${userId}>`,
        } as any;
    }

    /**
     * Create a mock Discord guild
     */
    async createMockGuild(name: string = 'Test Guild', id?: string): Promise<Guild> {
        const guildId = id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        return {
            id: guildId,
            name,
            ownerId: 'owner-id',
            memberCount: 100,
            channels: {
                cache: new Map(),
                create: vi.fn(),
                fetch: vi.fn(),
            },
            members: {
                cache: new Map(),
                fetch: vi.fn(),
            },
            roles: {
                cache: new Map(),
                create: vi.fn(),
            },
            toString: () => name,
        } as any;
    }

    /**
     * Create a mock Discord text channel
     */
    async createMockChannel(guild: Guild, name: string = 'test-channel', id?: string): Promise<TextChannel> {
        const channelId = id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        return {
            id: channelId,
            name,
            type: 0, // GUILD_TEXT
            guild,
            guildId: guild.id,
            send: vi.fn().mockResolvedValue({}),
            bulkDelete: vi.fn(),
            toString: () => `#${name}`,
        } as any;
    }

    /**
     * Create a mock command interaction
     */
    async createMockCommandInteraction(
        commandName: string,
        user: User,
        guild: Guild,
        options: any = {}
    ): Promise<CommandInteraction> {
        return {
            commandName,
            user,
            guild,
            guildId: guild.id,
            channelId: 'channel-id',
            id: `interaction-${Date.now()}`,
            token: 'mock-token',
            options: {
                getUser: vi.fn((name: string) => options.user),
                getNumber: vi.fn((name: string) => options.amount),
                getString: vi.fn((name: string) => options.description),
                getBoolean: vi.fn((name: string) => options[name]),
                ...options,
            },
            deferReply: vi.fn().mockResolvedValue({}),
            reply: vi.fn().mockResolvedValue({}),
            followUp: vi.fn().mockResolvedValue({}),
            editReply: vi.fn().mockResolvedValue({}),
            deleteReply: vi.fn().mockResolvedValue({}),
            replied: false,
            deferred: false,
            ephemeral: false,
            isChatInputCommand: vi.fn().mockReturnValue(true),
        } as any;
    }

    /**
     * Create a mock button interaction
     */
    async createMockButtonInteraction(
        customId: string,
        user: User,
        guild: Guild
    ): Promise<ButtonInteraction> {
        return {
            customId,
            user,
            guild,
            guildId: guild.id,
            channelId: 'channel-id',
            id: `button-${Date.now()}`,
            token: 'mock-token',
            componentType: 2, // BUTTON
            update: vi.fn().mockResolvedValue({}),
            reply: vi.fn().mockResolvedValue({}),
            followUp: vi.fn().mockResolvedValue({}),
            editReply: vi.fn().mockResolvedValue({}),
            deferUpdate: vi.fn().mockResolvedValue({}),
            deferReply: vi.fn().mockResolvedValue({}),
            replied: false,
            deferred: false,
        } as any;
    }

    /**
     * Create a mock select menu interaction
     */
    async createMockSelectMenuInteraction(
        customId: string,
        user: User,
        guild: Guild,
        values: string[]
    ): Promise<StringSelectMenuInteraction> {
        return {
            customId,
            user,
            guild,
            guildId: guild.id,
            channelId: 'channel-id',
            id: `select-${Date.now()}`,
            token: 'mock-token',
            componentType: 3, // SELECT_MENU
            values,
            update: vi.fn().mockResolvedValue({}),
            reply: vi.fn().mockResolvedValue({}),
            followUp: vi.fn().mockResolvedValue({}),
            editReply: vi.fn().mockResolvedValue({}),
            deferUpdate: vi.fn().mockResolvedValue({}),
            deferReply: vi.fn().mockResolvedValue({}),
            replied: false,
            deferred: false,
        } as any;
    }

    /**
     * Create a user account in the database
     */
    async createUserAccount(discordId: string): Promise<any> {
        return await this.prisma.userAccount.create({
            data: {
                discordId,
                transactionHistoryJson: '[]',
                enableDMNotifications: true,
                enableChannelNotifications: false,
                isSetupComplete: false,
                isPublicProfile: false,
            },
        });
    }

    /**
     * Add a payment method to a user
     */
    async addPaymentMethodToUser(
        discordId: string,
        type: PaymentMethodType,
        details: any
    ): Promise<any> {
        const user = await this.prisma.userAccount.findUnique({
            where: { discordId },
        });

        if (!user) {
            throw new Error(`User ${discordId} not found`);
        }

        return await this.prisma.paymentMethodConfig.create({
            data: {
                userId: user.id,
                type,
                displayName: `Test ${type.toUpperCase()} Method`,
                encryptedDetails: JSON.stringify(details),
                isActive: true,
            },
        });
    }

    /**
     * Create a transaction in the database
     */
    async createTransaction(
        senderId: string,
        recipientId: string,
        amount: number,
        status: TransactionStatus
    ): Promise<any> {
        const sender = await this.prisma.userAccount.findUnique({
            where: { discordId: senderId },
        });

        const recipient = await this.prisma.userAccount.findUnique({
            where: { discordId: recipientId },
        });

        if (!sender || !recipient) {
            throw new Error('Sender or recipient not found');
        }

        // Get or create a payment method for the sender
        let senderPaymentMethod = await this.prisma.paymentMethodConfig.findFirst({
            where: { user: { discordId: senderId } },
        });

        if (!senderPaymentMethod) {
            senderPaymentMethod = await this.addPaymentMethodToUser(senderId, 'CRYPTO' as any, {
                walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
                network: 'bitcoin',
            });
        }

        const transaction = await this.prisma.transaction.create({
            data: {
                senderId,
                recipientId,
                amount,
                currency: 'USD',
                senderPaymentMethodId: senderPaymentMethod.id,
                status,
                processingFee: 0.30,
                escrowFee: 0.00,
                totalFees: 0.30,
                completedAt: status === TransactionStatus.COMPLETED ? new Date() : null,
            },
        });

        // Update user transaction histories (stored as JSON)
        const senderAccount = await this.prisma.userAccount.findUnique({
            where: { discordId: senderId },
        });
        const recipientAccount = await this.prisma.userAccount.findUnique({
            where: { discordId: recipientId },
        });

        if (senderAccount) {
            const senderHistory = JSON.parse(senderAccount.transactionHistoryJson);
            senderHistory.push(transaction.id);
            await this.prisma.userAccount.update({
                where: { discordId: senderId },
                data: {
                    transactionHistoryJson: JSON.stringify(senderHistory),
                },
            });
        }

        if (recipientAccount) {
            const recipientHistory = JSON.parse(recipientAccount.transactionHistoryJson);
            recipientHistory.push(transaction.id);
            await this.prisma.userAccount.update({
                where: { discordId: recipientId },
                data: {
                    transactionHistoryJson: JSON.stringify(recipientHistory),
                },
            });
        }

        return transaction;
    }

    /**
     * Create a server configuration
     */
    async createServerConfig(
        serverId: string,
        config: {
            adminUserIds?: string[];
            paymentsEnabled?: boolean;
            maxAmountPerUser?: number;
            maxTransactionsPerUser?: number;
        }
    ): Promise<any> {
        return await this.prisma.serverConfig.create({
            data: {
                serverId,
                paymentsEnabled: config.paymentsEnabled ?? true,
                maxAmountPerUser: config.maxAmountPerUser ?? 1000.00,
                maxTransactionsPerUser: config.maxTransactionsPerUser ?? 10,
                allowedPaymentMethodsJson: JSON.stringify(['crypto', 'ach', 'other']),
                adminUserIdsJson: JSON.stringify(config.adminUserIds ?? []),
            },
        });
    }

    /**
     * Create a payment request
     */
    async createPaymentRequest(
        requesterId: string,
        payerId: string,
        amount: number,
        description: string
    ): Promise<any> {
        return await this.prisma.paymentRequest.create({
            data: {
                requesterId,
                payerId,
                amount,
                currency: 'USD',
                description,
                status: 'pending',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
                createdAt: new Date(),
            },
        });
    }

    /**
     * Create an escrow record
     */
    async createEscrowRecord(
        transactionId: string,
        amount: number,
        paymentMethod: PaymentMethodType
    ): Promise<any> {
        return await this.prisma.escrowRecord.create({
            data: {
                transactionId,
                amount,
                currency: 'USD',
                paymentMethod,
                externalTransactionId: `ext-${Date.now()}`,
                status: 'holding',
                createdAt: new Date(),
            },
        });
    }

    /**
     * Create an audit log entry
     */
    async createAuditLog(
        eventType: string,
        userId: string,
        details: any,
        severity: string = 'INFO'
    ): Promise<any> {
        return await this.prisma.auditLog.create({
            data: {
                eventType,
                userId,
                details,
                severity,
                timestamp: new Date(),
            },
        });
    }

    /**
     * Generate random test data
     */
    generateRandomAmount(min: number = 1, max: number = 100): number {
        return Math.round((Math.random() * (max - min) + min) * 100) / 100;
    }

    generateRandomDiscordId(): string {
        return Math.floor(Math.random() * 900000000000000000 + 100000000000000000).toString();
    }

    generateRandomString(length: number = 10): string {
        return Math.random().toString(36).substring(2, 2 + length);
    }

    /**
     * Create bulk test data for performance testing
     */
    async createBulkUsers(count: number, prefix: string = 'bulk-user'): Promise<string[]> {
        const users = [];

        for (let i = 0; i < count; i++) {
            const userId = `${prefix}-${i}`;
            await this.createUserAccount(userId);
            users.push(userId);
        }

        return users;
    }

    async createBulkTransactions(
        userIds: string[],
        transactionsPerUser: number = 5
    ): Promise<any[]> {
        const transactions = [];

        for (const userId of userIds) {
            for (let i = 0; i < transactionsPerUser; i++) {
                const recipientId = userIds[Math.floor(Math.random() * userIds.length)];
                if (recipientId !== userId) {
                    const transaction = await this.createTransaction(
                        userId,
                        recipientId,
                        this.generateRandomAmount(),
                        Math.random() > 0.5 ? TransactionStatus.COMPLETED : TransactionStatus.PENDING
                    );
                    transactions.push(transaction);
                }
            }
        }

        return transactions;
    }
}