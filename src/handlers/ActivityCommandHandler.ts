import { BaseCommandHandler } from './CommandHandler';
import { UserAccountService } from '../services/UserAccountService';
import { PaymentService } from '../services/PaymentService';
import { 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  SlashCommandBuilder 
} from 'discord.js';

/**
 * Activity command handler for checking user account activity
 * Shows totals, pending requests, and recent transactions instead of balances
 */
export class ActivityCommandHandler extends BaseCommandHandler {
  constructor(
    private userAccountService: UserAccountService,
    private paymentService: PaymentService
  ) {
    super();
  }

  getCommandName(): string {
    return 'activity';
  }

  getSlashCommand(): SlashCommandBuilder {
    const command = new SlashCommandBuilder()
      .setName('activity')
      .setDescription('🐷 Check your account activity and pending requests (oink oink!)');
    
    command.addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to check activity for (optional)')
        .setRequired(false)
    );
    
    return command;
  }

  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const userId = targetUser.id;

      // Get user account
      const userAccount = await this.userAccountService.getAccount(userId);
      if (!userAccount) {
        await interaction.reply({
          content: '❌ Oink... user account not found. Please run `/setup` first!',
          ephemeral: true
        });
        return;
      }

      // Get activity data
      const activityData = await this.paymentService.getUserActivity(userId);

      // Create activity embed
      const embed = new EmbedBuilder()
        .setColor(0x00FF00) // Green for positive activity
        .setTitle('🐷 Account Activity 🐽')
        .setDescription(`Activity summary for **${targetUser.username}**`)
        .addFields(
          {
            name: '💰 Total Sent',
            value: `$${activityData.totalSent.toFixed(2)}`,
            inline: true
          },
          {
            name: '💰 Total Received',
            value: `$${activityData.totalReceived.toFixed(2)}`,
            inline: true
          },
          {
            name: '📊 Total Transactions',
            value: `${activityData.totalTransactions}`,
            inline: true
          },
          {
            name: '⏳ Pending Requests',
            value: `${activityData.pendingRequests} requests`,
            inline: true
          },
          {
            name: '🔄 Recent Activity',
            value: activityData.recentTransactions.length > 0 
              ? activityData.recentTransactions.slice(0, 3).map(tx => 
                  `• ${tx.type === 'SENT' ? '→' : '←'} $${tx.amount} ${tx.currency} (${tx.status})`
                ).join('\n')
              : 'No recent transactions',
            inline: false
          }
        )
        .setFooter({ text: '🐽 Non-custodial payments - your funds stay in your wallet!' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Error handling activity command:', error);
      await interaction.reply({
        content: '❌ Oink... something went wrong while checking your activity. Please try again!',
        ephemeral: true
      });
    }
  }
}
