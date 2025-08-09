// Config command handler interface
import { CommandInteraction } from 'discord.js';
import { CommandHandler } from './CommandHandler';

export interface ConfigCommandHandler extends CommandHandler {
  handlePaymentConfigCommand(interaction: CommandInteraction): Promise<void>;
}