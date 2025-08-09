// Setup Delivery System - Manages pending setup requests and delivery
import {
  User,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel
} from 'discord.js';
import { auditLogger, AuditEventType, AuditSeverity } from '../../utils/AuditLogger';

interface PendingSetup {
  userId: string;
  serverId?: string;
  timestamp: Date;
  setupType: 'payment' | 'general';
  expiresAt: Date;
}

export interface SetupDelivery {
  storePendingSetup(userId: string, serverId?: string, setupType?: 'payment' | 'general'): void;
  hasPendingSetup(userId: string): boolean;
  getPendingSetupCount(): number;
  deliverSetup(userId: string, user: User): Promise<void>;
  cleanupExpiredSetups(): void;
}

/**
 * Manages pending setup requests and delivers them when users send their first DM
 */
export class SetupDeliveryImpl implements SetupDelivery {
  private pendingSetups: Map<string, PendingSetup> = new Map();
  private readonly SETUP_EXPIRY_MINUTES = 15; // Setup requests expire after 15 minutes

  constructor() {
    // Clean up expired setups every 5 minutes
    setInterval(() => {
      this.cleanupExpiredSetups();
    }, 5 * 60 * 1000);
  }

  /**
   * Store a pending setup request for a user
   */
  public storePendingSetup(
    userId: string, 
    serverId?: string, 
    setupType: 'payment' | 'general' = 'payment'
  ): void {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.SETUP_EXPIRY_MINUTES);

    const pendingSetup: PendingSetup = {
      userId,
      serverId,
      timestamp: new Date(),
      setupType,
      expiresAt
    };

    this.pendingSetups.set(userId, pendingSetup);
    
    console.log(`🐷 Stored pending ${setupType} setup for user ${userId}, expires at ${expiresAt.toISOString()}`);
    
    // Log the pending setup
    auditLogger.logEvent({
      eventType: AuditEventType.SETUP_PENDING_STORED,
      severity: AuditSeverity.INFO,
      userId: userId,
      details: {
        setupType,
        serverId,
        expiresAt: expiresAt.toISOString()
      }
    }).catch(err => console.error('Failed to log setup pending event:', err));
  }

  /**
   * Check if a user has a pending setup request
   */
  public hasPendingSetup(userId: string): boolean {
    const setup = this.pendingSetups.get(userId);
    if (!setup) return false;
    
    // Check if expired
    if (new Date() > setup.expiresAt) {
      this.pendingSetups.delete(userId);
      return false;
    }
    
    return true;
  }

  /**
   * Get the count of pending setup requests
   */
  public getPendingSetupCount(): number {
    this.cleanupExpiredSetups(); // Clean up before counting
    return this.pendingSetups.size;
  }

  /**
   * Deliver setup information to a user who has a pending request
   */
  public async deliverSetup(userId: string, user: User): Promise<void> {
    const setup = this.pendingSetups.get(userId);
    if (!setup) {
      console.log(`🐷 No pending setup found for user ${userId}`);
      return;
    }

    try {
      // Remove the pending setup since we're delivering it
      this.pendingSetups.delete(userId);
      
      console.log(`🐷 Delivering ${setup.setupType} setup to user ${userId}`);

      if (setup.setupType === 'payment') {
        await this.deliverPaymentSetup(user);
      } else {
        await this.deliverGeneralSetup(user);
      }

      // Log successful delivery
      await auditLogger.logEvent({
        eventType: AuditEventType.SETUP_DELIVERED,
        severity: AuditSeverity.INFO,
        userId: userId,
        details: {
          setupType: setup.setupType,
          serverId: setup.serverId,
          deliveryMethod: 'dm_response'
        }
      });

    } catch (error) {
      console.error(`🐷 Error delivering setup to user ${userId}:`, error);
      
      // Log delivery failure
      await auditLogger.logEvent({
        eventType: AuditEventType.SETUP_DELIVERY_FAILED,
        severity: AuditSeverity.ERROR,
        userId: userId,
        details: {
          setupType: setup.setupType,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }).catch(err => console.error('Failed to log delivery failure:', err));
    }
  }

  /**
   * Deliver payment setup information
   */
  private async deliverPaymentSetup(user: User): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🔧 Payment Setup - Welcome! 🐷')
      .setDescription('Great! Now that you\'ve messaged me, let\'s get your payment methods set up.')
      .setColor('#00ff00')
      .addFields(
        { 
          name: '💳 ACH/Bank Transfer', 
          value: 'Set up bank account for ACH transfers', 
          inline: true 
        },
        { 
          name: '₿ Crypto', 
          value: 'Set up cryptocurrency wallet', 
          inline: true 
        },
        { 
          name: '🔧 Other', 
          value: 'Set up alternative payment method', 
          inline: true 
        },
        { 
          name: '🌟 Pro tip:', 
          value: 'You can now message me anytime for help with payments!', 
          inline: false 
        }
      )
      .setFooter({ text: '🐷 Select an option below to continue with setup' })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('setup_ach')
          .setLabel('ACH/Bank Transfer')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('setup_crypto')
          .setLabel('Cryptocurrency')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('setup_other')
          .setLabel('Other')
          .setStyle(ButtonStyle.Secondary)
      );

    await user.send({
      embeds: [embed],
      components: [row]
    });
  }

  /**
   * Deliver general setup information
   */
  private async deliverGeneralSetup(user: User): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🔧 General Setup - Welcome! 🐷')
      .setDescription('Great! Now that you\'ve messaged me, let\'s get you set up.')
      .setColor('#00ff00')
      .addFields(
        { 
          name: '🎯 What would you like to do?', 
          value: 'I can help you with various setup tasks. Just let me know what you need!', 
          inline: false 
        },
        { 
          name: '💡 Available options:', 
          value: '• Payment method setup\n• Account configuration\n• Server settings\n• General help', 
          inline: false 
        }
      )
      .setFooter({ text: '🐷 Message me with what you\'d like to set up!' })
      .setTimestamp();

    await user.send({
      embeds: [embed]
    });
  }

  /**
   * Clean up expired setup requests
   */
  public cleanupExpiredSetups(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [userId, setup] of this.pendingSetups.entries()) {
      if (now > setup.expiresAt) {
        this.pendingSetups.delete(userId);
        cleanedCount++;
        
        // Log expired setup cleanup
        auditLogger.logEvent({
          eventType: AuditEventType.SETUP_EXPIRED,
          severity: AuditSeverity.INFO,
          userId: userId,
          details: {
            setupType: setup.setupType,
            serverId: setup.serverId,
            expiredAt: setup.expiresAt.toISOString()
          }
        }).catch(err => console.error('Failed to log setup expired event:', err));
      }
    }

    if (cleanedCount > 0) {
      console.log(`🐷 Cleaned up ${cleanedCount} expired setup requests`);
    }
  }
}
