// ConfigMenuHandler handles the main configuration menu display and error handling
import {
    CommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { ServerConfigService } from '../../services/ServerConfigService';
import { ServerConfig } from '../../models/ServerConfig';

export class ConfigMenuHandler {
    private serverConfigService: ServerConfigService;

    constructor(serverConfigService: ServerConfigService) {
        this.serverConfigService = serverConfigService;
    }

    /**
     * Show the main configuration menu
     */
    public async showConfigurationMenu(interaction: CommandInteraction, config: ServerConfig | null): Promise<void> {
        const embed = this.createConfigurationEmbed(config);
        const actionRow = this.createConfigurationButtons();

        await interaction.editReply({
            embeds: [embed],
            components: [actionRow],
        });
    }

    /**
     * Handle not in server error
     */
    public async handleNotInServer(interaction: CommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction): Promise<void> {
        const content = '❌ This command can only be used in a Discord server.';
        
        if (interaction.isRepliable()) {
            await interaction.reply({ content, ephemeral: true });
        } else {
            await interaction.editReply({ content });
        }
    }

    /**
     * Handle insufficient permissions error
     */
    public async handleInsufficientPermissions(interaction: CommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction): Promise<void> {
        const content = '❌ You do not have permission to configure payment settings. You need Administrator or Manage Server permissions.';
        
        if (interaction.isRepliable()) {
            await interaction.reply({ content, ephemeral: true });
        } else {
            await interaction.editReply({ content });
        }
    }

    /**
     * Handle configuration error
     */
    public async handleConfigError(interaction: CommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction, error: Error): Promise<void> {
        console.error('Configuration error:', error);
        
        const content = '❌ An error occurred while processing the configuration. Please try again or contact an administrator.';
        
        if (interaction.isRepliable()) {
            await interaction.reply({ content, ephemeral: true });
        } else {
            await interaction.editReply({ content });
        }
    }

    /**
     * Create the configuration embed
     */
    private createConfigurationEmbed(config: ServerConfig | null): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle('🔧 Payment Configuration')
            .setDescription('Configure payment settings for this server.')
            .setColor(0x0099ff)
            .setTimestamp();

        if (config) {
            embed.addFields(
                { name: 'Payments Enabled', value: config.paymentsEnabled ? '✅ Yes' : '❌ No', inline: true },
                { name: 'Daily Limit', value: `$${config.dailyLimits.maxAmountPerUser || 'Not set'}`, inline: true },
                { name: 'Transaction Limit', value: `$${config.dailyLimits.maxTransactionsPerUser || 'Not set'}`, inline: true },
                { name: 'Allowed Payment Methods', value: config.allowedPaymentMethods?.join(', ') || 'All methods', inline: false }
            );
        } else {
            embed.addFields(
                { name: 'Status', value: '⚠️ No configuration found. Use the buttons below to set up payment settings.', inline: false }
            );
        }

        return embed;
    }

    /**
     * Create the configuration action buttons
     */
    private createConfigurationButtons(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_toggle_payments')
                    .setLabel('Toggle Payments')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('config_set_limits')
                    .setLabel('Set Limits')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('config_payment_methods')
                    .setLabel('Payment Methods')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('config_manage_admins')
                    .setLabel('Manage Admins')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('config_refresh')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary)
            );
    }
}
