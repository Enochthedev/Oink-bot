// ConfigSelectMenuHandler handles select menu interactions for configuration
import {
    StringSelectMenuInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { ServerConfigService } from '../../services/ServerConfigService';

export class ConfigSelectMenuHandler {
    private serverConfigService: ServerConfigService;

    constructor(serverConfigService: ServerConfigService) {
        this.serverConfigService = serverConfigService;
    }

    /**
     * Handle payment methods selection
     */
    public async handlePaymentMethodsSelection(interaction: StringSelectMenuInteraction): Promise<void> {
        try {
            if (!interaction.guildId) {
                await interaction.reply({ content: '❌ This can only be used in a server.', ephemeral: true });
                return;
            }

            const selectedMethods = interaction.values;
            
            if (selectedMethods.length === 0) {
                await interaction.reply({
                    content: '❌ Please select at least one payment method.',
                    ephemeral: true
                });
                return;
            }

            // Update or create server configuration
            const config = await this.serverConfigService.getServerConfig(interaction.guildId);
            
            if (config) {
                await this.serverConfigService.upsertServerConfig({
                    serverId: interaction.guildId!,
                    allowedPaymentMethods: selectedMethods as any
                });
            } else {
                await this.serverConfigService.upsertServerConfig({
                    serverId: interaction.guildId!,
                    allowedPaymentMethods: selectedMethods as any,
                    paymentsEnabled: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Payment Methods Updated')
                .setDescription('Allowed payment methods have been successfully updated.')
                .addFields(
                    { 
                        name: 'Selected Methods', 
                        value: selectedMethods.map(method => this.formatPaymentMethod(method)).join('\n'), 
                        inline: false 
                    }
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

            await interaction.update({
                embeds: [embed],
                components: [actionRow]
            });

        } catch (error) {
            console.error('Error handling payment methods selection:', error);
            await interaction.reply({
                content: '❌ Failed to update payment methods. Please try again.',
                ephemeral: true
            });
        }
    }

    /**
     * Format payment method for display
     */
    private formatPaymentMethod(method: string): string {
        const methodMap: { [key: string]: string } = {
            'ach': '🏦 ACH/Bank Transfer',
            'crypto': '₿ Cryptocurrency',
            'card': '💳 Credit/Debit Cards',
            'wallet': '📱 Digital Wallets',
            'other': '🔧 Other Methods'
        };

        return methodMap[method] || method;
    }
}
