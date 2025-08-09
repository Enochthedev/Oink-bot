// DM Handler Module - Core DM processing and routing
import {
  Message,
  Client,
  Events,
  Collection,
  User,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} from 'discord.js';
import { SetupDelivery, SetupDeliveryImpl } from './SetupDelivery';
import { auditLogger, AuditEventType, AuditSeverity } from '../../utils/AuditLogger';
import { rateLimiters } from '../../utils/RateLimiter';

export interface DMHandler {
  initialize(client: Client): void;
  handleIncomingDM(message: Message): Promise<void>;
  isSetupPending(userId: string): boolean;
  getPendingSetupCount(): number;
  canUserSendDM(userId: string): Promise<{ canSend: boolean; reason?: string }>;
  testReceiveDM(userId: string): Promise<{ canReceive: boolean; reason?: string }>;
  enforceDMPolicy(userId: string): Promise<{ compliant: boolean; reason?: string; requiresAction?: string }>;
  trackSetupUser(userId: string): void;
  removeSetupUser(userId: string): void;
  getSetupUsers(): Set<string>;
  getSetupStartTimes(): Map<string, number>;
  markUserVerified(userId: string): void;
  isUserVerified(userId: string): boolean;
  getVerifiedUsers(): Set<string>;
  getVerificationTimes(): Map<string, number>;
}

/**
 * Core DM Handler that processes all incoming direct messages
 * Routes messages to appropriate handlers and manages setup delivery
 */
export class DMHandlerImpl implements DMHandler {
  private setupDelivery: SetupDelivery;
  private client: Client | null = null;
  private isInitialized = false;
  private setupUsers: Set<string> = new Set(); // Track users in setup process
  private setupStartTimes: Map<string, number> = new Map(); // Track when setup started
  private dmPolicyChecks: Map<string, number> = new Map(); // Track DM policy check times
  private verifiedUsers: Set<string> = new Set(); // Track users who have successfully received DMs
  private verificationTimes: Map<string, number> = new Map(); // Track when users were verified

  constructor() {
    this.setupDelivery = new SetupDeliveryImpl();
  }

  /**
   * Check if the bot has the necessary permissions to send DMs
   */
  public async checkDMPermissions(): Promise<{ canSendDMs: boolean; error?: string }> {
    try {
      if (!this.client) {
        return { canSendDMs: false, error: 'DM Handler not initialized' };
      }

      // Check if the bot is in any guilds (servers)
      const guilds = this.client.guilds.cache;
      if (guilds.size === 0) {
        return { 
          canSendDMs: false, 
          error: 'Bot is not in any servers. Users must share a server with the bot to send DMs.' 
        };
      }

      // Check bot permissions
      const botUser = this.client.user;
      if (!botUser) {
        return { canSendDMs: false, error: 'Bot user not available' };
      }

      console.log(`🐷 Bot is in ${guilds.size} server(s): ${guilds.map(g => g.name).join(', ')}`);
      return { canSendDMs: true };
    } catch (error) {
      return { 
        canSendDMs: false, 
        error: `Error checking permissions: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Test if the bot can send DMs to a user
   */
  public async testDM(userId: string): Promise<boolean> {
    try {
      if (!this.client) {
        console.log('🐷 DM Handler not initialized yet');
        return false;
      }

      const user = await this.client.users.fetch(userId);
      if (!user) {
        console.log(`🐷 Could not fetch user ${userId}`);
        return false;
      }

      console.log(`🐷 Testing DM to user ${user.tag} (${userId})`);
      
      // Try to send a test message
      await user.send({
        content: '🐷 Oink! This is a test message to verify I can send you DMs!',
        flags: 64 as any
      });
      
      console.log(`🐷 Successfully sent test DM to ${user.tag}`);
      return true;
    } catch (error) {
      console.error(`🐷 Failed to send test DM to user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Test if a user can send DMs to the bot (like MEE6 and Carl-bot do)
   */
  public async canUserSendDM(userId: string): Promise<{ canSend: boolean; reason?: string }> {
    try {
      if (!this.client) {
        return { canSend: false, reason: 'DM Handler not initialized' };
      }

      const user = await this.client.users.fetch(userId);
      if (!user) {
        return { canSend: false, reason: 'User not found' };
      }

      // Check if user has DMs disabled for bots
      // This is a common Discord setting that prevents bots from sending DMs
      try {
        // Try to send a test message
        await user.send({
          content: '🐷 Oink! Testing DM permissions...',
          flags: 64 as any
        });
        
        // If we get here, the user can receive DMs from bots
        return { canSend: true };
      } catch (dmError: any) {
        if (dmError.code === 50007) {
          return { canSend: false, reason: 'User has DMs disabled for this bot' };
        } else if (dmError.code === 10013) {
          return { canSend: false, reason: 'User not found or bot blocked' };
        } else {
          return { canSend: false, reason: `Discord error: ${dmError.message}` };
        }
      }
    } catch (error) {
      return { 
        canSend: false, 
        reason: `Error checking DM permissions: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Test if the bot can receive DMs from a specific user
   * This simulates what happens when a user tries to DM the bot
   */
  public async testReceiveDM(userId: string): Promise<{ canReceive: boolean; reason?: string }> {
    try {
      if (!this.client) {
        return { canReceive: false, reason: 'DM Handler not initialized' };
      }

      const user = await this.client.users.fetch(userId);
      if (!user) {
        return { canReceive: false, reason: 'User not found' };
      }

      // Check if the bot and user share any servers (required for DMs)
      const sharedGuilds = this.client.guilds.cache.filter(guild => 
        guild.members.cache.has(userId)
      );

      if (sharedGuilds.size === 0) {
        return { 
          canReceive: false, 
          reason: 'User and bot must share at least one server to exchange DMs' 
        };
      }

      // Check if user has DMs enabled for the bot
      const dmTest = await this.canUserSendDM(userId);
      if (!dmTest.canSend) {
        return { 
          canReceive: false, 
          reason: `User cannot receive DMs: ${dmTest.reason}` 
        };
      }

      return { 
        canReceive: true, 
        reason: `User can send DMs. Shared servers: ${sharedGuilds.map(g => g.name).join(', ')}` 
      };
    } catch (error) {
      return { 
        canReceive: false, 
        reason: `Error testing DM receive: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Enforce DM policy to prevent exploitation
   * This ensures users can't just enable DMs temporarily for setup
   */
  public async enforceDMPolicy(userId: string): Promise<{ compliant: boolean; reason?: string; requiresAction?: string }> {
    try {
      if (!this.client) {
        return { compliant: false, reason: 'DM Handler not initialized' };
      }

      const user = await this.client.users.fetch(userId);
      if (!user) {
        return { compliant: false, reason: 'User not found' };
      }

      // Check if user is already verified (has received DMs before)
      if (this.isUserVerified(userId)) {
        return { 
          compliant: true, 
          reason: 'User already verified for one-time DMs - no further DM access required' 
        };
      }

      // Check if user is in setup process
      const isInSetup = this.setupUsers.has(userId);
      const setupStartTime = this.setupStartTimes.get(userId);
      const lastPolicyCheck = this.dmPolicyChecks.get(userId);

      // If user is in setup, enforce one-time DM verification
      if (isInSetup) {
        const setupDuration = Date.now() - (setupStartTime || 0);
        const timeSinceLastCheck = Date.now() - (lastPolicyCheck || 0);

        // Require DMs to be enabled for at least 2 minutes during initial setup
        if (setupDuration < 2 * 60 * 1000) { // 2 minutes
          return { 
            compliant: false, 
            reason: 'Setup requires DMs to be enabled for at least 2 minutes for initial verification',
            requiresAction: 'Keep DMs enabled for at least 2 minutes to receive setup instructions'
          };
        }

        // Check DM policy every 1 minute during setup (more frequent for initial verification)
        if (timeSinceLastCheck < 1 * 60 * 1000) { // 1 minute
          return { 
            compliant: true, 
            reason: 'DM policy recently verified during initial setup'
          };
        }
      }

      // Test current DM policy
      const dmTest = await this.canUserSendDM(userId);
      if (!dmTest.canSend) {
        return { 
          compliant: false, 
          reason: `DM policy violation: ${dmTest.reason}`,
          requiresAction: 'Enable DMs for this bot in Discord Privacy Settings to receive setup instructions'
        };
      }

      // Update policy check time
      this.dmPolicyChecks.set(userId, Date.now());

      return { 
        compliant: true, 
        reason: isInSetup ? 'DM policy compliant during initial setup' : 'DM policy verified'
      };
    } catch (error) {
      return { 
        compliant: false, 
        reason: `Error enforcing DM policy: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Track a user who is starting the setup process
   */
  public trackSetupUser(userId: string): void {
    this.setupUsers.add(userId);
    this.setupStartTimes.set(userId, Date.now());
    this.dmPolicyChecks.set(userId, Date.now());
    console.log(`🐷 User ${userId} started setup process - DM policy enforcement active`);
  }

  /**
   * Remove a user from setup tracking (when setup completes or fails)
   */
  public removeSetupUser(userId: string): void {
    this.setupUsers.delete(userId);
    this.setupStartTimes.delete(userId);
    this.dmPolicyChecks.delete(userId);
    console.log(`🐷 User ${userId} removed from setup tracking`);
  }

  /**
   * Get all users currently in setup process
   */
  public getSetupUsers(): Set<string> {
    return new Set(this.setupUsers);
  }

  /**
   * Get the start times of all users currently in setup process
   */
  public getSetupStartTimes(): Map<string, number> {
    return new Map(this.setupStartTimes);
  }

  /**
   * Initialize the DM handler with the Discord client
   */
  public initialize(client: Client): void {
    if (this.isInitialized) {
      console.log('🐷 DM Handler already initialized');
      return;
    }

    console.log('🐷 Initializing DM Handler...');
    this.client = client;
    
    // Listen for all incoming messages with enhanced debugging
    client.on(Events.MessageCreate, async (message) => {
      console.log(`📨 Received message: "${message.content}" from: ${message.author.tag}`);
      console.log(`📍 Channel type: ${message.channel.type}`);
      console.log(`🏠 Guild: ${message.guild?.name || 'DM'}`);
      console.log(`🤖 Bot: ${message.author.bot}`);
      console.log(`🔒 Channel ID: ${message.channel.id}`);
      console.log(`👤 Author ID: ${message.author.id}`);
      console.log(`🤖 Bot User ID: ${client.user?.id}`);
      
      // Check if this is a DM (no guild) and from a non-bot user
      if (message.channel.type === ChannelType.DM && !message.author.bot) {
        // Double-check: make sure it's not the bot itself
        if (message.author.id === client.user?.id) {
          console.log(`🚫 Skipping DM from bot itself (${message.author.tag})`);
          return;
        }
        
        console.log(`🔥 DM DETECTED! Processing message from ${message.author.tag}`);
        await this.handleIncomingDM(message);
      } else if (message.channel.type === ChannelType.DM && message.author.bot) {
        console.log(`🚫 Skipping DM from bot user: ${message.author.tag}`);
      } else if (message.guild) {
        console.log(`🏠 Skipping server message in: ${message.guild.name}`);
      } else {
        console.log(`❓ Unknown message type - Channel: ${message.channel.type}, Guild: ${!!message.guild}, Bot: ${message.author.bot}`);
      }
    });

    // Remove the duplicate listener - we only need one
    // Also listen for direct message events specifically
    // client.on(Events.MessageCreate, async (message) => {
    //   // Double-check with channel type
    //   if (message.channel.type === ChannelType.DM) {
    //     console.log(`💬 DM Channel detected for message: "${message.content}"`);
    //     if (!message.author.bot) {
    //       console.log(`🐷 Processing DM in dedicated listener`);
    //       await this.handleIncomingDM(message);
    //     }
    //   }
    // });

    this.isInitialized = true;
    console.log('🐷 DM Handler initialized successfully with enhanced debugging');
  }

  /**
   * Handle incoming DM messages
   */
  public async handleIncomingDM(message: Message): Promise<void> {
    try {
      const userId = message.author.id;
      console.log(`🐷 Processing DM from user ${userId} (${message.author.tag}): "${message.content}"`);
      
      // Rate limiting check
      await rateLimiters.checkDMLimit(userId);

      // Log DM received
      await auditLogger.logEvent({
        eventType: AuditEventType.DM_RECEIVED,
        severity: AuditSeverity.INFO,
        userId: userId,
        details: {
          messageLength: message.content.length,
          hasAttachments: message.attachments.size > 0,
          timestamp: new Date().toISOString()
        }
      });

      // Check if user has a pending setup request
      if (this.setupDelivery.hasPendingSetup(userId)) {
        console.log(`🐷 User ${userId} has pending setup - delivering setup info`);
        await this.setupDelivery.deliverSetup(userId, message.author);
        return;
      }

      // No pending setup - this is a regular DM
      console.log(`🐷 Regular DM from user ${userId}: "${message.content}"`);
      await this.handleRegularDM(message);

    } catch (error) {
      console.error(`🐷 Error handling DM from user ${message.author.id}:`, error);
      
      // Send friendly error message to user
      try {
        await message.reply({
          content: '🐷 Oink! Something went wrong processing your message. Please try again in a moment.',
          flags: 64 as any
        });
      } catch (replyError) {
        console.error('🐷 Failed to send error reply:', replyError);
      }
    }
  }

  /**
   * Handle regular DMs (no pending setup)
   */
  private async handleRegularDM(message: Message): Promise<void> {
    const userId = message.author.id;
    
    // For now, just acknowledge the message
    // AI chat functionality will be implemented later
    const embed = new EmbedBuilder()
      .setTitle('🐷 Oink! Hello there!')
      .setDescription('Thanks for messaging me! I\'m here to help with payments and setup.')
      .setColor('#00ff00')
      .addFields(
        { 
          name: '🔧 Need to set up payments?', 
          value: 'Run `/setup-payment` in any server where I\'m present!', 
          inline: false 
        },
        { 
          name: '💡 Want to see all commands?', 
          value: 'Run `/help` in any server for a complete list!', 
          inline: false 
        },
        { 
          name: '🌟 Pro tip:', 
          value: 'I\'ll automatically send you setup instructions when you run the setup command!', 
          inline: false 
        }
      )
      .setFooter({ text: '🐷 More features coming soon!' })
      .setTimestamp();

    await message.reply({
      embeds: [embed],
      flags: 64 as any
    });
  }

  /**
   * Check if a user has a pending setup request
   */
  public isSetupPending(userId: string): boolean {
    return this.setupDelivery.hasPendingSetup(userId);
  }

  /**
   * Get the count of pending setup requests
   */
  public getPendingSetupCount(): number {
    return this.setupDelivery.getPendingSetupCount();
  }

  /**
   * Get the setup delivery instance (for external use)
   */
  public getSetupDelivery(): SetupDelivery {
    return this.setupDelivery;
  }

  /**
   * Test method to verify DM handler is working
   */
  public async testDMHandler(): Promise<string> {
    if (!this.client) {
      return '❌ DM Handler not initialized - no client available';
    }
    
    if (!this.isInitialized) {
      return '❌ DM Handler not initialized';
    }
    
    const guilds = this.client.guilds.cache;
    const botUser = this.client.user;
    
    return `✅ DM Handler Status:
🐷 Initialized: ${this.isInitialized}
🤖 Bot User: ${botUser?.tag || 'Unknown'}
🏠 Servers: ${guilds.size} (${guilds.map(g => g.name).join(', ')})
📨 Listening for DMs: Yes
🔒 Channel Types: ${Object.values(ChannelType).join(', ')}`;
  }

  /**
   * Mark a user as verified for one-time DMs
   */
  public markUserVerified(userId: string): void {
    this.verifiedUsers.add(userId);
    this.verificationTimes.set(userId, Date.now());
    console.log(`🐷 User ${userId} marked as verified for one-time DMs`);
  }

  /**
   * Check if a user is verified for one-time DMs
   */
  public isUserVerified(userId: string): boolean {
    return this.verifiedUsers.has(userId);
  }

  /**
   * Get all users who have been verified for one-time DMs
   */
  public getVerifiedUsers(): Set<string> {
    return new Set(this.verifiedUsers);
  }

  /**
   * Get the verification times of all verified users
   */
  public getVerificationTimes(): Map<string, number> {
    return new Map(this.verificationTimes);
  }
}
