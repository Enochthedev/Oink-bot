// DM Test Utility - Helps diagnose DM issues
import { Client, User } from 'discord.js';

export class DMTestUtility {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Test if the bot can send DMs to a specific user
   */
  public async testDMToUser(userId: string): Promise<{
    success: boolean;
    error?: string;
    userInfo?: {
      id: string;
      tag: string;
      bot: boolean;
    };
  }> {
    try {
      console.log(`🐷 Testing DM to user ${userId}...`);
      
      // Fetch user information
      const user = await this.client.users.fetch(userId);
      if (!user) {
        return {
          success: false,
          error: 'Could not fetch user information'
        };
      }

      console.log(`🐷 User found: ${user.tag} (Bot: ${user.bot})`);

      // Check if user is a bot
      if (user.bot) {
        return {
          success: false,
          error: 'Cannot send DMs to other bots'
        };
      }

      // Try to send a test message
      await user.send({
        content: '🐷 Oink! This is a test message to verify DM functionality! 🐽✨',
        flags: 64 as any
      });

      console.log(`🐷 Successfully sent test DM to ${user.tag}`);

      return {
        success: true,
        userInfo: {
          id: user.id,
          tag: user.tag,
          bot: user.bot
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`🐷 Failed to send test DM to user ${userId}:`, errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Test if the bot can receive DMs
   */
  public async testDMReception(): Promise<{
    canReceive: boolean;
    guildCount: number;
    botInfo?: {
      id: string;
      tag: string;
      createdAt: Date;
    };
  }> {
    try {
      const botUser = this.client.user;
      if (!botUser) {
        return {
          canReceive: false,
          guildCount: 0
        };
      }

      const guildCount = this.client.guilds.cache.size;
      const canReceive = guildCount > 0; // Bot must be in at least one guild to receive DMs

      console.log(`🐷 Bot DM reception test:`);
      console.log(`   • Bot: ${botUser.tag} (${botUser.id})`);
      console.log(`   • Guilds: ${guildCount}`);
      console.log(`   • Can receive DMs: ${canReceive ? 'Yes' : 'No'}`);

      if (guildCount === 0) {
        console.log(`   ⚠️ Bot is not in any servers - users cannot DM the bot`);
      }

      return {
        canReceive,
        guildCount,
        botInfo: {
          id: botUser.id,
          tag: botUser.tag,
          createdAt: botUser.createdAt
        }
      };

    } catch (error) {
      console.error('🐷 Error testing DM reception:', error);
      return {
        canReceive: false,
        guildCount: 0
      };
    }
  }

  /**
   * Comprehensive DM functionality test
   */
  public async runFullDMTest(): Promise<void> {
    console.log('🐷 🧪 Running comprehensive DM functionality test...\n');

    // Test 1: Bot DM reception capability
    console.log('1️⃣ Testing bot DM reception capability...');
    const receptionTest = await this.testDMReception();
    
    if (!receptionTest.canReceive) {
      console.log('❌ Bot cannot receive DMs - fix server membership first!\n');
      return;
    }

    console.log('✅ Bot can receive DMs\n');

    // Test 2: Bot permissions and intents
    console.log('2️⃣ Checking bot permissions and intents...');
    const intents = this.client.options.intents;
    const hasDirectMessages = intents?.has('DirectMessages');
    const hasMessageContent = intents?.has('MessageContent');
    
    console.log(`   • DirectMessages intent: ${hasDirectMessages ? '✅' : '❌'}`);
    console.log(`   • MessageContent intent: ${hasMessageContent ? '✅' : '❌'}`);
    
    if (!hasDirectMessages || !hasMessageContent) {
      console.log('❌ Missing required intents for DM functionality!\n');
      return;
    }

    console.log('✅ Bot has required intents\n');

    // Test 3: Guild membership
    console.log('3️⃣ Checking guild membership...');
    const guilds = this.client.guilds.cache;
    
    if (guilds.size === 0) {
      console.log('❌ Bot is not in any servers - users cannot DM the bot!');
      console.log('   Solution: Add the bot to at least one Discord server');
    } else {
      console.log(`✅ Bot is in ${guilds.size} server(s):`);
      guilds.forEach(guild => {
        console.log(`   • ${guild.name} (${guild.id})`);
      });
    }

    console.log('\n🐷 DM functionality test completed!');
    
    if (receptionTest.canReceive && hasDirectMessages && hasMessageContent && guilds.size > 0) {
      console.log('🎉 All tests passed! DM functionality should work correctly.');
    } else {
      console.log('⚠️ Some tests failed. Check the issues above and fix them.');
    }
  }
}
