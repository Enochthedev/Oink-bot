import { vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables for testing
vi.mock('../config/environment', () => ({
    config: {
        DISCORD_TOKEN: 'mock-discord-token',
        DISCORD_CLIENT_ID: 'mock-client-id',
        DATABASE_URL: 'file:./test.db',
        ENCRYPTION_KEY: 'test-encryption-key-that-is-long-enough-for-security-testing-purposes',
        NODE_ENV: 'test',
    }
}));

// Mock Discord.js to avoid requiring actual Discord connection
vi.mock('discord.js', async () => {
    const actual = await vi.importActual('discord.js');
    return {
        ...actual,
        Client: vi.fn().mockImplementation(() => ({
            login: vi.fn().mockResolvedValue('mock-token'),
            destroy: vi.fn().mockResolvedValue(undefined),
            on: vi.fn(),
            once: vi.fn(),
            off: vi.fn(),
            user: { id: 'mock-bot-id' },
            guilds: {
                cache: new Map(),
                fetch: vi.fn(),
            },
            channels: {
                cache: new Map(),
                fetch: vi.fn(),
            },
            users: {
                cache: new Map(),
                fetch: vi.fn(),
            },
        })),
        GatewayIntentBits: {
            Guilds: 1,
            GuildMessages: 2,
            MessageContent: 4,
            DirectMessages: 8,
        },
        REST: vi.fn().mockImplementation(() => ({
            setToken: vi.fn(),
            put: vi.fn().mockResolvedValue([]),
        })),
        Routes: {
            applicationGuildCommands: vi.fn(),
            applicationCommands: vi.fn(),
        },
        SlashCommandBuilder: vi.fn().mockImplementation(() => ({
            setName: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            addUserOption: vi.fn().mockReturnThis(),
            addNumberOption: vi.fn().mockReturnThis(),
            addStringOption: vi.fn().mockReturnThis(),
            addBooleanOption: vi.fn().mockReturnThis(),
            toJSON: vi.fn().mockReturnValue({}),
        })),
        EmbedBuilder: vi.fn().mockImplementation(() => ({
            setTitle: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            setColor: vi.fn().mockReturnThis(),
            addFields: vi.fn().mockReturnThis(),
            setTimestamp: vi.fn().mockReturnThis(),
            setFooter: vi.fn().mockReturnThis(),
            toJSON: vi.fn().mockReturnValue({}),
        })),
        ActionRowBuilder: vi.fn().mockImplementation(() => ({
            addComponents: vi.fn().mockReturnThis(),
            toJSON: vi.fn().mockReturnValue({}),
        })),
        ButtonBuilder: vi.fn().mockImplementation(() => ({
            setCustomId: vi.fn().mockReturnThis(),
            setLabel: vi.fn().mockReturnThis(),
            setStyle: vi.fn().mockReturnThis(),
            setEmoji: vi.fn().mockReturnThis(),
            toJSON: vi.fn().mockReturnValue({}),
        })),
        StringSelectMenuBuilder: vi.fn().mockImplementation(() => ({
            setCustomId: vi.fn().mockReturnThis(),
            setPlaceholder: vi.fn().mockReturnThis(),
            addOptions: vi.fn().mockReturnThis(),
            toJSON: vi.fn().mockReturnValue({}),
        })),
        ButtonStyle: {
            Primary: 1,
            Secondary: 2,
            Success: 3,
            Danger: 4,
            Link: 5,
        },
        ComponentType: {
            ActionRow: 1,
            Button: 2,
            StringSelect: 3,
        },
    };
});

// Mock external payment processors
vi.mock('../processors/ACHPaymentProcessor', () => ({
    ACHPaymentProcessor: vi.fn().mockImplementation(() => ({
        validatePaymentMethod: vi.fn().mockResolvedValue(true),
        withdrawFunds: vi.fn().mockResolvedValue({
            success: true,
            transactionId: 'mock-ach-tx-id',
            amount: 0,
            fees: { processingFee: 0.30, networkFee: 0, totalFees: 0.30 },
        }),
        depositFunds: vi.fn().mockResolvedValue({
            success: true,
            transactionId: 'mock-ach-deposit-id',
            amount: 0,
        }),
        getProcessingTime: vi.fn().mockResolvedValue({
            estimated: '1-3 business days',
            minimum: 24 * 60 * 60 * 1000, // 1 day
            maximum: 3 * 24 * 60 * 60 * 1000, // 3 days
        }),
        calculateFees: vi.fn().mockResolvedValue({
            processingFee: 0.30,
            networkFee: 0,
            totalFees: 0.30,
        }),
    })),
}));

vi.mock('../processors/CryptoPaymentProcessor', () => ({
    CryptoPaymentProcessor: vi.fn().mockImplementation(() => ({
        validatePaymentMethod: vi.fn().mockResolvedValue(true),
        withdrawFunds: vi.fn().mockResolvedValue({
            success: true,
            transactionId: 'mock-crypto-tx-id',
            amount: 0,
            fees: { processingFee: 0, networkFee: 0.0001, totalFees: 0.0001 },
        }),
        depositFunds: vi.fn().mockResolvedValue({
            success: true,
            transactionId: 'mock-crypto-deposit-id',
            amount: 0,
        }),
        getProcessingTime: vi.fn().mockResolvedValue({
            estimated: '10-30 minutes',
            minimum: 10 * 60 * 1000, // 10 minutes
            maximum: 30 * 60 * 1000, // 30 minutes
        }),
        calculateFees: vi.fn().mockResolvedValue({
            processingFee: 0,
            networkFee: 0.0001,
            totalFees: 0.0001,
        }),
    })),
}));

// Global test setup
beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Reset console methods to avoid spam in tests
    vi.spyOn(console, 'log').mockImplementation(() => { });
    vi.spyOn(console, 'warn').mockImplementation(() => { });
    vi.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(() => {
    // Restore console methods after each test
    vi.restoreAllMocks();
});

// Global error handler for unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Global error handler for uncaught exceptions in tests
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Increase timeout for async operations in tests
vi.setConfig({
    testTimeout: 30000,
    hookTimeout: 10000,
});

export { };