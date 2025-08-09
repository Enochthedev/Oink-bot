import { CommandInteraction, ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction } from 'discord.js';
import {
    errorHandler,
    ValidationError,
    DiscordAPIError,
    RateLimitError
} from '../utils/ErrorHandler';

export class ErrorHandler {
    /**
     * Handle unknown command errors
     */
    public async handleUnknownCommand(interaction: CommandInteraction): Promise<void> {
        const error = new ValidationError(
            'Unknown command attempted',
            'UNKNOWN_COMMAND',
            'This command is not recognized or not available.'
        );

        await errorHandler.handleError(error, {
            interaction,
            userId: interaction.user.id,
            serverId: interaction.guildId || undefined,
        });
    }

    /**
     * Handle validation errors
     */
    public async handleValidationError(interaction: CommandInteraction, message: string, code = 'VALIDATION_FAILED'): Promise<void> {
        const error = new ValidationError(
            `Validation failed: ${message}`,
            code,
            message
        );

        await errorHandler.handleError(error, {
            interaction,
            userId: interaction.user.id,
            serverId: interaction.guildId || undefined,
        });
    }

    /**
     * Handle general command errors
     */
    public async handleCommandError(interaction: CommandInteraction, error: Error): Promise<void> {
        await errorHandler.handleError(error, {
            interaction,
            userId: interaction.user.id,
            serverId: interaction.guildId || undefined,
            additionalMetadata: {
                commandName: interaction.commandName,
                commandType: interaction.type,
            },
        });
    }

    /**
     * Handle Discord API errors
     */
    public async handleDiscordAPIError(error: Error, context: string, interaction?: CommandInteraction): Promise<void> {
        const discordError = new DiscordAPIError(
            `Discord API error in ${context}: ${error.message}`,
            'DISCORD_API_ERROR',
            'A Discord service error occurred. Please try again later.',
            { context, originalError: error.message }
        );

        await errorHandler.handleError(discordError, {
            interaction,
            additionalMetadata: { context },
        });
    }

    /**
     * Handle permission errors
     */
    public async handlePermissionError(interaction: CommandInteraction): Promise<void> {
        const error = new ValidationError(
            'Permission denied for command',
            'PERMISSION_DENIED',
            'You do not have permission to use this command.',
            { commandName: interaction.commandName }
        );

        await errorHandler.handleError(error, {
            interaction,
            userId: interaction.user.id,
            serverId: interaction.guildId || undefined,
        });
    }

    /**
     * Handle rate limiting errors
     */
    public async handleRateLimitError(interaction: CommandInteraction, retryAfter?: number): Promise<void> {
        const retryMessage = retryAfter
            ? `Please try again in ${Math.ceil(retryAfter / 1000)} seconds.`
            : 'Please try again later.';

        const error = new RateLimitError(
            'Rate limit exceeded',
            'RATE_LIMITED',
            retryAfter,
            `You're sending commands too quickly. ${retryMessage}`,
            { retryAfter, commandName: interaction.commandName }
        );

        await errorHandler.handleError(error, {
            interaction,
            userId: interaction.user.id,
            serverId: interaction.guildId || undefined,
        });
    }

    /**
     * Handle button interaction errors
     */
    public async handleButtonError(interaction: ButtonInteraction, error: Error): Promise<void> {
        await errorHandler.handleError(error, {
            interaction,
            userId: interaction.user.id,
            serverId: interaction.guildId || undefined,
            additionalMetadata: {
                customId: interaction.customId,
                interactionType: 'button',
            },
        });
    }

    /**
     * Handle select menu interaction errors
     */
    public async handleSelectMenuError(interaction: StringSelectMenuInteraction, error: Error): Promise<void> {
        await errorHandler.handleError(error, {
            interaction,
            userId: interaction.user.id,
            serverId: interaction.guildId || undefined,
            additionalMetadata: {
                customId: interaction.customId,
                values: interaction.values,
                interactionType: 'selectMenu',
            },
        });
    }

    /**
     * Handle modal submit interaction errors
     */
    public async handleModalError(interaction: ModalSubmitInteraction, error: Error): Promise<void> {
        await errorHandler.handleError(error, {
            interaction,
            userId: interaction.user.id,
            serverId: interaction.guildId || undefined,
            additionalMetadata: {
                customId: interaction.customId,
                interactionType: 'modal',
            },
        });
    }
}