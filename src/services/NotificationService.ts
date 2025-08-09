// Notification service interface and implementation
import { Client, MessageCreateOptions, EmbedBuilder } from 'discord.js';
import { PaymentRequest } from '@models/PaymentRequest';
import { Transaction } from '@models/Transaction';
import { NotificationSettings } from '@models/UserAccount';

export interface NotificationService {
  sendDirectMessage(userId: string, options: MessageCreateOptions): Promise<void>;

  sendChannelMessage(channelId: string, options: MessageCreateOptions): Promise<void>;

  sendPaymentNotification(
    userId: string,
    type: NotificationType,
    details: Record<string, unknown>
  ): Promise<void>;

  sendPaymentRequestApprovedNotification(
    requesterId: string,
    paymentRequest: PaymentRequest,
    transactionId: string
  ): Promise<void>;

  sendPaymentRequestDeclinedNotification(
    requesterId: string,
    paymentRequest: PaymentRequest
  ): Promise<void>;

  sendPaymentCompletedNotification(
    userId: string,
    transaction: Transaction,
    isRecipient: boolean
  ): Promise<void>;

  // Enhanced methods for task 14
  sendNotificationWithPreferences(
    userId: string,
    type: NotificationType,
    details: NotificationDetails,
    preferences?: NotificationSettings
  ): Promise<void>;

  queueNotification(notification: QueuedNotification): Promise<void>;

  updateNotificationPreferences(userId: string, preferences: NotificationSettings): Promise<void>;

  getNotificationPreferences(userId: string): Promise<NotificationSettings>;

  retryFailedNotifications(): Promise<void>;
}

export enum NotificationType {
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_SENT = 'payment_sent',
  PAYMENT_REQUEST = 'payment_request',
  PAYMENT_FAILED = 'payment_failed',
  SETUP_REQUIRED = 'setup_required',
  ESCROW_HELD = 'escrow_held',
  ESCROW_RELEASED = 'escrow_released',
  TRANSACTION_DISPUTED = 'transaction_disputed',
  ACCOUNT_SETUP_COMPLETE = 'account_setup_complete'
}

export interface NotificationDetails {
  amount?: number;
  currency?: string;
  transactionId?: string;
  recipientName?: string;
  senderName?: string;
  description?: string;
  reason?: string;
  paymentMethod?: string;
  processingTime?: string;
  fees?: number;
  [key: string]: string | number | undefined;
}

export interface QueuedNotification {
  id: string;
  userId: string;
  type: NotificationType;
  details: NotificationDetails;
  channelId?: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: Date;
  createdAt: Date;
  priority: NotificationPriority;
}

export enum NotificationPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  URGENT = 4
}

export interface MessageTemplate {
  title: string;
  description: string;
  color: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: string;
}

export class NotificationServiceImpl implements NotificationService {
  private client: Client | null = null;
  private notificationQueue: QueuedNotification[] = [];
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private userPreferences: Map<string, NotificationSettings> = new Map();
  private messageTemplates: Map<NotificationType, MessageTemplate> = new Map();

  constructor(client?: Client) {
    this.client = client || null;
    this.initializeMessageTemplates();
    this.startRetryTimer();
  }

  setClient(client: Client): void {
    this.client = client;
  }

  private initializeMessageTemplates(): void {
    this.messageTemplates.set(NotificationType.PAYMENT_RECEIVED, {
      title: '💰 Payment Received',
      description: 'You have received a payment of **{amount} {currency}**{fromUser}.',
      color: 0x00AE86,
      fields: [
        { name: 'Transaction ID', value: '{transactionId}', inline: true },
        { name: 'Payment Method', value: '{paymentMethod}', inline: true }
      ]
    });

    this.messageTemplates.set(NotificationType.PAYMENT_SENT, {
      title: '✅ Payment Sent',
      description: 'Your payment of **{amount} {currency}** has been sent{toUser}.',
      color: 0x4A90E2,
      fields: [
        { name: 'Transaction ID', value: '{transactionId}', inline: true },
        { name: 'Processing Time', value: '{processingTime}', inline: true },
        { name: 'Fees', value: '{fees} {currency}', inline: true }
      ]
    });

    this.messageTemplates.set(NotificationType.PAYMENT_REQUEST, {
      title: '💸 Payment Request',
      description: 'You have received a payment request for **{amount} {currency}**{fromUser}.',
      color: 0xFFB347,
      fields: [
        { name: 'Description', value: '{description}', inline: false },
        { name: 'Expires', value: 'In 24 hours', inline: true }
      ]
    });

    this.messageTemplates.set(NotificationType.PAYMENT_FAILED, {
      title: '❌ Payment Failed',
      description: 'Your payment of **{amount} {currency}** has failed.',
      color: 0xFF6B6B,
      fields: [
        { name: 'Reason', value: '{reason}', inline: false },
        { name: 'Transaction ID', value: '{transactionId}', inline: true }
      ]
    });

    this.messageTemplates.set(NotificationType.SETUP_REQUIRED, {
      title: '⚙️ Setup Required',
      description: 'Please set up your payment methods to continue with transactions.',
      color: 0xFFA500,
      fields: [
        { name: 'Action Required', value: 'Use `/setup-payment` command', inline: false }
      ]
    });

    this.messageTemplates.set(NotificationType.ESCROW_HELD, {
      title: '🔒 Funds Held in Escrow',
      description: 'Your payment of **{amount} {currency}** is being held in escrow until the transaction is completed.',
      color: 0x9B59B6,
      fields: [
        { name: 'Transaction ID', value: '{transactionId}', inline: true },
        { name: 'Recipient', value: '{recipientName}', inline: true }
      ]
    });

    this.messageTemplates.set(NotificationType.ESCROW_RELEASED, {
      title: '🔓 Funds Released from Escrow',
      description: 'The escrowed funds of **{amount} {currency}** have been released and transferred.',
      color: 0x27AE60,
      fields: [
        { name: 'Transaction ID', value: '{transactionId}', inline: true },
        { name: 'Final Amount', value: '{amount} {currency}', inline: true }
      ]
    });

    this.messageTemplates.set(NotificationType.TRANSACTION_DISPUTED, {
      title: '⚠️ Transaction Disputed',
      description: 'A transaction involving **{amount} {currency}** has been disputed.',
      color: 0xE74C3C,
      fields: [
        { name: 'Transaction ID', value: '{transactionId}', inline: true },
        { name: 'Status', value: 'Under Review', inline: true }
      ]
    });

    this.messageTemplates.set(NotificationType.ACCOUNT_SETUP_COMPLETE, {
      title: '✅ Account Setup Complete',
      description: 'Your payment account has been successfully set up and verified.',
      color: 0x2ECC71,
      fields: [
        { name: 'Payment Methods', value: '{paymentMethod}', inline: true },
        { name: 'Status', value: 'Active', inline: true }
      ]
    });
  }

  private startRetryTimer(): void {
    // Check for failed notifications every 30 seconds
    this.retryTimer = setInterval(() => {
      this.retryFailedNotifications().catch(console.error);
    }, 30000);
  }

  private stopRetryTimer(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  async sendDirectMessage(userId: string, options: MessageCreateOptions): Promise<void> {
    if (!this.client) {
              console.warn('⚠️ Oink... Discord client not available for sending DM 🐷');
      throw new Error('Discord client not available');
    }

    try {
      const user = await this.client.users.fetch(userId);
      await user.send(options);
    } catch (error) {
              console.error(`❌ Oink... failed to send DM to user ${userId}:`, error);
      throw error; // Re-throw for retry mechanism
    }
  }

  async sendChannelMessage(channelId: string, options: MessageCreateOptions): Promise<void> {
    if (!this.client) {
              console.warn('⚠️ Oink... Discord client not available for sending channel message 🐷');
      throw new Error('Discord client not available');
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel && channel.isTextBased() && !channel.isDMBased()) {
        await channel.send(options);
      } else {
        throw new Error('Channel is not a text-based guild channel or is inaccessible.');
      }
    } catch (error) {
              console.error(`❌ Oink... failed to send message to channel ${channelId}:`, error);
      throw error; // Re-throw for retry mechanism
    }
  }

  async sendNotificationWithPreferences(
    userId: string,
    type: NotificationType,
    details: NotificationDetails,
    preferences?: NotificationSettings
  ): Promise<void> {
    const userPrefs = preferences || await this.getNotificationPreferences(userId);

    if (!userPrefs.enableDMNotifications) {
              console.log(`🐷 Oink! DM notifications disabled for user ${userId}, skipping notification 🐽`);
      return;
    }

    const template = this.messageTemplates.get(type);
    if (!template) {
              console.warn(`⚠️ Oink... no template found for notification type: ${type} 🐷`);
      return;
    }

    const embed = this.buildEmbedFromTemplate(template, details);

    try {
      await this.sendDirectMessage(userId, { embeds: [embed] });
    } catch (error) {
      // Queue for retry if sending fails
      await this.queueNotification({
        id: this.generateNotificationId(),
        userId,
        type,
        details,
        attempts: 0,
        maxAttempts: 3,
        nextRetryAt: new Date(Date.now() + 60000), // Retry in 1 minute
        createdAt: new Date(),
        priority: this.getNotificationPriority(type)
      });
      throw error;
    }
  }

  async queueNotification(notification: QueuedNotification): Promise<void> {
    this.notificationQueue.push(notification);
            console.log(`🐷 Oink! Queued notification ${notification.id} for user ${notification.userId} 🐽`);
  }

  async updateNotificationPreferences(userId: string, preferences: NotificationSettings): Promise<void> {
    this.userPreferences.set(userId, preferences);
            console.log(`🐷 Oink! Updated notification preferences for user ${userId} 🐽✨`);
  }

  async getNotificationPreferences(userId: string): Promise<NotificationSettings> {
    return this.userPreferences.get(userId) || {
      enableDMNotifications: true,
      enableChannelNotifications: false
    };
  }

  async retryFailedNotifications(): Promise<void> {
    const now = new Date();
    const notificationsToRetry = this.notificationQueue.filter(
      notification => notification.nextRetryAt <= now && notification.attempts < notification.maxAttempts
    );

    for (const notification of notificationsToRetry) {
      try {
        await this.sendNotificationWithPreferences(
          notification.userId,
          notification.type,
          notification.details
        );

        // Remove successful notification from queue
        this.notificationQueue = this.notificationQueue.filter(n => n.id !== notification.id);
        console.log(`🐷 Oink! Successfully retried notification ${notification.id} 🐽✨`);
      } catch (error) {
        console.error(`❌ Oink... failed to retry notification ${notification.id}:`, error);
        // Update retry information
        notification.attempts++;
        notification.nextRetryAt = new Date(now.getTime() + (notification.attempts * 60000)); // Exponential backoff

        if (notification.attempts >= notification.maxAttempts) {
          console.error(`❌ Oink... max retry attempts reached for notification ${notification.id} 🐷`);
          // Remove from queue after max attempts
          this.notificationQueue = this.notificationQueue.filter(n => n.id !== notification.id);
        }
      }
    }
  }

  private buildEmbedFromTemplate(template: MessageTemplate, details: NotificationDetails): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(template.color)
      .setTitle(this.interpolateString(template.title, details))
      .setDescription(this.interpolateString(template.description, details))
      .setTimestamp();

    if (template.fields) {
      const fields = template.fields
        .map(field => ({
          name: this.interpolateString(field.name, details),
          value: this.interpolateString(field.value, details) || 'N/A',
          inline: field.inline || false
        }))
        .filter(field => field.value !== 'N/A' && field.value !== '');

      embed.addFields(fields);
    }

    if (template.footer) {
      embed.setFooter({ text: this.interpolateString(template.footer, details) });
    }

    return embed;
  }

  private interpolateString(template: string, details: NotificationDetails): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      // Special formatting for certain keys
      if (key === 'fromUser' && details.senderName) {
        return ` from **${details.senderName}**`;
      }
      if (key === 'toUser' && details.recipientName) {
        return ` to **${details.recipientName}**`;
      }

      const value = details[key];
      if (value === undefined || value === null) {
        return '';
      }

      if (key === 'fees' && typeof value === 'number') {
        return value.toFixed(2);
      }
      if (key === 'amount' && typeof value === 'number') {
        return value.toFixed(2);
      }

      return String(value);
    });
  }

  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getNotificationPriority(type: NotificationType): NotificationPriority {
    switch (type) {
      case NotificationType.PAYMENT_FAILED:
      case NotificationType.TRANSACTION_DISPUTED:
        return NotificationPriority.URGENT;
      case NotificationType.PAYMENT_RECEIVED:
      case NotificationType.PAYMENT_SENT:
      case NotificationType.ESCROW_RELEASED:
        return NotificationPriority.HIGH;
      case NotificationType.PAYMENT_REQUEST:
      case NotificationType.ESCROW_HELD:
        return NotificationPriority.NORMAL;
      default:
        return NotificationPriority.LOW;
    }
  }

  // Legacy methods - updated to use enhanced notification system
  async sendPaymentNotification(
    userId: string,
    type: NotificationType,
    details: Record<string, unknown>
  ): Promise<void> {
    await this.sendNotificationWithPreferences(userId, type, details as NotificationDetails);
  }

  async sendPaymentRequestApprovedNotification(
    requesterId: string,
    paymentRequest: PaymentRequest,
    transactionId: string
  ): Promise<void> {
    await this.sendNotificationWithPreferences(requesterId, NotificationType.PAYMENT_SENT, {
      amount: paymentRequest.amount,
      currency: 'USD', // Default currency
      transactionId,
      description: paymentRequest.description,
      recipientName: 'the recipient'
    });
  }

  async sendPaymentRequestDeclinedNotification(
    requesterId: string,
    paymentRequest: PaymentRequest
  ): Promise<void> {
    await this.sendNotificationWithPreferences(requesterId, NotificationType.PAYMENT_FAILED, {
      amount: paymentRequest.amount,
      currency: 'USD', // Default currency
      reason: 'Payment request was declined',
      description: paymentRequest.description
    });
  }

  async sendPaymentCompletedNotification(
    userId: string,
    transaction: Transaction,
    isRecipient: boolean
  ): Promise<void> {
    const type = isRecipient ? NotificationType.PAYMENT_RECEIVED : NotificationType.PAYMENT_SENT;

    await this.sendNotificationWithPreferences(userId, type, {
      amount: transaction.amount,
      currency: transaction.currency || 'USD',
      transactionId: transaction.id,
      paymentMethod: isRecipient ?
        transaction.recipientPaymentMethod?.displayName || 'Unknown' :
        transaction.senderPaymentMethod?.displayName || 'Unknown'
    });
  }

  // Cleanup method for graceful shutdown
  public destroy(): void {
    this.stopRetryTimer();
    this.notificationQueue = [];
    this.userPreferences.clear();
  }
}