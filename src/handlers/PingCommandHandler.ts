import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { BaseCommandHandler } from './CommandHandler';

/**
 * Simple ping command handler for testing the command system
 */
export class PingCommandHandler extends BaseCommandHandler {
    public getCommandName(): string {
        return 'ping';
    }

    public async handle(interaction: CommandInteraction): Promise<void> {
        await this.deferReply(interaction);

        const embed = new EmbedBuilder()
            .setColor(0xFF69B4) // Pink color for pig theme
            .setTitle('🐷 Oink Oink Pong! 🐽')
            .setDescription('🐷 Oink! I\'m responding correctly, little piggy! 🐽✨')
            .addFields(
                { name: '🐷 Response Time', value: `${Date.now() - interaction.createdTimestamp}ms`, inline: true },
                { name: '🐽 API Latency', value: `${Math.round(interaction.client.ws.ping)}ms`, inline: true }
            )
            .setFooter({ text: 'Oink Bot - Your friendly piggy payment assistant! 🐷💰' })
            .setTimestamp();

        await this.safeReply(interaction, { embeds: [embed] });
    }

    public validateParameters(interaction: CommandInteraction): boolean {
        // Ping command has no parameters to validate
        return super.validateParameters(interaction);
    }
}