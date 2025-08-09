// FriendRequestCommandHandler helps users add the bot as a friend
import {
  CommandInteraction
} from 'discord.js';
import { BaseCommandHandler } from '../CommandHandler';
import { SetupDMHandler } from './SetupDMHandler';

export interface FriendRequestCommandHandler {
  handleFriendRequestCommand(interaction: CommandInteraction): Promise<void>;
}

/**
 * Command handler for friend request instructions
 */
export class FriendRequestCommandHandler extends BaseCommandHandler {
  private dmHandler: SetupDMHandler;

  constructor() {
    super();
    this.dmHandler = new SetupDMHandler();
  }

  public getCommandName(): string {
    return 'add-friend';
  }

  public validateParameters(interaction: CommandInteraction): boolean {
    return super.validateParameters(interaction);
  }

  public async handle(interaction: CommandInteraction): Promise<void> {
    try {
      const { content, embed } = this.dmHandler.createFriendRequestMessage();
      
      await interaction.reply({
        content: content,
        embeds: [embed],
        flags: 64
      });

    } catch (error) {
      console.error('FriendRequestCommandHandler error:', error);
      await interaction.reply({
        content: '❌ Oink... Something went wrong while showing friend request instructions.',
        flags: 64
      });
    }
  }
}
