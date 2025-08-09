// ConfigModalHandler handles modal interactions for configuration
import {
    ModalSubmitInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { ServerConfigService } from '../../services/ServerConfigService';

export class ConfigModalHandler {
    private serverConfigService: ServerConfigService;

    constructor(serverConfigService: ServerConfigService) {
        this.serverConfigService = serverConfigService;
    }

    /**
     * Handle limits modal
     */
    public async handleLimitsModal(interaction: ModalSubmitInteraction): Promise<void> {
        try {
            if (!interaction.guildId) {
                await interaction.reply({ content: '❌ This can only be used in a server.', ephemeral: true });
                return;
            }

            const dailyLimit = interaction.fields.getTextInputValue('daily_limit');
            const transactionLimit = interaction.fields.getTextInputValue('transaction_limit');

            // Validate inputs
            const dailyLimitNum = parseFloat(dailyLimit);
            const transactionLimitNum = parseFloat(transactionLimit);

            if (isNaN(dailyLimitNum) || dailyLimitNum < 0) {
                await interaction.reply({
                    content: '❌ Invalid daily limit. Please enter a valid number.',
                    ephemeral: true
                });
                return;
            }

            if (isNaN(transactionLimitNum) || transactionLimitNum < 0) {
                await interaction.reply({
                    content: '❌ Invalid transaction limit. Please enter a valid number.',
                    ephemeral: true
                });
                return;
            }

            if (transactionLimitNum > dailyLimitNum) {
                await interaction.reply({
                    content: '❌ Transaction limit cannot be greater than daily limit.',
                    ephemeral: true
                });
                return;
            }

            // Update or create server configuration
            const config = await this.serverConfigService.getServerConfig(interaction.guildId);
            
            if (config) {
                await this.serverConfigService.upsertServerConfig({
                    serverId: interaction.guildId!,
                    dailyLimits: {
                        maxAmountPerUser: dailyLimitNum,
                        maxTransactionsPerUser: transactionLimitNum
                    }
                });
            } else {
                await this.serverConfigService.upsertServerConfig({
                    serverId: interaction.guildId!,
                    dailyLimits: {
                        maxAmountPerUser: dailyLimitNum,
                        maxTransactionsPerUser: transactionLimitNum
                    },
                    paymentsEnabled: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Limits Updated')
                .setDescription('Payment limits have been successfully updated.')
                .addFields(
                    { name: 'Daily Limit', value: `$${dailyLimitNum}`, inline: true },
                    { name: 'Transaction Limit', value: `$${transactionLimitNum}`, inline: true }
                )
                .setColor(0x00ff00)
                .setTimestamp();

            const actionRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_back_to_main')
                        .setLabel('Back to Main Menu')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.reply({
                embeds: [embed],
                components: [actionRow],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error handling limits modal:', error);
            await interaction.reply({
                content: '❌ Failed to update limits. Please try again.',
                ephemeral: true
            });
        }
    }
}
