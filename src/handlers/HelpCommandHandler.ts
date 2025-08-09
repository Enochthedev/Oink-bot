// HelpCommandHandler provides general help and information about the bot
import {
  CommandInteraction,
  EmbedBuilder
} from 'discord.js';
import { BaseCommandHandler } from './CommandHandler';

export interface HelpCommandHandler {
  handleHelpCommand(interaction: CommandInteraction): Promise<void>;
}

/**
 * Command handler for help and information
 */
export class HelpCommandHandler extends BaseCommandHandler {
  public getCommandName(): string {
    return 'help';
  }

  public validateParameters(interaction: CommandInteraction): boolean {
    return super.validateParameters(interaction);
  }

  public async handle(interaction: CommandInteraction): Promise<void> {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🐷 Oink! Welcome to MInt Bot! 🐷')
        .setDescription('I\'m your friendly payment processing assistant! I help you send and receive payments securely.')
        .setColor('#00ff00')
        .addFields(
          { 
            name: '🔧 Setup Commands', 
            value: '• `/setup-payment` - Set up your payment methods\n• `/add-friend` - Learn how to add me as a friend', 
            inline: true 
          },
          { 
            name: '💳 Payment Commands', 
            value: '• `/pay` - Send a payment to someone\n• `/request` - Request payment from someone\n• `/balance` - Check your account balance', 
            inline: true 
          },
          { 
            name: '📊 Account Commands', 
            value: '• `/profile` - View your profile\n• `/transactions` - View transaction history\n• `/config` - Configure server settings', 
            inline: true 
          },
          { 
            name: '🌟 Pro Tips', 
            value: '• **Add me as a friend** for private setup instructions\n• **Enable DMs** for secure payment confirmations\n• **Use slash commands** for the best experience', 
            inline: false 
          },
          { 
            name: '🔒 Security Features', 
            value: '• End-to-end encryption\n• Secure payment processing\n• Audit logging\n• Rate limiting protection', 
            inline: false 
          },
          { 
            name: '💬 DM Troubleshooting', 
            value: '• **Can\'t send me a DM?** Make sure we share a server\n• **DMs blocked?** Check your Discord privacy settings\n• **Need help?** Run `/setup-payment` in any server I\'m in', 
            inline: false 
          }
        )
        .setFooter({ text: '🐷 More friends = More oinks = More fun! Add me as a friend for the best experience!' })
        .setTimestamp();

      await interaction.reply({
        content: '🐷 **Oink!** Here\'s how I can help you! 🐷',
        embeds: [embed],
        flags: 64
      });

    } catch (error) {
      console.error('HelpCommandHandler error:', error);
      await interaction.reply({
        content: '❌ Oink... Something went wrong while showing help.',
        flags: 64
      });
    }
  }
}
