import { Collection, CommandInteraction, EmbedBuilder, ColorResolvable } from 'discord.js';
import { CommandHandler } from '@handlers/CommandHandler';
import { EnhancedCommandRegistry, EnhancedCommandDefinition } from './EnhancedCommandRegistry';
import { ServiceContainer } from './ServiceContainer';
import { ErrorHandler } from './ErrorHandler';
import { CommandCategory } from './CommandRegistry';

export class EnhancedCommandManager {
    private commands: Collection<string, CommandHandler>;
    private commandRegistry: EnhancedCommandRegistry;
    private serviceContainer: ServiceContainer;
    private errorHandler: ErrorHandler;
    private cooldowns: Map<string, Map<string, number>> = new Map(); // command -> user -> timestamp
    private userAccountService: any; // Will be set during initialization

    constructor(serviceContainer: ServiceContainer) {
        this.commands = new Collection();
        this.commandRegistry = EnhancedCommandRegistry.getInstance();
        this.serviceContainer = serviceContainer;
        this.errorHandler = serviceContainer.errorHandler;
    }

    public initializeCommands(
        paymentHandler: CommandHandler,
        requestHandler: CommandHandler,
        transactionHandler: CommandHandler,
        paymentConfigHandler: CommandHandler,
        userAccountService: any
    ): void {
        this.userAccountService = userAccountService;
        
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
        const commandName = interaction.commandName;
        const handler = this.commands.get(commandName);

        if (!handler) {
            await this.errorHandler.handleUnknownCommand(interaction);
            return;
        }

        try {
            // Check cooldown
            if (!this.checkCooldown(commandName, interaction.user.id)) {
                const command = this.commandRegistry.getCommand(commandName);
                if (command && command.cooldown) {
                    const remaining = this.getCooldownRemaining(commandName, interaction.user.id);
                    await interaction.reply({
                        content: `🐷 Oink! Please wait ${remaining} seconds before using \`${commandName}\` again.`,
                        ephemeral: true
                    });
                    return;
                }
            }

            // Validate parameters before handling
            if (!handler.validateParameters(interaction)) {
                await this.errorHandler.handleValidationError(interaction, 'Invalid command parameters');
                return;
            }

            // Check if command requires setup
            const command = this.commandRegistry.getCommand(commandName);
            if (command && command.requiresSetup) {
                const userAccount = await this.userAccountService.getAccount(interaction.user.id);
                if (!userAccount || !userAccount.isSetupComplete) {
                    await interaction.reply({
                        content: '🐷 Oink! You need to complete setup first. Use `/setup-payment` to get started!',
                        ephemeral: true
                    });
                    return;
                }
            }

            // Set cooldown
            if (command && command.cooldown) {
                this.setCooldown(commandName, interaction.user.id);
            }

            // Handle the command
            await handler.handle(interaction);

        } catch (error) {
            console.error(`❌ Oink... error handling command ${commandName}:`, error);
            await this.errorHandler.handleCommandError(interaction, error as Error);
        }
    }

    public getSlashCommandData(): any[] {
        return this.commandRegistry.getSlashCommandData();
    }

    public validateCommandExists(commandName: string): boolean {
        return this.commands.has(commandName);
    }

    public getCommandMetadata(commandName: string): EnhancedCommandDefinition | undefined {
        return this.commandRegistry.getCommand(commandName);
    }

    public getCommandsByCategory(category: string): CommandHandler[] {
        const commandNames = this.commandRegistry.getCommandsByCategory(category as CommandCategory).map(cmd => cmd.name);
        return this.getAllCommands().filter(handler => commandNames.includes(handler.getCommandName()));
    }

    // Cooldown management
    private checkCooldown(commandName: string, userId: string): boolean {
        const commandCooldowns = this.cooldowns.get(commandName);
        if (!commandCooldowns) return true;

        const lastUsed = commandCooldowns.get(userId);
        if (!lastUsed) return true;

        const command = this.commandRegistry.getCommand(commandName);
        if (!command || !command.cooldown) return true;

        const now = Date.now();
        const timeDiff = now - lastUsed;
        const cooldownMs = command.cooldown * 1000;

        return timeDiff >= cooldownMs;
    }

    private setCooldown(commandName: string, userId: string): void {
        if (!this.cooldowns.has(commandName)) {
            this.cooldowns.set(commandName, new Map());
        }
        this.cooldowns.get(commandName)!.set(userId, Date.now());
    }

    private getCooldownRemaining(commandName: string, userId: string): number {
        const commandCooldowns = this.cooldowns.get(commandName);
        if (!commandCooldowns) return 0;

        const lastUsed = commandCooldowns.get(userId);
        if (!lastUsed) return 0;

        const command = this.commandRegistry.getCommand(commandName);
        if (!command || !command.cooldown) return 0;

        const now = Date.now();
        const timeDiff = now - lastUsed;
        const cooldownMs = command.cooldown * 1000;
        const remaining = Math.ceil((cooldownMs - timeDiff) / 1000);

        return Math.max(0, remaining);
    }

    // Help system
    public async handleHelpCommand(interaction: CommandInteraction): Promise<void> {
        if (!interaction.isChatInputCommand()) {
            await interaction.reply({ content: 'This command can only be used as a slash command.', ephemeral: true });
            return;
        }
        
        const commandOption = interaction.options.getString('command');
        const categoryOption = interaction.options.getString('category');

        if (commandOption) {
            await this.showCommandHelp(interaction, commandOption);
        } else if (categoryOption) {
            await this.showCategoryHelp(interaction, categoryOption as CommandCategory);
        } else {
            await this.showGeneralHelp(interaction);
        }
    }

    private async showCommandHelp(interaction: CommandInteraction, commandName: string): Promise<void> {
        const command = this.commandRegistry.getCommand(commandName);
        
        if (!command) {
            await interaction.reply({
                content: `🐷 Oink! Command \`${commandName}\` not found. Use \`/help\` to see all available commands.`,
                ephemeral: true
            });
            return;
        }

        const helpText = this.commandRegistry.getCommandHelp(commandName);
        if (!helpText) {
            await interaction.reply({
                content: `🐷 Oink! No help available for \`${commandName}\`.`,
                ephemeral: true
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`🐷 Help: ${command.name}`)
            .setDescription(helpText)
            .setColor(this.getCategoryColor(command.category))
            .setFooter({ text: 'Oink Bot Help System' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    private async showCategoryHelp(interaction: CommandInteraction, category: CommandCategory): Promise<void> {
        const helpText = this.commandRegistry.getCategoryHelp(category);
        
        if (!helpText) {
            await interaction.reply({
                content: `🐷 Oink! No commands found in category \`${category}\`.`,
                ephemeral: true
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`🐷 ${category.charAt(0).toUpperCase() + category.slice(1)} Commands`)
            .setDescription(helpText)
            .setColor(this.getCategoryColor(category))
            .setFooter({ text: 'Oink Bot Help System' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    private async showGeneralHelp(interaction: CommandInteraction): Promise<void> {
        const stats = this.commandRegistry.getCommandStats();
        
        const embed = new EmbedBuilder()
            .setTitle('🐷 Oink Bot Help')
            .setDescription('Welcome to Oink Bot! Here are all the available commands organized by category.')
            .addFields(
                { name: '📊 Command Statistics', value: `Total Commands: ${stats.total}\nCommands with Cooldowns: ${stats.withCooldowns}\nCommands Requiring Setup: ${stats.requiringSetup}`, inline: false },
                { name: '💰 Payment', value: 'Commands for sending and managing payments', inline: true },
                { name: '📋 Requests', value: 'Commands for payment requests', inline: true },
                { name: '📊 Transactions', value: 'Commands for viewing transaction history', inline: true },
                { name: '⚙️ Setup', value: 'Commands for initial setup and configuration', inline: true },
                { name: '🔧 Config', value: 'Admin commands for server configuration', inline: true },
                { name: '🛠️ Utility', value: 'General utility commands', inline: true }
            )
            .addFields(
                { name: '💡 Usage Tips', value: '• Use `/help <command>` for detailed help on a specific command\n• Use `/help <category>` to see all commands in a category\n• Commands with cooldowns show remaining wait time\n• Some commands require setup - use `/setup-payment` first!', inline: false }
            )
            .setColor('#FF6B6B')
            .setFooter({ text: 'Oink Bot Help System • Use /help <command> for detailed help' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    private getCategoryColor(category: CommandCategory): ColorResolvable {
        const colors: Record<CommandCategory, ColorResolvable> = {
            [CommandCategory.PAYMENT]: '#4CAF50',      // Green
            [CommandCategory.REQUESTS]: '#FF9800',     // Orange
            [CommandCategory.TRANSACTIONS]: '#2196F3',  // Blue
            [CommandCategory.SETUP]: '#9C27B0',        // Purple
            [CommandCategory.CONFIG]: '#F44336',       // Red
            [CommandCategory.UTILITY]: '#607D8B',      // Blue Grey
            [CommandCategory.ADMIN]: '#FF5722',        // Deep Orange
            [CommandCategory.HELP]: '#FF6B6B'          // Light Red
        };
        return colors[category] || '#607D8B';
    }

    // Command search functionality
    public async searchCommands(interaction: CommandInteraction, query: string): Promise<void> {
        const results = this.commandRegistry.searchCommands(query);
        
        if (results.length === 0) {
            await interaction.reply({
                content: `🐷 Oink! No commands found matching \`${query}\`. Try a different search term or use \`/help\` to see all commands.`,
                ephemeral: true
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`🔍 Search Results for "${query}"`)
            .setDescription(`Found ${results.length} command(s) matching your search:`)
            .setColor('#FF6B6B');

        results.slice(0, 10).forEach(cmd => {
            const aliases = cmd.aliases && cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
            embed.addFields({
                name: `/${cmd.name}${aliases}`,
                value: `${cmd.description}\nCategory: ${cmd.category}`,
                inline: false
            });
        });

        if (results.length > 10) {
            embed.setFooter({ text: `Showing 10 of ${results.length} results. Refine your search for more specific results.` });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Command statistics
    public async showCommandStats(interaction: CommandInteraction): Promise<void> {
        const stats = this.commandRegistry.getCommandStats();
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Oink Bot Command Statistics')
            .setDescription('Detailed statistics about all available commands')
            .addFields(
                { name: '📈 Overview', value: `Total Commands: **${stats.total}**`, inline: false },
                { name: '💰 Payment', value: `${stats.byCategory[CommandCategory.PAYMENT]}`, inline: true },
                { name: '📋 Requests', value: `${stats.byCategory[CommandCategory.REQUESTS]}`, inline: true },
                { name: '📊 Transactions', value: `${stats.byCategory[CommandCategory.TRANSACTIONS]}`, inline: true },
                { name: '⚙️ Setup', value: `${stats.byCategory[CommandCategory.SETUP]}`, inline: true },
                { name: '🔧 Config', value: `${stats.byCategory[CommandCategory.CONFIG]}`, inline: true },
                { name: '🛠️ Utility', value: `${stats.byCategory[CommandCategory.UTILITY]}`, inline: true },
                { name: '❓ Help', value: `${stats.byCategory[CommandCategory.HELP]}`, inline: true }
            )
            .addFields(
                { name: '⚡ Features', value: `Commands with Cooldowns: **${stats.withCooldowns}**\nCommands Requiring Setup: **${stats.requiringSetup}**\nAdmin-Only Commands: **${stats.adminOnly}**`, inline: false }
            )
            .setColor('#4CAF50')
            .setFooter({ text: 'Oink Bot Statistics' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}
