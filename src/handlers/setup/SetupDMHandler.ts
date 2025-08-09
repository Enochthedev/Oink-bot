// SetupDMHandler handles sending setup-related direct messages
import {
  User,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';

export class SetupDMHandler {
  /**
   * Sends the initial setup options DM to the user
   * Returns true if successful, false if DM failed
   */
  async sendSetupOptionsDM(user: User): Promise<boolean> {
    const embed = new EmbedBuilder()
      .setTitle('🔧 Payment Setup Options')
      .setDescription('Choose your preferred payment method below:')
      .setColor('#00ff00')
      .addFields(
        { name: '💳 ACH/Bank Transfer', value: 'Set up bank account for ACH transfers', inline: true },
        { name: '₿ Crypto', value: 'Set up cryptocurrency wallet', inline: true },
        { name: '🔧 Other', value: 'Set up alternative payment method', inline: true }
      )
      .setFooter({ text: '🐷 Choose your payment method to get started! Or just send me a DM anytime for the long run oink!' });

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

    try {
      await user.send({
        embeds: [embed],
        components: [row]
      });
      return true; // DM sent successfully
    } catch (error) {
      console.error(`Failed to send DM to user ${user.id}:`, error);
      return false; // DM failed
    }
  }

  /**
   * Sends a success message after setup completion
   */
  async sendSetupSuccessDM(user: User, paymentMethodType: string): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('✅ Setup Complete!')
      .setDescription(`Your ${paymentMethodType} payment method has been successfully configured.`)
      .setColor('#00ff00')
      .setFooter({ text: 'You can now use the /pay command to send payments\n🐷 Or just send me a DM anytime for the long run oink!' });

    try {
      await user.send({ embeds: [embed] });
    } catch (error) {
      console.error(`Failed to send success DM to user ${user.id}:`, error);
    }
  }

  /**
   * Sends an error message if setup fails
   */
  async sendSetupErrorDM(user: User, errorMessage: string): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('❌ Setup Failed')
      .setDescription(`There was an error during setup: ${errorMessage}`)
      .setColor('#ff0000')
      .setFooter({ text: 'Please try again or contact support\n🐷 Or just send me a DM anytime for the long run oink!' });

    try {
      await user.send({ embeds: [embed] });
    } catch (error) {
      console.error(`Failed to send error DM to user ${user.id}:`, error);
    }
  }

  /**
   * Creates a friendly welcome message for the setup interface
   */
  createWelcomeMessage(): { content: string; embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
    const embed = new EmbedBuilder()
      .setTitle('🔧 Payment Setup Options')
      .setDescription('Choose your preferred payment method below:')
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
        }
      )
      .setFooter({ text: '🐷 Choose your payment method to get started! Or just send me a DM anytime for the long run oink!' });

    const content = '🐷 **Oink!** Choose your preferred payment method below:';

    // Add a helpful button for friend request instructions
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('show_help')
          .setLabel('🐷 Get Help')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❓')
      );

    return { content, embed, components: [row] };
  }

  /**
   * Creates the main setup interface with payment method options
   */
  createSetupOptions(): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
    const embed = new EmbedBuilder()
      .setTitle('🔧 Payment Setup Options')
      .setDescription('Choose your preferred payment method below:')
      .setColor('#00ff00')
      .addFields(
        { name: '💳 ACH/Bank Transfer', value: 'Set up bank account for ACH transfers', inline: true },
        { name: '₿ Crypto', value: 'Set up cryptocurrency wallet', inline: true },
        { name: '🔧 Other', value: 'Set up alternative payment method', inline: true }
      )
      .setFooter({ text: '🐷 Choose your payment method to get started! Or just send me a DM anytime for the long run oink!' });

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

    return { embed, components: [row] };
  }

  /**
   * Creates a friendly message encouraging users to add the bot as a friend
   */
  createFriendRequestMessage(): { content: string; embed: EmbedBuilder } {
    const embed = new EmbedBuilder()
      .setTitle('🐷 Oink! Let\'s be friends! 🐷')
      .setDescription('Adding me as a friend gives you the best experience with private setup instructions and notifications!')
      .setColor('#ff69b4')
      .addFields(
        { 
          name: '🌟 Benefits of adding me:', 
          value: '• Private setup instructions\n• Secure payment confirmations\n• Transaction notifications\n• Better privacy for sensitive info\n• Quick access to commands', 
          inline: false 
        },
        { 
          name: '🤝 How to add me:', 
          value: '1. **Right-click my name** in any message\n2. Select **"Add Friend"**\n3. Accept the friend request\n4. Try the setup command again!', 
          inline: false 
        },
        { 
          name: '💡 Pro tip:', 
          value: 'Friends get priority support and exclusive features! 🎉', 
          inline: false 
        }
      )
      .setFooter({ text: '🐷 More friends = More oinks = More fun! Or just send me a DM anytime for the long run oink!' })
      .setTimestamp();

    const content = '🐷 **Oink!** Want the best experience? Add me as a friend! 🐷';

    return { content, embed };
  }
}
