import { ChatInputCommandInteraction } from 'discord.js';
import { BaseCommandHandler } from './CommandHandler';

export class TestCommandHandler extends BaseCommandHandler {
    public getCommandName(): string {
        return 'test';
    }

    public async handle(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.reply({
            content: '🐷 Oink! Test command is working! The routing system is functional! 🐽✨',
            ephemeral: true
        });
    }

    public async handleDMTest(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const user = interaction.user;
            
            // First, try to send a DM
            await user.send({
                content: '🐷 Oink! This is a test DM to verify I can send you direct messages! 🐽✨',
                flags: 64 as any
            });
            
            await interaction.reply({
                content: '✅ Test DM sent successfully! Check your direct messages. If you received it, DMs are working! 🐷',
                ephemeral: true
            });
        } catch (error) {
            console.error('🐷 DM test failed:', error);
            
            await interaction.reply({
                content: `❌ Failed to send test DM: ${error instanceof Error ? error.message : 'Unknown error'}\n\nThis usually means:\n• You have DMs disabled for this bot\n• The bot doesn\'t have permission to send DMs\n• Discord is blocking the message`,
                ephemeral: true
            });
        }
    }

    /**
     * Handle the test-dm command
     */
    public async handleTestDM(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const user = interaction.user;
            console.log(`🐷 Testing DM functionality for user: ${user.tag} (${user.id})`);
            
            // Try to send a test DM
            await user.send({
                content: '🐷 Oink! This is a test DM from your bot! If you received this, DMs are working perfectly! 🐽✨',
                flags: 64 as any
            });
            
            console.log(`🐷 Successfully sent test DM to ${user.tag}`);
            
            await interaction.reply({
                content: '✅ Test DM sent successfully! Check your direct messages. If you received it, DMs are working! 🐷',
                ephemeral: true
            });
        } catch (error) {
            console.error('🐷 DM test failed:', error);
            
            await interaction.reply({
                content: `❌ Failed to send test DM: ${error instanceof Error ? error.message : 'Unknown error'}\n\nThis usually means:\n• You have DMs disabled for this bot\n• The bot doesn\'t have permission to send DMs\n• Discord is blocking the message\n\nTry running \`/test-dm\` again or check your Discord privacy settings.`,
                ephemeral: true
            });
        }
    }

    /**
     * Test DM handler status
     */
    public async handleDMStatusTest(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            // Get the DM handler from the bot
            const bot = interaction.client;
            const dmHandler = (bot as any).dmHandler; // Access the DM handler
            
            if (!dmHandler) {
                await interaction.reply({
                    content: '❌ DM Handler not found on bot client',
                    ephemeral: true
                });
                return;
            }
            
            // Test DM handler status
            const status = await dmHandler.testDMHandler();
            
            await interaction.reply({
                content: `🐷 DM Handler Status:\n\`\`\`\n${status}\n\`\`\``,
                ephemeral: true
            });
        } catch (error) {
            console.error('🐷 DM status test failed:', error);
            
            await interaction.reply({
                content: `❌ Failed to get DM handler status: ${error instanceof Error ? error.message : 'Unknown error'}`,
                ephemeral: true
            });
        }
    }

    public validateParameters(_interaction: ChatInputCommandInteraction): boolean {
        // Always return true for test command
        return true;
    }
}
