// Core SetupCommandHandler that orchestrates the setup flow
import {
  CommandInteraction,
  User
} from 'discord.js';
import { BaseCommandHandler } from '../CommandHandler';
import { UserAccountService, UserAccountServiceImpl } from '../../services/UserAccountService';
import { InputValidator } from '../../utils/InputValidator';
import { rateLimiters } from '../../utils/RateLimiter';
import { auditLogger, AuditEventType, AuditSeverity } from '../../utils/AuditLogger';
import { errorHandler, ValidationError } from '../../utils/ErrorHandler';
import { SetupFlowOrchestrator } from './SetupFlowOrchestrator';

export interface SetupCommandHandler {
  handleSetupCommand(interaction: CommandInteraction): Promise<void>;
}

/**
 * Main SetupCommandHandler that orchestrates the setup flow
 */
export class SetupCommandHandler extends BaseCommandHandler {
  private userAccountService: UserAccountService;
  private setupFlowOrchestrator: SetupFlowOrchestrator;

  constructor(userAccountService?: UserAccountService) {
    super();
    this.userAccountService = userAccountService || new UserAccountServiceImpl();
    this.setupFlowOrchestrator = new SetupFlowOrchestrator(this.userAccountService);
  }

  public getCommandName(): string {
    return 'setup-payment';
  }

  public validateParameters(interaction: CommandInteraction): boolean {
    return super.validateParameters(interaction);
  }

  public async handle(interaction: CommandInteraction): Promise<void> {
    try {
      // Rate limiting check
      await rateLimiters.checkSetupLimit(interaction.user.id);

      // Validate user ID
      const userIdValidation = InputValidator.validateDiscordId(interaction.user.id);
      if (!userIdValidation.isValid) {
        throw new ValidationError(
          'Invalid user ID',
          'INVALID_USER_ID',
          'Unable to process setup request'
        );
      }

      const user = interaction.user;

      // Log setup initiation
      await auditLogger.logEvent({
        eventType: AuditEventType.ACCOUNT_SETUP_STARTED,
        severity: AuditSeverity.INFO,
        userId: user.id,
        details: {
          initiatedVia: 'command',
          serverId: interaction.guildId,
        },
      });

      // Check if user already has an account
      const existingAccount = await this.userAccountService.getAccount(user.id);

      if (!existingAccount) {
        // Create new account first
        await this.userAccountService.createAccount(user.id);
      }

      // Initialize the setup flow
      await this.setupFlowOrchestrator.initiateSetup(user);

      // Show the setup interface directly
      console.log(`🐷 Showing setup interface for user ${user.id}`);
      
      const { content, embed, components: welcomeComponents } = this.setupFlowOrchestrator.getDMHandler().createWelcomeMessage();
      const { embed: setupEmbed, components: setupComponents } = this.setupFlowOrchestrator.getDMHandler().createSetupOptions();
      
      // Combine all components
      const allComponents = [...welcomeComponents, ...setupComponents];
      
      await interaction.reply({
        content: content,
        embeds: [embed, setupEmbed],
        components: allComponents,
        flags: 64
      });

    } catch (error) {
      // Handle errors normally
      await errorHandler.handleError(error as Error, {
        interaction,
        userId: interaction.user.id,
        serverId: interaction.guildId || undefined,
        additionalMetadata: {
          command: 'setup-payment',
          action: 'initiate_setup'
        }
      });
    }
  }
}
