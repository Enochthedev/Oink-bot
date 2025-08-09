import { Collection, CommandInteraction } from 'discord.js';
import { CommandHandler } from '@handlers/CommandHandler';
import { CommandRegistry } from './CommandRegistry';
import { ServiceContainer } from './ServiceContainer';
import { ErrorHandler } from './ErrorHandler';

export class CommandManager {
    private commands: Collection<string, CommandHandler>;
    private commandRegistry: CommandRegistry;
    private serviceContainer: ServiceContainer;
    private errorHandler: ErrorHandler;

    constructor(serviceContainer: ServiceContainer) {
        this.commands = new Collection();
        this.commandRegistry = CommandRegistry.getInstance();
        this.serviceContainer = serviceContainer;
        this.errorHandler = serviceContainer.errorHandler;
    }

    public initializeCommands(
        paymentHandler: CommandHandler,
        requestHandler: CommandHandler,
        transactionHandler: CommandHandler,
        paymentConfigHandler: CommandHandler
    ): void {
        // Register all command handlers
        this.registerCommand(paymentHandler);
        this.registerCommand(requestHandler);
        this.registerCommand(transactionHandler);
        this.registerCommand(paymentConfigHandler);
        
        // Register setup command handler
        const { SetupCommandHandler } = require('@handlers/setup/SetupCommandHandler');
        const setupHandler = new SetupCommandHandler();
        this.registerCommand(setupHandler);
        
        // Register test command handler for debugging
        const { TestCommandHandler } = require('@handlers/TestCommandHandler');
        const testHandler = new TestCommandHandler();
        this.registerCommand(testHandler);
    }

    public registerCommand(handler: CommandHandler): void {
        this.commands.set(handler.getCommandName(), handler);
    }

    public getCommand(name: string): CommandHandler | undefined {
        return this.commands.get(name);
    }

    public getAllCommands(): CommandHandler[] {
        return Array.from(this.commands.values());
    }

    public getCommandNames(): string[] {
        return Array.from(this.commands.keys());
    }

    public async handleCommand(interaction: CommandInteraction): Promise<void> {
        const handler = this.commands.get(interaction.commandName);

        if (!handler) {
            await this.errorHandler.handleUnknownCommand(interaction);
            return;
        }

        try {
            // Validate parameters before handling
            if (!handler.validateParameters(interaction)) {
                await this.errorHandler.handleValidationError(interaction, 'Invalid command parameters');
                return;
            }

            await handler.handle(interaction);
        } catch (error) {
            console.error(`❌ Oink... error handling command ${interaction.commandName}:`, error);
            await this.errorHandler.handleCommandError(interaction, error as Error);
        }
    }

    public getSlashCommandData(): any[] {
        return this.commandRegistry.getSlashCommandData();
    }

    public validateCommandExists(commandName: string): boolean {
        return this.commands.has(commandName);
    }

    public getCommandMetadata(commandName: string): any {
        return this.commandRegistry.getCommand(commandName);
    }

    public getCommandsByCategory(category: string): CommandHandler[] {
        const commandNames = this.commandRegistry.getCommandsByCategory(category as any).map(cmd => cmd.name);
        return this.getAllCommands().filter(handler => commandNames.includes(handler.getCommandName()));
    }
}
