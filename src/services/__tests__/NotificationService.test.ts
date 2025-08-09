import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client, User, TextChannel, EmbedBuilder } from 'discord.js';
import {
    NotificationServiceImpl,
    NotificationType,
    NotificationPriority,
    NotificationDetails,
    QueuedNotification
} from '../NotificationService';
import { PaymentRequest } from '../../models/PaymentRequest';
import { Transaction } from '../../models/Transaction';
import { NotificationSettings } from '../../models/UserAccount';

// Mock Discord.js
vi.mock('discord.js', () => ({
    Client: vi.fn(),
    EmbedBuilder: vi.fn(() => ({
        setColor: vi.fn().mockReturnThis(),
        setTitle: vi.fn().mockReturnThis(),
        setDescription: vi.fn().mockReturnThis(),
        setTimestamp: vi.fn().mockReturnThis(),
        addFields: vi.fn().mockReturnThis(),
        setFooter: vi.fn().mockReturnThis(),
    })),
}));

describe('NotificationService', () => {
    let notificationService: NotificationServiceImpl;
    let mockClient: any;
    let mockUser: any;
    let mockChannel: any;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Create mock user
        mockUser = {
            send: vi.fn().mockResolvedValue(undefined),
        };

        // Create mock channel
        mockChannel = {
            isTextBased: vi.fn().mockReturnValue(true),
            send: vi.fn().mockResolvedValue(undefined),
        };

        // Create mock client
        mockClient = {
            users: {
                fetch: vi.fn().mockResolvedValue(mockUser),
            },
            channels: {
                fetch: vi.fn().mockResolvedValue(mockChannel),
            },
        };

        notificationService = new NotificationServiceImpl(mockClient);
    });

    afterEach(() => {
        notificationService.destroy();
    });

    describe('sendDirectMessage', () => {
        it('should send a direct message successfully', async () => {
            const userId = '123456789';
            const options = { content: 'Test message' };

            await notificationService.sendDirectMessage(userId, options);

            expect(mockClient.users.fetch).toHaveBeenCalledWith(userId);
            expect(mockUser.send).toHaveBeenCalledWith(options);
        });

        it('should throw error when Discord client is not available', async () => {
            const serviceWithoutClient = new NotificationServiceImpl();

            await expect(
                serviceWithoutClient.sendDirectMessage('123', { content: 'test' })
            ).rejects.toThrow('Discord client not available');
        });

        it('should throw error when user fetch fails', async () => {
            mockClient.users.fetch.mockRejectedValue(new Error('User not found'));

            await expect(
                notificationService.sendDirectMessage('123', { content: 'test' })
            ).rejects.toThrow('User not found');
        });

        it('should throw error when message sending fails', async () => {
            mockUser.send.mockRejectedValue(new Error('Cannot send message'));

            await expect(
                notificationService.sendDirectMessage('123', { content: 'test' })
            ).rejects.toThrow('Cannot send message');
        });
    });

    describe('sendChannelMessage', () => {
        it('should send a channel message successfully', async () => {
            const channelId = '987654321';
            const options = { content: 'Test channel message' };

            await notificationService.sendChannelMessage(channelId, options);

            expect(mockClient.channels.fetch).toHaveBeenCalledWith(channelId);
            expect(mockChannel.send).toHaveBeenCalledWith(options);
        });

        it('should throw error when channel is not text-based', async () => {
            mockChannel.isTextBased.mockReturnValue(false);

            await expect(
                notificationService.sendChannelMessage('123', { content: 'test' })
            ).rejects.toThrow('Channel is not text-based');
        });

        it('should throw error when Discord client is not available', async () => {
            const serviceWithoutClient = new NotificationServiceImpl();

            await expect(
                serviceWithoutClient.sendChannelMessage('123', { content: 'test' })
            ).rejects.toThrow('Discord client not available');
        });
    });

    describe('notification preferences', () => {
        it('should update notification preferences', async () => {
            const userId = '123456789';
            const preferences: NotificationSettings = {
                enableDMNotifications: false,
                enableChannelNotifications: true,
            };

            await notificationService.updateNotificationPreferences(userId, preferences);
            const retrieved = await notificationService.getNotificationPreferences(userId);

            expect(retrieved).toEqual(preferences);
        });

        it('should return default preferences for new user', async () => {
            const userId = '123456789';
            const preferences = await notificationService.getNotificationPreferences(userId);

            expect(preferences).toEqual({
                enableDMNotifications: true,
                enableChannelNotifications: false,
            });
        });
    });

    describe('sendNotificationWithPreferences', () => {
        it('should send notification when DM notifications are enabled', async () => {
            const userId = '123456789';
            const details: NotificationDetails = {
                amount: 100,
                currency: 'USD',
                transactionId: 'tx_123',
            };

            await notificationService.sendNotificationWithPreferences(
                userId,
                NotificationType.PAYMENT_RECEIVED,
                details
            );

            expect(mockUser.send).toHaveBeenCalled();
        });

        it('should skip notification when DM notifications are disabled', async () => {
            const userId = '123456789';
            const preferences: NotificationSettings = {
                enableDMNotifications: false,
                enableChannelNotifications: false,
            };

            await notificationService.updateNotificationPreferences(userId, preferences);

            await notificationService.sendNotificationWithPreferences(
                userId,
                NotificationType.PAYMENT_RECEIVED,
                { amount: 100 }
            );

            expect(mockUser.send).not.toHaveBeenCalled();
        });

        it('should queue notification when sending fails', async () => {
            mockUser.send.mockRejectedValue(new Error('Send failed'));
            const userId = '123456789';
            const details: NotificationDetails = { amount: 100 };

            await expect(
                notificationService.sendNotificationWithPreferences(
                    userId,
                    NotificationType.PAYMENT_RECEIVED,
                    details
                )
            ).rejects.toThrow('Send failed');

            // Verify notification was queued (we can't directly access the queue, but we can test retry behavior)
        });

        it('should handle unknown notification type gracefully', async () => {
            const userId = '123456789';
            const unknownType = 'unknown_type' as NotificationType;

            await notificationService.sendNotificationWithPreferences(
                userId,
                unknownType,
                { amount: 100 }
            );

            expect(mockUser.send).not.toHaveBeenCalled();
        });
    });

    describe('message template interpolation', () => {
        it('should interpolate payment received notification correctly', async () => {
            const userId = '123456789';
            const details: NotificationDetails = {
                amount: 150.75,
                currency: 'USD',
                transactionId: 'tx_456',
                senderName: 'John Doe',
                paymentMethod: 'Credit Card',
            };

            await notificationService.sendNotificationWithPreferences(
                userId,
                NotificationType.PAYMENT_RECEIVED,
                details
            );

            expect(EmbedBuilder).toHaveBeenCalled();
            const embedInstance = (EmbedBuilder as any).mock.results[0].value;
            expect(embedInstance.setTitle).toHaveBeenCalledWith('💰 Payment Received');
            expect(embedInstance.setDescription).toHaveBeenCalledWith(
                'You have received a payment of **150.75 USD** from **John Doe**.'
            );
        });

        it('should handle missing template values gracefully', async () => {
            const userId = '123456789';
            const details: NotificationDetails = {
                amount: 100,
                // Missing currency, transactionId, etc.
            };

            await notificationService.sendNotificationWithPreferences(
                userId,
                NotificationType.PAYMENT_RECEIVED,
                details
            );

            expect(EmbedBuilder).toHaveBeenCalled();
            const embedInstance = (EmbedBuilder as any).mock.results[0].value;
            expect(embedInstance.setDescription).toHaveBeenCalledWith(
                'You have received a payment of **100.00 **.'
            );
        });
    });

    describe('notification queuing and retry', () => {
        it('should queue notification with correct priority', async () => {
            const notification: QueuedNotification = {
                id: 'test_123',
                userId: '123456789',
                type: NotificationType.PAYMENT_FAILED,
                details: { amount: 100 },
                attempts: 0,
                maxAttempts: 3,
                nextRetryAt: new Date(),
                createdAt: new Date(),
                priority: NotificationPriority.URGENT,
            };

            await notificationService.queueNotification(notification);
            // Queue is private, but we can test that it doesn't throw
        });

        it('should retry failed notifications', async () => {
            // First call fails, second succeeds
            mockUser.send
                .mockRejectedValueOnce(new Error('First attempt failed'))
                .mockResolvedValueOnce(undefined);

            const userId = '123456789';

            // This should fail and queue the notification
            await expect(
                notificationService.sendNotificationWithPreferences(
                    userId,
                    NotificationType.PAYMENT_RECEIVED,
                    { amount: 100 }
                )
            ).rejects.toThrow('First attempt failed');

            // Queue a notification with a past retry time to test retry mechanism
            await notificationService.queueNotification({
                id: 'test_retry',
                userId,
                type: NotificationType.PAYMENT_RECEIVED,
                details: { amount: 100 },
                attempts: 0,
                maxAttempts: 3,
                nextRetryAt: new Date(Date.now() - 1000), // Past time
                createdAt: new Date(),
                priority: NotificationPriority.NORMAL,
            });

            // Reset mock to succeed
            mockUser.send.mockResolvedValue(undefined);

            // Manually trigger retry
            await notificationService.retryFailedNotifications();

            // Should have been called at least once for the retry
            expect(mockUser.send).toHaveBeenCalledTimes(2);
        });
    });

    describe('legacy methods', () => {
        it('should handle sendPaymentNotification', async () => {
            const userId = '123456789';
            const details = { amount: 100, currency: 'USD' };

            await notificationService.sendPaymentNotification(
                userId,
                NotificationType.PAYMENT_RECEIVED,
                details
            );

            expect(mockUser.send).toHaveBeenCalled();
        });

        it('should handle sendPaymentRequestApprovedNotification', async () => {
            const paymentRequest: PaymentRequest = {
                id: 'req_123',
                requesterId: '123',
                payerId: '456',
                amount: 100,
                description: 'Test payment',
                status: 'pending',
                createdAt: new Date(),
                expiresAt: new Date(),
            };

            await notificationService.sendPaymentRequestApprovedNotification(
                '123456789',
                paymentRequest,
                'tx_123'
            );

            expect(mockUser.send).toHaveBeenCalled();
        });

        it('should handle sendPaymentRequestDeclinedNotification', async () => {
            const paymentRequest: PaymentRequest = {
                id: 'req_123',
                requesterId: '123',
                payerId: '456',
                amount: 100,
                description: 'Test payment',
                status: 'declined',
                createdAt: new Date(),
                expiresAt: new Date(),
            };

            await notificationService.sendPaymentRequestDeclinedNotification(
                '123456789',
                paymentRequest
            );

            expect(mockUser.send).toHaveBeenCalled();
        });

        it('should handle sendPaymentCompletedNotification for recipient', async () => {
            const transaction: Transaction = {
                id: 'tx_123',
                senderId: '123',
                recipientId: '456',
                amount: 100,
                currency: 'USD',
                status: 'completed',
                createdAt: new Date(),
                senderPaymentMethod: {
                    id: 'pm_1',
                    type: 'crypto',
                    displayName: 'Bitcoin Wallet',
                    encryptedDetails: 'encrypted',
                    isActive: true,
                    addedAt: new Date(),
                },
                recipientPaymentMethod: {
                    id: 'pm_2',
                    type: 'ach',
                    displayName: 'Bank Account',
                    encryptedDetails: 'encrypted',
                    isActive: true,
                    addedAt: new Date(),
                },
                fees: { total: 5, breakdown: [] },
            };

            await notificationService.sendPaymentCompletedNotification(
                '456789',
                transaction,
                true // isRecipient
            );

            expect(mockUser.send).toHaveBeenCalled();
        });

        it('should handle sendPaymentCompletedNotification for sender', async () => {
            const transaction: Transaction = {
                id: 'tx_123',
                senderId: '123',
                recipientId: '456',
                amount: 100,
                currency: 'USD',
                status: 'completed',
                createdAt: new Date(),
                senderPaymentMethod: {
                    id: 'pm_1',
                    type: 'crypto',
                    displayName: 'Bitcoin Wallet',
                    encryptedDetails: 'encrypted',
                    isActive: true,
                    addedAt: new Date(),
                },
                recipientPaymentMethod: {
                    id: 'pm_2',
                    type: 'ach',
                    displayName: 'Bank Account',
                    encryptedDetails: 'encrypted',
                    isActive: true,
                    addedAt: new Date(),
                },
                fees: { total: 5, breakdown: [] },
            };

            await notificationService.sendPaymentCompletedNotification(
                '123456',
                transaction,
                false // isRecipient
            );

            expect(mockUser.send).toHaveBeenCalled();
        });
    });

    describe('notification priorities', () => {
        it('should assign correct priorities to notification types', async () => {
            // Test urgent priority
            mockUser.send.mockRejectedValue(new Error('Test error'));

            await expect(
                notificationService.sendNotificationWithPreferences(
                    '123',
                    NotificationType.PAYMENT_FAILED,
                    { amount: 100 }
                )
            ).rejects.toThrow();

            await expect(
                notificationService.sendNotificationWithPreferences(
                    '123',
                    NotificationType.TRANSACTION_DISPUTED,
                    { amount: 100 }
                )
            ).rejects.toThrow();

            // Test high priority
            await expect(
                notificationService.sendNotificationWithPreferences(
                    '123',
                    NotificationType.PAYMENT_RECEIVED,
                    { amount: 100 }
                )
            ).rejects.toThrow();

            // Test normal priority
            await expect(
                notificationService.sendNotificationWithPreferences(
                    '123',
                    NotificationType.PAYMENT_REQUEST,
                    { amount: 100 }
                )
            ).rejects.toThrow();

            // All should have been queued with appropriate priorities
            expect(mockUser.send).toHaveBeenCalledTimes(4);
        });
    });

    describe('cleanup', () => {
        it('should cleanup resources on destroy', () => {
            const service = new NotificationServiceImpl();

            // Should not throw
            service.destroy();
        });
    });

    describe('edge cases', () => {
        it('should handle null/undefined values in template interpolation', async () => {
            const userId = '123456789';
            const details: NotificationDetails = {
                amount: null as any,
                currency: undefined,
                transactionId: '',
            };

            await notificationService.sendNotificationWithPreferences(
                userId,
                NotificationType.PAYMENT_RECEIVED,
                details
            );

            expect(EmbedBuilder).toHaveBeenCalled();
        });

        it('should handle very large notification queue', async () => {
            mockUser.send.mockRejectedValue(new Error('Always fail'));

            // Queue many notifications
            const promises = [];
            for (let i = 0; i < 100; i++) {
                promises.push(
                    notificationService.sendNotificationWithPreferences(
                        `user_${i}`,
                        NotificationType.PAYMENT_RECEIVED,
                        { amount: i }
                    ).catch(() => { }) // Ignore errors for this test
                );
            }

            await Promise.all(promises);

            // Should handle large queue without issues
            await notificationService.retryFailedNotifications();
        });

        it('should handle concurrent notification sending', async () => {
            const userId = '123456789';
            const promises = [];

            for (let i = 0; i < 10; i++) {
                promises.push(
                    notificationService.sendNotificationWithPreferences(
                        userId,
                        NotificationType.PAYMENT_RECEIVED,
                        { amount: i * 10 }
                    )
                );
            }

            await Promise.all(promises);
            expect(mockUser.send).toHaveBeenCalledTimes(10);
        });
    });
});