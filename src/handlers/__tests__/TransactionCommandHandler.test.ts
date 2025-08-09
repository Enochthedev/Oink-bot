// Unit tests for TransactionCommandHandler
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import {
    CommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    User,
    CommandInteractionOptionResolver
} from 'discord.js';
import { TransactionCommandHandlerImpl } from '../transactions/TransactionCommandHandler';
import { PaymentService } from '../../services/PaymentService';
import { UserAccountService } from '../../services/UserAccountService';
import { Transaction, TransactionStatus, createFeeBreakdown } from '../../models/Transaction';
import { UserAccount, PaymentMethodType } from '../../models/UserAccount';

// Mock Discord.js
vi.mock('discord.js', async () => {
    const actual = await vi.importActual('discord.js');
    return {
        ...actual,
        EmbedBuilder: vi.fn().mockImplementation(() => ({
            setTitle: vi.fn().mockReturnThis(),
            setColor: vi.fn().mockReturnThis(),
            setTimestamp: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            addFields: vi.fn().mockReturnThis(),
            setFooter: vi.fn().mockReturnThis(),
        })),
        ActionRowBuilder: vi.fn().mockImplementation(() => ({
            addComponents: vi.fn().mockReturnThis(),
        })),
        ButtonBuilder: vi.fn().mockImplementation(() => ({
            setCustomId: vi.fn().mockReturnThis(),
            setLabel: vi.fn().mockReturnThis(),
            setStyle: vi.fn().mockReturnThis(),
            setEmoji: vi.fn().mockReturnThis(),
        })),
        StringSelectMenuBuilder: vi.fn().mockImplementation(() => ({
            setCustomId: vi.fn().mockReturnThis(),
            setPlaceholder: vi.fn().mockReturnThis(),
            addOptions: vi.fn().mockReturnThis(),
        })),
        ButtonStyle: {
            Primary: 1,
            Secondary: 2,
            Success: 3,
            Danger: 4,
        },
    };
});

describe('TransactionCommandHandler', () => {
    let handler: TransactionCommandHandlerImpl;
    let mockPaymentService: PaymentService;
    let mockUserAccountService: UserAccountService;
    let mockInteraction: CommandInteraction;
    let mockButtonInteraction: ButtonInteraction;
    let mockSelectMenuInteraction: StringSelectMenuInteraction;

    const mockUser: Partial<User> = {
        id: 'user123',
        username: 'testuser',
    };

    const mockUserAccount: UserAccount = {
        discordId: 'user123',
        paymentMethods: [
            {
                id: 'pm1',
                type: 'crypto' as PaymentMethodType,
                displayName: 'Bitcoin Wallet',
                encryptedDetails: 'encrypted_details',
                isActive: true,
                addedAt: new Date(),
            }
        ],
        transactionHistory: ['tx1', 'tx2'],
        notificationPreferences: {
            enableDMNotifications: true,
            enableChannelNotifications: false,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockTransaction: Transaction = {
        id: 'tx1',
        senderId: 'user123',
        recipientId: 'user456',
        amount: 100.00,
        currency: 'USD',
        senderPaymentMethod: mockUserAccount.paymentMethods[0],
        status: TransactionStatus.COMPLETED,
        fees: createFeeBreakdown(2.50, 1.00),
        createdAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:05:00Z'),
    };

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Mock services
        mockPaymentService = {
            getTransactionHistory: vi.fn(),
            getTransaction: vi.fn(),
            initiatePayment: vi.fn(),
            processPaymentRequest: vi.fn(),
            validatePaymentLimits: vi.fn(),
            updateTransactionStatus: vi.fn(),
            selectPaymentMethod: vi.fn(),
            calculateTransactionFees: vi.fn(),
        };

        mockUserAccountService = {
            getAccount: vi.fn(),
            createAccount: vi.fn(),
            addPaymentMethod: vi.fn(),
            removePaymentMethod: vi.fn(),
            updateNotificationPreferences: vi.fn(),
            getPaymentMethods: vi.fn(),
        };

        // Mock interactions
        mockInteraction = {
            user: mockUser as User,
            options: {
                get: vi.fn(),
            } as unknown as CommandInteractionOptionResolver,
            deferReply: vi.fn(),
            editReply: vi.fn(),
            reply: vi.fn(),
            deferred: false,
        } as unknown as CommandInteraction;

        mockButtonInteraction = {
            user: mockUser as User,
            customId: 'transaction_detail_tx1',
            deferReply: vi.fn(),
            editReply: vi.fn(),
            reply: vi.fn(),
        } as unknown as ButtonInteraction;

        mockSelectMenuInteraction = {
            user: mockUser as User,
            customId: 'transaction_filter_user123',
            values: ['sent'],
            deferReply: vi.fn(),
            editReply: vi.fn(),
            reply: vi.fn(),
        } as unknown as StringSelectMenuInteraction;

        handler = new TransactionCommandHandlerImpl(mockPaymentService, mockUserAccountService);
    });

    describe('getCommandName', () => {
        it('should return correct command name', () => {
            expect(handler.getCommandName()).toBe('transactions');
        });
    });

    describe('validateParameters', () => {
        it('should validate valid parameters', () => {
            (mockInteraction.options.get as Mock).mockReturnValue({ value: 10 });
            expect(handler.validateParameters(mockInteraction)).toBe(true);
        });

        it('should validate when no limit is provided', () => {
            (mockInteraction.options.get as Mock).mockReturnValue(null);
            expect(handler.validateParameters(mockInteraction)).toBe(true);
        });

        it('should reject invalid limit values', () => {
            (mockInteraction.options.get as Mock).mockReturnValue({ value: 0 });
            expect(handler.validateParameters(mockInteraction)).toBe(false);

            (mockInteraction.options.get as Mock).mockReturnValue({ value: 100 });
            expect(handler.validateParameters(mockInteraction)).toBe(false);

            (mockInteraction.options.get as Mock).mockReturnValue({ value: -5 });
            expect(handler.validateParameters(mockInteraction)).toBe(false);
        });
    });

    describe('handleTransactionsCommand', () => {
        beforeEach(() => {
            (mockInteraction.options.get as Mock).mockReturnValue({ value: 10 });
        });

        it('should handle successful transaction history retrieval', async () => {
            (mockUserAccountService.getAccount as Mock).mockResolvedValue(mockUserAccount);
            (mockPaymentService.getTransactionHistory as Mock).mockResolvedValue([mockTransaction]);

            await handler.handleTransactionsCommand(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockUserAccountService.getAccount).toHaveBeenCalledWith('user123');
            expect(mockPaymentService.getTransactionHistory).toHaveBeenCalledWith('user123', 10);
            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                embeds: expect.any(Array),
                components: expect.any(Array),
            });
        });

        it('should handle user without account', async () => {
            (mockUserAccountService.getAccount as Mock).mockResolvedValue(null);

            await handler.handleTransactionsCommand(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ You don\'t have a payment account set up yet. Use `/setup-payment` to get started.',
            });
        });

        it('should handle empty transaction history', async () => {
            (mockUserAccountService.getAccount as Mock).mockResolvedValue(mockUserAccount);
            (mockPaymentService.getTransactionHistory as Mock).mockResolvedValue([]);

            await handler.handleTransactionsCommand(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: '📊 You have no transaction history yet.',
            });
        });

        it('should handle service errors', async () => {
            (mockUserAccountService.getAccount as Mock).mockRejectedValue(new Error('Database error'));
            mockInteraction.deferred = true; // Set deferred to true to match the error handling path

            await handler.handleTransactionsCommand(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Failed to retrieve transaction history: Database error',
            });
        });

        it('should use default limit when none provided', async () => {
            (mockInteraction.options.get as Mock).mockReturnValue(null);
            (mockUserAccountService.getAccount as Mock).mockResolvedValue(mockUserAccount);
            (mockPaymentService.getTransactionHistory as Mock).mockResolvedValue([mockTransaction]);

            await handler.handleTransactionsCommand(mockInteraction);

            expect(mockPaymentService.getTransactionHistory).toHaveBeenCalledWith('user123', 10);
        });
    });

    describe('handleTransactionDetailView', () => {
        it('should handle successful transaction detail retrieval', async () => {
            (mockPaymentService.getTransaction as Mock).mockResolvedValue(mockTransaction);

            await handler.handleTransactionDetailView(mockButtonInteraction);

            expect(mockButtonInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockPaymentService.getTransaction).toHaveBeenCalledWith('tx1');
            expect(mockButtonInteraction.editReply).toHaveBeenCalledWith({
                embeds: expect.any(Array),
            });
        });

        it('should handle transaction not found', async () => {
            (mockPaymentService.getTransaction as Mock).mockResolvedValue(null);

            await handler.handleTransactionDetailView(mockButtonInteraction);

            expect(mockButtonInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Transaction not found.',
            });
        });

        it('should handle unauthorized access', async () => {
            const unauthorizedTransaction = { ...mockTransaction, senderId: 'other_user', recipientId: 'another_user' };
            (mockPaymentService.getTransaction as Mock).mockResolvedValue(unauthorizedTransaction);

            await handler.handleTransactionDetailView(mockButtonInteraction);

            expect(mockButtonInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ You don\'t have permission to view this transaction.',
            });
        });

        it('should handle service errors', async () => {
            (mockPaymentService.getTransaction as Mock).mockRejectedValue(new Error('Database error'));

            await handler.handleTransactionDetailView(mockButtonInteraction);

            expect(mockButtonInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Failed to load transaction details: Database error',
            });
        });
    });

    describe('handleTransactionExport', () => {
        it('should handle successful transaction export', async () => {
            (mockPaymentService.getTransactionHistory as Mock).mockResolvedValue([mockTransaction]);

            await handler.handleTransactionExport(mockButtonInteraction);

            expect(mockButtonInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockPaymentService.getTransactionHistory).toHaveBeenCalledWith('user123', 100);
            expect(mockButtonInteraction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Here\'s your transaction history export'),
                files: expect.arrayContaining([
                    expect.objectContaining({
                        attachment: expect.any(Buffer),
                        name: expect.stringMatching(/transactions_user123_\d{4}-\d{2}-\d{2}\.csv/),
                    })
                ])
            });
        });

        it('should handle empty transaction history for export', async () => {
            (mockPaymentService.getTransactionHistory as Mock).mockResolvedValue([]);

            await handler.handleTransactionExport(mockButtonInteraction);

            expect(mockButtonInteraction.editReply).toHaveBeenCalledWith({
                content: '📊 You have no transactions to export.',
            });
        });

        it('should handle export errors', async () => {
            (mockPaymentService.getTransactionHistory as Mock).mockRejectedValue(new Error('Database error'));

            await handler.handleTransactionExport(mockButtonInteraction);

            expect(mockButtonInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Failed to export transactions: Database error',
            });
        });
    });

    describe('handleTransactionFilter', () => {
        it('should handle sent transactions filter', async () => {
            const sentTransaction = { ...mockTransaction, senderId: 'user123', recipientId: 'user456' };
            (mockPaymentService.getTransactionHistory as Mock).mockResolvedValue([sentTransaction]);

            await handler.handleTransactionFilter(mockSelectMenuInteraction);

            expect(mockSelectMenuInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockPaymentService.getTransactionHistory).toHaveBeenCalledWith('user123', 100);
            expect(mockSelectMenuInteraction.editReply).toHaveBeenCalledWith({
                embeds: expect.any(Array),
                components: expect.any(Array),
            });
        });

        it('should handle received transactions filter', async () => {
            mockSelectMenuInteraction.values = ['received'];
            const receivedTransaction = { ...mockTransaction, senderId: 'user456', recipientId: 'user123' };
            (mockPaymentService.getTransactionHistory as Mock).mockResolvedValue([receivedTransaction]);

            await handler.handleTransactionFilter(mockSelectMenuInteraction);

            expect(mockSelectMenuInteraction.editReply).toHaveBeenCalledWith({
                embeds: expect.any(Array),
                components: expect.any(Array),
            });
        });

        it('should handle status filters', async () => {
            mockSelectMenuInteraction.values = ['pending'];
            const pendingTransaction = { ...mockTransaction, status: TransactionStatus.PENDING };
            (mockPaymentService.getTransactionHistory as Mock).mockResolvedValue([pendingTransaction]);

            await handler.handleTransactionFilter(mockSelectMenuInteraction);

            expect(mockSelectMenuInteraction.editReply).toHaveBeenCalledWith({
                embeds: expect.any(Array),
                components: expect.any(Array),
            });
        });

        it('should handle empty filtered results', async () => {
            (mockPaymentService.getTransactionHistory as Mock).mockResolvedValue([]);

            await handler.handleTransactionFilter(mockSelectMenuInteraction);

            expect(mockSelectMenuInteraction.editReply).toHaveBeenCalledWith({
                content: '📊 No transactions found for filter: Sent Payments',
            });
        });

        it('should handle filter errors', async () => {
            (mockPaymentService.getTransactionHistory as Mock).mockRejectedValue(new Error('Database error'));

            await handler.handleTransactionFilter(mockSelectMenuInteraction);

            expect(mockSelectMenuInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Failed to filter transactions: Database error',
            });
        });
    });

    describe('CSV Export Functionality', () => {
        it('should generate proper CSV format', async () => {
            const transactions = [
                mockTransaction,
                {
                    ...mockTransaction,
                    id: 'tx2',
                    senderId: 'user456',
                    recipientId: 'user123',
                    amount: 50.00,
                    status: TransactionStatus.PENDING,
                }
            ];

            (mockPaymentService.getTransactionHistory as Mock).mockResolvedValue(transactions);

            await handler.handleTransactionExport(mockButtonInteraction);

            const call = (mockButtonInteraction.editReply as Mock).mock.calls[0][0];
            const csvBuffer = call.files[0].attachment;
            const csvContent = csvBuffer.toString('utf-8');

            // Check CSV headers (they are quoted in the actual CSV)
            expect(csvContent).toContain('"Transaction ID","Date","Type","Amount","Currency"');

            // Check CSV data
            expect(csvContent).toContain('tx1');
            expect(csvContent).toContain('SENT');
            expect(csvContent).toContain('100');
            expect(csvContent).toContain('COMPLETED');
        });

        it('should handle special characters in CSV', async () => {
            const transactionWithSpecialChars = {
                ...mockTransaction,
                failureReason: 'Error with "quotes" and, commas',
            };

            (mockPaymentService.getTransactionHistory as Mock).mockResolvedValue([transactionWithSpecialChars]);

            await handler.handleTransactionExport(mockButtonInteraction);

            const call = (mockButtonInteraction.editReply as Mock).mock.calls[0][0];
            const csvBuffer = call.files[0].attachment;
            const csvContent = csvBuffer.toString('utf-8');

            // Check that quotes are properly escaped
            expect(csvContent).toContain('"Error with ""quotes"" and, commas"');
        });
    });

    describe('Edge Cases', () => {
        it('should handle very large transaction amounts', async () => {
            const largeTransaction = { ...mockTransaction, amount: 999999.99 };
            (mockUserAccountService.getAccount as Mock).mockResolvedValue(mockUserAccount);
            (mockPaymentService.getTransactionHistory as Mock).mockResolvedValue([largeTransaction]);

            await handler.handleTransactionsCommand(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                embeds: expect.any(Array),
                components: expect.any(Array),
            });
        });

        it('should handle transactions with missing optional fields', async () => {
            const minimalTransaction = {
                ...mockTransaction,
                recipientPaymentMethod: undefined,
                completedAt: undefined,
                failureReason: undefined,
                escrowRecord: undefined,
            };

            (mockPaymentService.getTransaction as Mock).mockResolvedValue(minimalTransaction);

            await handler.handleTransactionDetailView(mockButtonInteraction);

            expect(mockButtonInteraction.editReply).toHaveBeenCalledWith({
                embeds: expect.any(Array),
            });
        });

        it('should handle malformed custom IDs gracefully', async () => {
            mockButtonInteraction.customId = 'transaction_detail_';

            await handler.handleTransactionDetailView(mockButtonInteraction);

            expect(mockPaymentService.getTransaction).toHaveBeenCalledWith('');
        });
    });
});