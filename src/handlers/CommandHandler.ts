import { CommandInteraction } from 'discord.js';

export interface CommandHandler {
  /**
   * Handle the command interaction
   */
  handle(interaction: CommandInteraction): Promise<void>;

  /**
   * Validate command parameters
   */
  validateParameters(interaction: CommandInteraction): boolean;

  /**
   * Get the command name this handler responds to
   */
  getCommandName(): string;
}

/**
 * Abstract base class for command handlers with common functionality
 */
export abstract class BaseCommandHandler implements CommandHandler {
  abstract handle(interaction: CommandInteraction): Promise<void>;
  abstract getCommandName(): string;

  /**
   * Default parameter validation - can be overridden by subclasses
   */
  public validateParameters(interaction: CommandInteraction): boolean {
    // Basic validation - ensure command name matches
    return interaction.commandName === this.getCommandName();
  }

  /**
   * Check if user has required permissions
   */
  protected hasPermission(interaction: CommandInteraction, requiredPermissions?: string[]): boolean {
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    if (!interaction.memberPermissions) {
      return false;
    }

    return requiredPermissions.every(permission =>
      interaction.memberPermissions?.has(permission as any)
    );
  }

  /**
   * Safely defer the interaction reply
   */
  protected async deferReply(interaction: CommandInteraction, ephemeral: boolean = false): Promise<void> {
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({ ephemeral });
      }
    } catch (error) {
      // If deferring fails, log it but don't throw - the interaction might already be handled
      console.warn(`Failed to defer reply for ${interaction.commandName}:`, error);
    }
  }

  /**
   * Safely reply to interaction
   */
  protected async safeReply(interaction: CommandInteraction, content: any): Promise<void> {
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(content);
      } else {
        await interaction.reply(content);
      }
    } catch (error) {
      console.error(`Failed to reply to interaction ${interaction.commandName}:`, error);
      // Try to send a follow-up if the initial reply failed
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'An error occurred while processing your request. Please try again.',
            ephemeral: true
          });
        }
      } catch (followUpError) {
        console.error('Failed to send follow-up error message:', followUpError);
      }
    }
  }
}