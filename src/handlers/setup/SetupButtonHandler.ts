// SetupButtonHandler handles button interactions during setup
import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} from 'discord.js';
import { UserAccountService } from '../../services/UserAccountService';

export class SetupButtonHandler {
  private userAccountService: UserAccountService;

  constructor(userAccountService: UserAccountService) {
    this.userAccountService = userAccountService;
  }

  /**
   * Handles button interactions during setup
   */
  async handleSetupButton(interaction: ButtonInteraction): Promise<void> {
    const { customId } = interaction;

    try {
      switch (customId) {
        case 'setup_crypto':
          await this.showCryptoSetupModal(interaction);
          break;
        case 'setup_ach':
          await this.showACHSetupModal(interaction);
          break;
        case 'setup_other':
          await this.showOtherSetupModal(interaction);
          break;
        case 'show_friend_help':
          await this.showFriendHelp(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown setup option',
            flags: 64
          });
      }
    } catch (error) {
      await interaction.reply({
        content: '❌ An error occurred while processing your selection',
        flags: 64
      });
      console.error('Setup button error:', error);
    }
  }

  /**
   * Shows the cryptocurrency setup modal
   */
  private async showCryptoSetupModal(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId('setup_crypto_modal')
      .setTitle('Cryptocurrency Setup');

    const walletAddressInput = new TextInputBuilder()
      .setCustomId('crypto_wallet_address')
      .setLabel('Wallet Address')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your cryptocurrency wallet address')
      .setRequired(true);

    const cryptoTypeInput = new TextInputBuilder()
      .setCustomId('crypto_type')
      .setLabel('Cryptocurrency Type')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Bitcoin, Ethereum, USDC')
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(walletAddressInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(cryptoTypeInput);

    modal.addComponents(firstActionRow, secondActionRow);
    await interaction.showModal(modal);
  }

  /**
   * Shows the ACH setup modal
   */
  private async showACHSetupModal(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId('setup_ach_modal')
      .setTitle('ACH/Bank Transfer Setup');

    const accountNumberInput = new TextInputBuilder()
      .setCustomId('ach_account_number')
      .setLabel('Account Number')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your bank account number')
      .setRequired(true);

    const routingNumberInput = new TextInputBuilder()
      .setCustomId('ach_routing_number')
      .setLabel('Routing Number')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your bank routing number')
      .setRequired(true);

    const bankNameInput = new TextInputBuilder()
      .setCustomId('ach_bank_name')
      .setLabel('Bank Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your bank name')
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(accountNumberInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(routingNumberInput);
    const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(bankNameInput);

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
    await interaction.showModal(modal);
  }

  /**
   * Shows the other payment method setup modal
   */
  private async showOtherSetupModal(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId('setup_other_modal')
      .setTitle('Alternative Payment Method Setup');

    const methodTypeInput = new TextInputBuilder()
      .setCustomId('other_method_type')
      .setLabel('Payment Method Type')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., PayPal, Venmo, Cash App')
      .setRequired(true);

    const accountInfoInput = new TextInputBuilder()
      .setCustomId('other_account_info')
      .setLabel('Account Information')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Provide details about your payment method (email, username, etc.)')
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(methodTypeInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(accountInfoInput);

    modal.addComponents(firstActionRow, secondActionRow);
    await interaction.showModal(modal);
  }

  /**
   * Shows friend request help when the user can't receive DMs
   */
  private async showFriendHelp(interaction: ButtonInteraction): Promise<void> {
    const { EmbedBuilder } = await import('discord.js');
    
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
      .setFooter({ text: '🐷 More friends = More oinks = More fun!' })
      .setTimestamp();

    await interaction.reply({
      content: '🐷 **Oink!** Want the best experience? Add me as a friend! 🐷',
      embeds: [embed],
      flags: 64
    });
  }
}
