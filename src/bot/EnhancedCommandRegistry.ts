import { SlashCommandBuilder } from 'discord.js';
import { CommandCategory } from './CommandRegistry';

export interface EnhancedCommandDefinition {
    name: string;
    description: string;
    builder: any; // Using any to avoid Discord.js type conflicts
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
}

export class EnhancedCommandRegistry {
    private static instance: EnhancedCommandRegistry;
    private commands: Map<string, EnhancedCommandDefinition> = new Map();
    private aliases: Map<string, string> = new Map(); // alias -> command name

    private constructor() {
        this.initializeEnhancedCommands();
    }

    public static getInstance(): EnhancedCommandRegistry {
        if (!EnhancedCommandRegistry.instance) {
            EnhancedCommandRegistry.instance = new EnhancedCommandRegistry();
        }
        return EnhancedCommandRegistry.instance;
    }

    private initializeEnhancedCommands(): void {
        // Payment commands
        this.registerEnhancedCommand({
            name: 'pay',
            description: '🐷 Send a payment to another user (oink oink!)',
            category: CommandCategory.PAYMENT,
            aliases: ['send', 'transfer'],
            examples: ['/pay @user 10.50 Coffee payment', '/pay @user 25.00 Lunch'],
            usage: '/pay <recipient> <amount> [description]',
            longDescription: 'Send money to another user in this server. The recipient will receive a notification and can accept or decline the payment.',
            requiresSetup: true,
            isEphemeral: false,
            cooldown: 30,
            builder: new SlashCommandBuilder()
                .setName('pay')
                .setDescription('🐷 Send a payment to another user (oink oink!)')
                .addUserOption(opt => opt
                    .setName('recipient')
                    .setDescription('🐽 The user to send payment to')
                    .setRequired(true))
                .addNumberOption(opt => opt
                    .setName('amount')
                    .setDescription('💰 Amount to send')
                    .setRequired(true)
                    .setMinValue(0.01))
                .addStringOption(opt => opt
                    .setName('description')
                    .setDescription('📝 Optional description for the payment')
                    .setRequired(false))
        });

        // Request commands
        this.registerEnhancedCommand({
            name: 'request',
            description: '🐷 Request a payment from another user (oink oink!)',
            category: CommandCategory.REQUESTS,
            aliases: ['ask', 'bill'],
            examples: ['/request @user 15.00 Dinner split', '/request @user 8.50 Movie ticket'],
            usage: '/request <from> <amount> <description>',
            longDescription: 'Request money from another user. They will receive a notification and can choose to pay or decline the request.',
            requiresSetup: true,
            isEphemeral: false,
            cooldown: 60,
            builder: new SlashCommandBuilder()
                .setName('request')
                .setDescription('🐷 Request a payment from another user (oink oink!)')
                .addUserOption(opt => opt
                    .setName('from')
                    .setDescription('🐽 The user to request payment from')
                    .setRequired(true))
                .addNumberOption(opt => opt
                    .setName('amount')
                    .setDescription('💰 Amount to request')
                    .setRequired(true)
                    .setMinValue(0.01))
                .addStringOption(opt => opt
                    .setName('description')
                    .setDescription('📝 Description for the payment request')
                    .setRequired(true))
        });

        // Transaction commands
        this.registerEnhancedCommand({
            name: 'transactions',
            description: '🐷 View your transaction history (oink oink!)',
            category: CommandCategory.TRANSACTIONS,
            aliases: ['tx', 'history', 'ledger'],
            examples: ['/transactions', '/transactions 20', '/transactions 15 sent'],
            usage: '/transactions [limit] [type]',
            longDescription: 'View your transaction history with optional filtering. Shows sent payments, received payments, and payment requests.',
            requiresSetup: true,
            isEphemeral: true,
            cooldown: 10,
            builder: new SlashCommandBuilder()
                .setName('transactions')
                .setDescription('🐷 View your transaction history (oink oink!)')
                .addIntegerOption(opt => opt
                    .setName('limit')
                    .setDescription('📊 Number of transactions to show (default: 10)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(50))
                .addStringOption(opt => opt
                    .setName('type')
                    .setDescription('🔍 Filter by transaction type')
                    .setRequired(false)
                    .addChoices(
                        { name: 'All', value: 'all' },
                        { name: 'Sent', value: 'sent' },
                        { name: 'Received', value: 'received' },
                        { name: 'Requests', value: 'requests' }
                    ))
        });

        // Setup commands
        this.registerEnhancedCommand({
            name: 'setup-payment',
            description: '🐷 Set up your payment methods (oink oink!)',
            category: CommandCategory.SETUP,
            aliases: ['setup', 'configure', 'onboard'],
            examples: ['/setup-payment'],
            usage: '/setup-payment',
            longDescription: 'Complete the initial setup process to enable payments. This includes verifying your identity and setting up payment methods.',
            requiresSetup: false,
            isEphemeral: true,
            cooldown: 0,
            builder: new SlashCommandBuilder()
                .setName('setup-payment')
                .setDescription('🐷 Set up your payment methods (oink oink!)')
        });

        // Config commands
        this.registerEnhancedCommand({
            name: 'payment-config',
            description: '🐷 Configure payment settings for this server (Admin only)',
            category: CommandCategory.CONFIG,
            aliases: ['config', 'settings', 'admin-config'],
            examples: ['/payment-config enabled:true', '/payment-config daily_limit:100'],
            usage: '/payment-config [enabled] [daily_limit]',
            longDescription: 'Configure payment settings for the server. Only server administrators can use this command.',
            requiresSetup: false,
            isEphemeral: true,
            cooldown: 300,
            permissions: ['0'], // Admin only
            builder: new SlashCommandBuilder()
                .setName('payment-config')
                .setDescription('🐷 Configure payment settings for this server (Admin only)')
                .setDefaultMemberPermissions('0')
                .addBooleanOption(opt => opt
                    .setName('enabled')
                    .setDescription('🔧 Enable or disable payments in this server')
                    .setRequired(false))
                .addNumberOption(opt => opt
                    .setName('daily_limit')
                    .setDescription('💰 Maximum amount per user per day')
                    .setRequired(false)
                    .setMinValue(0))
        });

        // Help command
        this.registerEnhancedCommand({
            name: 'help',
            description: '🐷 Get help with Oink Bot commands (oink oink!)',
            category: CommandCategory.HELP,
            aliases: ['h', 'commands', 'guide'],
            examples: ['/help', '/help pay', '/help payment'],
            usage: '/help [command] [category]',
            longDescription: 'Get help with Oink Bot commands. Use without arguments to see all commands, or specify a command or category for detailed help.',
            requiresSetup: false,
            isEphemeral: true,
            cooldown: 5,
            builder: new SlashCommandBuilder()
                .setName('help')
                .setDescription('🐷 Get help with Oink Bot commands (oink oink!)')
                .addStringOption(opt => opt
                    .setName('command')
                    .setDescription('📚 Specific command to get help for')
                    .setRequired(false))
                .addStringOption(opt => opt
                    .setName('category')
                    .setDescription('📂 Category of commands to show')
                    .setRequired(false)
                    .addChoices(
                        { name: 'Payment', value: 'payment' },
                        { name: 'Requests', value: 'requests' },
                        { name: 'Transactions', value: 'transactions' },
                        { name: 'Setup', value: 'setup' },
                        { name: 'Config', value: 'config' },
                        { name: 'Utility', value: 'utility' }
                    ))
        });

        // Utility commands
        this.registerEnhancedCommand({
            name: 'ping',
            description: '🐷 Test if Oink Bot is responding (oink oink!)',
            category: CommandCategory.UTILITY,
            aliases: ['pong', 'test'],
            examples: ['/ping'],
            usage: '/ping',
            longDescription: 'Simple command to test if the bot is online and responding. Useful for checking bot status.',
            requiresSetup: false,
            isEphemeral: false,
            cooldown: 5,
            builder: new SlashCommandBuilder()
                .setName('ping')
                .setDescription('🐷 Test if Oink Bot is responding (oink oink!)')
        });

        // Activity command
        this.registerEnhancedCommand({
            name: 'activity',
            description: '🐷 Check your account activity and pending requests (oink oink!)',
            category: CommandCategory.UTILITY,
            aliases: ['act', 'stats', 'summary'],
            examples: ['/activity'],
            usage: '/activity',
            longDescription: 'Check your account activity summary including totals sent/received and pending requests.',
            requiresSetup: true,
            isEphemeral: true,
            cooldown: 15,
            builder: new SlashCommandBuilder()
                .setName('activity')
                .setDescription('🐷 Check your account activity and pending requests (oink oink!)')
        });

        // Profile command
        this.registerEnhancedCommand({
            name: 'profile',
            description: '🐷 View your payment profile (oink oink!)',
            category: CommandCategory.UTILITY,
            aliases: ['me', 'user', 'account'],
            examples: ['/profile', '/profile @user'],
            usage: '/profile [user]',
            longDescription: 'View your payment profile or another user\'s public profile information.',
            requiresSetup: true,
            isEphemeral: true,
            cooldown: 20,
            builder: new SlashCommandBuilder()
                .setName('profile')
                .setDescription('🐷 View your payment profile (oink oink!)')
                .addUserOption(opt => opt
                    .setName('user')
                    .setDescription('👤 User whose profile to view (default: yourself)')
                    .setRequired(false))
        });
    }

    public registerEnhancedCommand(command: EnhancedCommandDefinition): void {
        this.commands.set(command.name, command);
        
        // Register aliases
        if (command.aliases) {
            command.aliases.forEach(alias => {
                this.aliases.set(alias, command.name);
            });
        }
    }

    public getCommand(name: string): EnhancedCommandDefinition | undefined {
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

    public getAllCommands(): EnhancedCommandDefinition[] {
        return Array.from(this.commands.values());
    }

    public getCommandsByCategory(category: CommandCategory): EnhancedCommandDefinition[] {
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

    public getCommandByAlias(alias: string): EnhancedCommandDefinition | undefined {
        const commandName = this.aliases.get(alias);
        return commandName ? this.commands.get(commandName) : undefined;
    }

    // Method to add new commands dynamically
    public addCommand(command: EnhancedCommandDefinition): void {
        this.registerEnhancedCommand(command);
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
    public getCommandsByPermission(permission: string): EnhancedCommandDefinition[] {
        return this.getAllCommands().filter(cmd => 
            cmd.permissions && cmd.permissions.includes(permission)
        );
    }

    // Method to get commands by cooldown
    public getCommandsByCooldown(cooldown: number): EnhancedCommandDefinition[] {
        return this.getAllCommands().filter(cmd => cmd.cooldown === cooldown);
    }

    // Method to get commands that require setup
    public getCommandsRequiringSetup(): EnhancedCommandDefinition[] {
        return this.getAllCommands().filter(cmd => cmd.requiresSetup);
    }

    // Method to get commands by category with metadata
    public getCommandsByCategoryWithMetadata(category: CommandCategory): Array<EnhancedCommandDefinition & { aliases: string[] }> {
        return this.getCommandsByCategory(category).map(cmd => ({
            ...cmd,
            aliases: cmd.aliases || []
        }));
    }

    // Method to search commands by name or description
    public searchCommands(query: string): EnhancedCommandDefinition[] {
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

    // Method to get help text for a specific command
    public getCommandHelp(commandName: string): string | null {
        const command = this.getCommand(commandName);
        if (!command) return null;

        let help = `**${command.name}** - ${command.description}\n\n`;
        
        if (command.longDescription) {
            help += `${command.longDescription}\n\n`;
        }
        
        if (command.usage) {
            help += `**Usage:** \`${command.usage}\`\n`;
        }
        
        if (command.examples && command.examples.length > 0) {
            help += `**Examples:**\n`;
            command.examples.forEach(example => {
                help += `• \`${example}\`\n`;
            });
        }
        
        if (command.aliases && command.aliases.length > 0) {
            help += `**Aliases:** ${command.aliases.map(a => `\`${a}\``).join(', ')}\n`;
        }
        
        if (command.cooldown && command.cooldown > 0) {
            help += `**Cooldown:** ${command.cooldown} seconds\n`;
        }
        
        if (command.requiresSetup) {
            help += `**Requires Setup:** Yes\n`;
        }
        
        return help;
    }

    // Method to get help text for a category
    public getCategoryHelp(category: CommandCategory): string | null {
        const commands = this.getCommandsByCategory(category);
        if (commands.length === 0) return null;

        let help = `**${category.charAt(0).toUpperCase() + category.slice(1)} Commands:**\n\n`;
        
        commands.forEach(cmd => {
            help += `• **\`${cmd.name}\`** - ${cmd.description}\n`;
            if (cmd.aliases && cmd.aliases.length > 0) {
                help += `  Aliases: ${cmd.aliases.map(a => `\`${a}\``).join(', ')}\n`;
            }
            help += `\n`;
        });
        
        return help;
    }
}
