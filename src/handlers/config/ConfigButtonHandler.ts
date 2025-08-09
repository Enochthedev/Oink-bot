// ConfigButtonHandler handles all button interactions for configuration
import {
    ButtonInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} from 'discord.js';
import { ServerConfigService } from '../../services/ServerConfigService';

export class ConfigButtonHandler {
    private serverConfigService: ServerConfigService;

    constructor(serverConfigService: ServerConfigService) {
        this.serverConfigService = serverConfigService;
    }

    /**
     * Handle toggle payments button
     */
    public async handleTogglePayments(interaction: ButtonInteraction): Promise<void> {
        try {
            if (!interaction.guildId) {
                await interaction.reply({ content: '❌ This can only be used in a server.', ephemeral: true });
                return;
            }

            const config = await this.serverConfigService.getServerConfig(interaction.guildId);
            const newStatus = !(config?.paymentsEnabled ?? false);

            if (config) {
                await this.serverConfigService.upsertServerConfig({
                    serverId: interaction.guildId,
                    paymentsEnabled: newStatus
                });
            } else {
                await this.serverConfigService.upsertServerConfig({
                    serverId: interaction.guildId,
                    paymentsEnabled: newStatus
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Payments Toggled')
                .setDescription(`Payments are now ${newStatus ? 'enabled' : 'disabled'} for this server.`)
                .setColor(newStatus ? 0x00ff00 : 0xff0000)
                .setTimestamp();

            const actionRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_back_to_main')
                        .setLabel('Back to Main Menu')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.update({
                embeds: [embed],
                components: [actionRow]
            });

        } catch (error) {
            console.error('Error toggling payments:', error);
            await interaction.reply({
                content: '❌ Failed to toggle payments. Please try again.',
                ephemeral: true
            });
        }
    }

    /**
     * Handle set limits button
     */
    public async handleSetLimits(interaction: ButtonInteraction): Promise<void> {
        try {
            const embed = new EmbedBuilder()
                .setTitle('💰 Set Payment Limits')
                .setDescription('Click the button below to set daily and transaction limits.')
                .setColor(0x0099ff)
                .setTimestamp();

            const actionRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_set_limits_modal')
                        .setLabel('Set Limits')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('config_back_to_main')
                        .setLabel('Back to Main Menu')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.update({
                embeds: [embed],
                components: [actionRow]
            });

        } catch (error) {
            console.error('Error showing limits menu:', error);
            await interaction.reply({
                content: '❌ Failed to show limits menu. Please try again.',
                ephemeral: true
            });
        }
    }

    /**
     * Handle payment methods button
     */
    public async handlePaymentMethods(interaction: ButtonInteraction): Promise<void> {
        try {
            const embed = new EmbedBuilder()
                .setTitle('💳 Payment Methods')
                .setDescription('Select which payment methods are allowed on this server.')
                .setColor(0x0099ff)
                .setTimestamp();

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('config_payment_methods_select')
                .setPlaceholder('Select payment methods')
                .setMinValues(1)
                .setMaxValues(5)
                .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel('ACH/Bank Transfer')
                        .setValue('ach')
                        .setDescription('Allow bank transfers and ACH payments'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Cryptocurrency')
                        .setValue('crypto')
                        .setDescription('Allow cryptocurrency payments'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Credit/Debit Cards')
                        .setValue('card')
                        .setDescription('Allow credit and debit card payments'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Digital Wallets')
                        .setValue('wallet')
                        .setDescription('Allow digital wallet payments'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Other Methods')
                        .setValue('other')
                        .setDescription('Allow other payment methods')
                ]);

            const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(selectMenu);

            const buttonRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_back_to_main')
                        .setLabel('Back to Main Menu')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.update({
                embeds: [embed],
                components: [actionRow, buttonRow]
            });

        } catch (error) {
            console.error('Error showing payment methods menu:', error);
            await interaction.reply({
                content: '❌ Failed to show payment methods menu. Please try again.',
                ephemeral: true
            });
        }
    }

    /**
     * Handle manage admins button
     */
    public async handleManageAdmins(interaction: ButtonInteraction): Promise<void> {
        try {
            const embed = new EmbedBuilder()
                .setTitle('👑 Manage Server Admins')
                .setDescription('Manage which users can configure payment settings.')
                .setColor(0x0099ff)
                .setTimestamp();

            const actionRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_add_admin')
                        .setLabel('Add Admin')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('config_remove_admin')
                        .setLabel('Remove Admin')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('config_list_admins')
                        .setLabel('List Admins')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('config_back_to_main')
                        .setLabel('Back to Main Menu')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.update({
                embeds: [embed],
                components: [actionRow]
            });

        } catch (error) {
            console.error('Error showing admin management menu:', error);
            await interaction.reply({
                content: '❌ Failed to show admin management menu. Please try again.',
                ephemeral: true
            });
        }
    }

    /**
     * Handle back to main button
     */
    public async handleBackToMain(interaction: ButtonInteraction): Promise<void> {
        try {
            if (!interaction.guildId) {
                await interaction.reply({ content: '❌ This can only be used in a server.', ephemeral: true });
                return;
            }

            const config = await this.serverConfigService.getServerConfig(interaction.guildId);
            
            // This will be handled by the orchestrator calling the menu handler
            // For now, just acknowledge the interaction
            await interaction.deferUpdate();

        } catch (error) {
            console.error('Error going back to main menu:', error);
            await interaction.reply({
                content: '❌ Failed to return to main menu. Please try again.',
                ephemeral: true
            });
        }
    }

    /**
     * Handle refresh button
     */
    public async handleRefresh(interaction: ButtonInteraction): Promise<void> {
        try {
            if (!interaction.guildId) {
                await interaction.reply({ content: '❌ This can only be used in a server.', ephemeral: true });
                return;
            }

            const config = await this.serverConfigService.getServerConfig(interaction.guildId);
            
            // This will be handled by the orchestrator calling the menu handler
            // For now, just acknowledge the interaction
            await interaction.deferUpdate();

        } catch (error) {
            console.error('Error refreshing configuration:', error);
            await interaction.reply({
                content: '❌ Failed to refresh configuration. Please try again.',
                ephemeral: true
            });
        }
    }
}
