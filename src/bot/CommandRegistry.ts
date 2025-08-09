import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { CommandFactory } from './CommandFactory';
import { config } from '../config/environment';

export interface CommandDefinition {
    name: string;
    description: string;
    builder: SlashCommandBuilder | SlashCommandSubcommandBuilder;
    category: CommandCategory;
    permissions?: string[];
    cooldown?: number;
    guildOnly?: boolean;
    aliases?: string[];
    examples?: string[];
    usage?: string;
    longDescription?: string;
    requiresSetup?: boolean;
    isEphemeral?: boolean;
    maxUses?: number;
    minLevel?: number;
    textCommand?: string; // For text-based commands like "oink pay"
}

export enum CommandCategory {
    PAYMENT = 'payment',
    REQUESTS = 'requests',
    TRANSACTIONS = 'transactions',
    SETUP = 'setup',
    CONFIG = 'config',
    UTILITY = 'utility',
    ADMIN = 'admin',
    HELP = 'help'
}

export class CommandRegistry {
    private static instance: CommandRegistry;
    private commands: Map<string, CommandDefinition> = new Map();
    private aliases: Map<string, string> = new Map(); // alias -> command name
    private textCommands: Map<string, string> = new Map(); // text command -> command name

    private constructor() {
        this.initializeCommands();
    }

    public static getInstance(): CommandRegistry {
        if (!CommandRegistry.instance) {
            CommandRegistry.instance = new CommandRegistry();
        }
        return CommandRegistry.instance;
    }

    private initializeCommands(): void {
        // Payment commands
        this.registerCommand(CommandFactory.createPaymentCommand(
            'pay',
            '🐷 Send a payment to another user (oink oink!)',
            [
                {
                    name: 'recipient',
                    description: '🐽 The user to send payment to',
                    required: true,
                    type: 'user'
                },
                {
                    name: 'amount',
                    description: '💰 Amount to send',
                    required: true,
                    type: 'number',
                    minValue: 0.01
                },
                {
                    name: 'description',
                    description: '📝 Optional description for the payment',
                    required: false,
                    type: 'string'
                }
            ],
            {
                aliases: ['send', 'transfer'],
                examples: ['/pay @user 10.50 Coffee payment', '/pay @user 25.00 Lunch', `${config.BOT_PREFIX} pay @user 10.50 Coffee`],
                usage: '/pay <recipient> <amount> [description]',
                longDescription: 'Send money to another user in this server. The recipient will receive a notification and can accept or decline the payment.',
                requiresSetup: true,
                isEphemeral: false,
                cooldown: 30,
                textCommand: `${config.BOT_PREFIX} pay`
            }
        ));

        // Request commands
        this.registerCommand(CommandFactory.createCommand({
            name: 'request',
            description: '🐷 Request a payment from another user (oink oink!)',
            category: CommandCategory.REQUESTS,
            options: [
                {
                    name: 'from',
                    description: '🐽 The user to request payment from',
                    required: true,
                    type: 'user'
                },
                {
                    name: 'amount',
                    description: '💰 Amount to request',
                    required: true,
                    type: 'number',
                    minValue: 0.01
                },
                {
                    name: 'description',
                    description: '📝 Description for the payment request',
                    required: true,
                    type: 'string'
                }
            ]
        }));

        // Transaction commands
        this.registerCommand(CommandFactory.createCommand({
            name: 'transactions',
            description: '🐷 View your transaction history (oink oink!)',
            category: CommandCategory.TRANSACTIONS,
            options: [
                {
                    name: 'limit',
                    description: '📊 Number of transactions to show (default: 10)',
                    required: false,
                    type: 'integer',
                    minValue: 1,
                    maxValue: 50
                },
                {
                    name: 'type',
                    description: '🔍 Filter by transaction type',
                    required: false,
                    type: 'string',
                    choices: [
                        { name: 'All', value: 'all' },
                        { name: 'Sent', value: 'sent' },
                        { name: 'Received', value: 'received' },
                        { name: 'Requests', value: 'requests' }
                    ]
                }
            ],
            aliases: ['tx', 'history', 'ledger'],
            examples: ['/transactions', '/transactions 20', '/transactions 15 sent'],
            usage: '/transactions [limit] [type]',
            longDescription: 'View your transaction history with optional filtering. Shows sent payments, received payments, and payment requests.',
            requiresSetup: true,
            isEphemeral: true,
            cooldown: 10
        }));

        // Setup commands
        this.registerCommand(CommandFactory.createCommand({
            name: 'setup-payment',
            description: '🐷 Set up your payment methods (oink oink!)',
            category: CommandCategory.SETUP
        }));

        // Config commands
        this.registerCommand(CommandFactory.createAdminCommand(
            'payment-config',
            '🐷 Configure payment settings for this server (Admin only)',
            [
                {
                    name: 'enabled',
                    description: '🔧 Enable or disable payments in this server',
                    required: false,
                    type: 'boolean'
                },
                {
                    name: 'daily_limit',
                    description: '💰 Maximum amount per user per day',
                    required: false,
                    type: 'number',
                    minValue: 0
                }
            ]
        ));

        // Help command
        this.registerCommand(CommandFactory.createCommand({
            name: 'help',
            description: '🐷 Get help with Oink Bot commands (oink oink!)',
            category: CommandCategory.HELP,
            options: [
                {
                    name: 'command',
                    description: '📚 Specific command to get help for',
                    required: false,
                    type: 'string'
                },
                {
                    name: 'category',
                    description: '📂 Category of commands to show',
                    required: false,
                    type: 'string',
                    choices: [
                        { name: 'Payment', value: 'payment' },
                        { name: 'Transactions', value: 'transactions' },
                        { name: 'Setup', value: 'setup' },
                        { name: 'Config', value: 'config' },
                        { name: 'Utility', value: 'utility' }
                    ]
                }
            ]
        }));

        // Utility commands
        this.registerCommand(CommandFactory.createUtilityCommand(
            'ping',
            '🐷 Test if Oink Bot is responding (oink oink!)',
            []
        ));

        // Activity command
        this.registerCommand(CommandFactory.createCommand({
            name: 'activity',
            description: '🐷 Check your account activity and pending requests (oink oink!)',
            category: CommandCategory.UTILITY
        }));

        // Profile command
        this.registerCommand(CommandFactory.createCommand({
            name: 'profile',
            description: '🐷 View your payment profile (oink oink!)',
            category: CommandCategory.UTILITY,
            options: [
                {
                    name: 'user',
                    description: '👤 User whose profile to view (default: yourself)',
                    required: false,
                    type: 'user'
                }
            ]
        }));

        // Test command for routing verification
        this.registerCommand(CommandFactory.createUtilityCommand(
            'test',
            '🐷 Test command to verify routing system (oink oink!)',
            []
        ));

        // DM test command for debugging
        this.registerCommand(CommandFactory.createUtilityCommand(
            'test-dm',
            '🐷 Test DM functionality and send you a direct message',
            []
        ));

        // DM status command for debugging
        this.registerCommand(CommandFactory.createUtilityCommand(
            'dm-status',
            '🐷 Check the status of the DM handler and bot configuration',
            []
        ));

        // Test user DM command for debugging
        this.registerCommand(CommandFactory.createUtilityCommand(
            'test-user-dm',
            '🐷 Test if a specific user can send DMs to the bot',
            [
                {
                    name: 'user',
                    description: '🐽 The user to test DM functionality with',
                    required: true,
                    type: 'user'
                }
            ]
        ));

        // DM policy enforcement command
        this.registerCommand(CommandFactory.createUtilityCommand(
            'dm-policy',
            '🛡️ Check your DM policy compliance and security status',
            []
        ));

        // Setup users monitoring command (admin)
        this.registerCommand(CommandFactory.createUtilityCommand(
            'setup-users',
            '🔄 Show all users currently in setup mode (admin monitoring)',
            []
        ));
    }

    public registerCommand(command: CommandDefinition): void {
        this.commands.set(command.name, command);
        
        // Register aliases
        if (command.aliases) {
            command.aliases.forEach(alias => {
                this.aliases.set(alias, command.name);
            });
        }

        // Register text command
        if (command.textCommand) {
            this.textCommands.set(command.textCommand, command.name);
        }
    }

    public getCommand(name: string): CommandDefinition | undefined {
        // First try exact match
        let command = this.commands.get(name);
        
        // If not found, try alias
        if (!command) {
            const aliasCommand = this.aliases.get(name);
            if (aliasCommand) {
                command = this.commands.get(aliasCommand);
            }
        }
        
        return command;
    }

    public getAllCommands(): CommandDefinition[] {
        return Array.from(this.commands.values());
    }

    public getCommandsByCategory(category: CommandCategory): CommandDefinition[] {
        return this.getAllCommands().filter(cmd => cmd.category === category);
    }

    public getSlashCommandData(): any[] {
        return this.getAllCommands().map(cmd => cmd.builder.toJSON());
    }

    public getCommandNames(): string[] {
        return Array.from(this.commands.keys());
    }

    public getAllAliases(): string[] {
        return Array.from(this.aliases.keys());
    }

    public getCommandByAlias(alias: string): CommandDefinition | undefined {
        const commandName = this.aliases.get(alias);
        return commandName ? this.commands.get(commandName) : undefined;
    }

    public getCommandByTextCommand(textCommand: string): CommandDefinition | undefined {
        const commandName = this.textCommands.get(textCommand);
        return commandName ? this.commands.get(commandName) : undefined;
    }

    public getAllTextCommands(): string[] {
        return Array.from(this.textCommands.keys());
    }

    public getCommandsWithTextCommands(): CommandDefinition[] {
        return Array.from(this.commands.values()).filter(cmd => cmd.textCommand);
    }

    // Method to add new commands dynamically
    public addCommand(command: CommandDefinition): void {
        this.registerCommand(command);
    }

    // Method to remove commands
    public removeCommand(name: string): boolean {
        const command = this.commands.get(name);
        if (command && command.aliases) {
            // Remove aliases
            command.aliases.forEach(alias => {
                this.aliases.delete(alias);
            });
        }
        return this.commands.delete(name);
    }

    // Method to get commands with specific permissions
    public getCommandsByPermission(permission: string): CommandDefinition[] {
        return this.getAllCommands().filter(cmd => 
            cmd.permissions && cmd.permissions.includes(permission)
        );
    }

    // Method to get commands by cooldown
    public getCommandsByCooldown(cooldown: number): CommandDefinition[] {
        return this.getAllCommands().filter(cmd => cmd.cooldown === cooldown);
    }

    // Method to get commands that require setup
    public getCommandsRequiringSetup(): CommandDefinition[] {
        return this.getAllCommands().filter(cmd => cmd.requiresSetup);
    }

    // Method to get commands by category with metadata
    public getCommandsByCategoryWithMetadata(category: CommandCategory): Array<CommandDefinition & { aliases: string[] }> {
        return this.getCommandsByCategory(category).map(cmd => ({
            ...cmd,
            aliases: cmd.aliases || []
        }));
    }

    // Method to search commands by name or description
    public searchCommands(query: string): CommandDefinition[] {
        const lowerQuery = query.toLowerCase();
        return this.getAllCommands().filter(cmd => 
            cmd.name.toLowerCase().includes(lowerQuery) ||
            cmd.description.toLowerCase().includes(lowerQuery) ||
            cmd.longDescription?.toLowerCase().includes(lowerQuery) ||
            cmd.aliases?.some(alias => alias.toLowerCase().includes(lowerQuery))
        );
    }

    // Method to get command statistics
    public getCommandStats(): {
        total: number;
        byCategory: Record<CommandCategory, number>;
        withCooldowns: number;
        requiringSetup: number;
        adminOnly: number;
    } {
        const commands = this.getAllCommands();
        const byCategory: Record<CommandCategory, number> = {} as Record<CommandCategory, number>;
        
        // Initialize category counts
        Object.values(CommandCategory).forEach(cat => {
            byCategory[cat] = 0;
        });
        
        commands.forEach(cmd => {
            byCategory[cmd.category]++;
        });
        
        return {
            total: commands.length,
            byCategory,
            withCooldowns: commands.filter(cmd => cmd.cooldown && cmd.cooldown > 0).length,
            requiringSetup: commands.filter(cmd => cmd.requiresSetup).length,
            adminOnly: commands.filter(cmd => cmd.permissions && cmd.permissions.includes('0')).length
        };
    }
}
