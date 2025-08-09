import {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    Events
} from 'discord.js';
import { config } from '../config/environment';

import { InteractionRouter } from './InteractionRouter';
import { ServiceContainer } from './ServiceContainer';
import { CommandManager } from './CommandManager';
import { EnhancedCommandManager } from './EnhancedCommandManager';
import { PaymentCommandHandler } from '../handlers/payment/';
import { RequestCommandHandler } from '../handlers/requests/RequestCommandHandler';
import { TransactionCommandHandler } from '../handlers/transactions/';
import { PaymentConfigCommandHandler } from '../handlers/config/PaymentConfigCommandHandler';
import { SetupFlowOrchestrator } from '../handlers/setup/SetupFlowOrchestrator';
import { ActivityCommandHandler } from '../handlers/ActivityCommandHandler';
import { ProfileCommandHandler } from '../handlers/ProfileCommandHandler';
import { UserAccountServiceImpl } from '../services/UserAccountService';
import { PaymentServiceImpl } from '../services/PaymentService';
import { DMHandlerImpl } from '../handlers/dm/DMHandler';
import { DMTestUtility } from '../utils/DMTestUtility';

export class DiscordBot {
    private client: Client;
    private rest: REST;
    private serviceContainer: ServiceContainer;
    private commandManager: CommandManager;
    private enhancedCommandManager: EnhancedCommandManager;
    private interactionRouter: InteractionRouter;
    private dmHandler: DMHandlerImpl;
    private dmTestUtility?: DMTestUtility;
    private useEnhancedCommands: boolean = true; // Toggle for enhanced commands

    constructor() {
        // Initialize Discord client with required intents
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.MessageContent, // For DM interactions
            ],
        });

        this.rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
        
        // Initialize service container and managers
        this.serviceContainer = ServiceContainer.getInstance();
        this.commandManager = new CommandManager(this.serviceContainer);
        this.enhancedCommandManager = new EnhancedCommandManager(this.serviceContainer);
        
        // Initialize DM handler
        this.dmHandler = new DMHandlerImpl();
        
        // Create handlers directly since ServiceContainer has them commented out
        const userAccountService = new UserAccountServiceImpl();
        const paymentService = new PaymentServiceImpl();
        
        const paymentHandler = new PaymentCommandHandler(paymentService, userAccountService);
        const requestHandler = new RequestCommandHandler();
        const transactionHandler = new TransactionCommandHandler(paymentService, userAccountService);
        const paymentConfigHandler = new PaymentConfigCommandHandler();
        const setupFlowOrchestrator = new SetupFlowOrchestrator(userAccountService);
        const activityHandler = new ActivityCommandHandler(userAccountService, paymentService);
        const profileHandler = new ProfileCommandHandler(userAccountService, paymentService);
        
        // Initialize command managers with handlers
        this.commandManager.initializeCommands(
            paymentHandler,
            requestHandler,
            transactionHandler,
            paymentConfigHandler
        );
        
        this.enhancedCommandManager.initializeCommands(
            paymentHandler,
            requestHandler,
            transactionHandler,
            paymentConfigHandler,
            userAccountService
        );
        
        this.interactionRouter = new InteractionRouter(
            paymentHandler,
            requestHandler,
            transactionHandler,
            paymentConfigHandler,
            setupFlowOrchestrator,
            activityHandler,
            profileHandler,
            this.serviceContainer.errorHandler
        );

        this.setupEventHandlers();
    }

    /**
     * Register all slash commands with Discord
     */
    public async registerSlashCommands(): Promise<void> {
        try {
            let commandData: any[];
            
            if (this.useEnhancedCommands) {
                commandData = this.enhancedCommandManager.getSlashCommandData();
                console.log(`🐷 Oink! Started refreshing ${commandData.length} enhanced application (/) commands. 🐽`);
            } else {
                commandData = this.commandManager.getSlashCommandData();
                console.log(`🐷 Oink! Started refreshing ${commandData.length} application (/) commands. 🐽`);
            }

            // Register commands globally
            const data = await this.rest.put(
                Routes.applicationCommands(config.DISCORD_CLIENT_ID),
                { body: commandData }
            );

            console.log(`🎉 Oink-tastic! Successfully reloaded ${(data as any[]).length} application (/) commands. 🐷✨`);
            
            if (this.useEnhancedCommands) {
                console.log('🚀 Enhanced command system is active with cooldowns, help system, and better metadata!');
            }
        } catch (error) {
            console.error('❌ Oink... Error registering slash commands:', error);
            throw error;
        }
    }

    /**
     * Start the bot
     */
    public async start(): Promise<void> {
        try {
            await this.client.login(config.DISCORD_TOKEN);
            console.log(`🐷 Oink! Oink Bot is ready! Logged in as ${this.client.user?.tag} 🐽✨`);

            // Set the Discord client for the notification service
            this.serviceContainer.setDiscordClient(this.client);

            // Initialize DM handler after client is ready
            this.dmHandler.initialize(this.client);
            
            // Make DM handler accessible from client for debugging commands
            (this.client as any).dmHandler = this.dmHandler;
            
            // Check DM permissions
            const dmPermissions = await this.dmHandler.checkDMPermissions();
            if (dmPermissions.canSendDMs) {
                console.log('✅ DM permissions verified - bot can send direct messages');
            } else {
                console.warn(`⚠️ DM permission issue: ${dmPermissions.error}`);
                console.log('🐷 Users may not be able to send DMs to the bot. Make sure the bot is added to at least one server.');
            }

            // Initialize DM test utility
            this.dmTestUtility = new DMTestUtility(this.client);
            
            // Run DM functionality test
            await this.dmTestUtility.runFullDMTest();

            // Start the payment request scheduler
            this.serviceContainer.startScheduler();
        } catch (error) {
            console.error('❌ Oink... Failed to start bot:', error);
            throw error;
        }
    }

    /**
     * Stop the bot
     */
    public async stop(): Promise<void> {
        // Stop the scheduler first
        this.serviceContainer.stopScheduler();

        await this.client.destroy();
        console.log('🐷 Oink! Oink Bot has been stopped. 🐽');
    }

    /**
     * Get the Discord client instance
     */
    public getClient(): Client {
        return this.client;
    }

    /**
     * Get the command manager instance
     */
    public getCommandManager(): CommandManager {
        return this.commandManager;
    }

    /**
     * Get the enhanced command manager instance
     */
    public getEnhancedCommandManager(): EnhancedCommandManager {
        return this.enhancedCommandManager;
    }

    /**
     * Get the service container instance
     */
    public getServiceContainer(): ServiceContainer {
        return this.serviceContainer;
    }

    /**
     * Toggle between enhanced and standard command systems
     */
    public toggleEnhancedCommands(enabled: boolean): void {
        this.useEnhancedCommands = enabled;
        console.log(`🐷 Oink! Enhanced commands ${enabled ? 'enabled' : 'disabled'}. 🐽`);
    }

    /**
     * Check if enhanced commands are enabled
     */
    public isEnhancedCommandsEnabled(): boolean {
        return this.useEnhancedCommands;
    }

    /**
     * Setup event handlers for the bot
     */
    private setupEventHandlers(): void {
        this.client.once('ready', async () => {
            console.log(`🐷 Oink! Oink Bot is ready! Logged in as ${this.client.user?.tag} 🐽✨`);
            
            if (this.useEnhancedCommands) {
                console.log('🚀 Enhanced command system features:');
                console.log('   • Command cooldowns and rate limiting');
                console.log('   • Comprehensive help system with embeds');
                console.log('   • Command aliases and search functionality');
                console.log('   • Better error handling and validation');
                console.log('   • Command metadata and statistics');
            }
        });

        this.client.on(Events.InteractionCreate, async (interaction) => {
            if (interaction.isChatInputCommand()) {
                // Route all slash commands through the InteractionRouter for consistent handling
                await this.interactionRouter.handleCommand(interaction);
            } else if (interaction.isButton()) {
                await this.interactionRouter.handleButtonInteraction(interaction);
            } else if (interaction.isStringSelectMenu()) {
                await this.interactionRouter.handleSelectMenuInteraction(interaction);
            } else if (interaction.isModalSubmit()) {
                await this.interactionRouter.handleModalSubmitInteraction(interaction);
            }
        });

        // Handle text commands (e.g., "oink pay @user 10.50" or "@oink pay @user 10.50")
        this.client.on(Events.MessageCreate, async (message) => {
            // Ignore bot messages and messages without content
            if (message.author.bot || !message.content) return;

            const content = message.content.trim();
            const config = await import('../config/environment');
            
            // Check for both "oink" and "@oink" prefixes
            const oinkPrefix = config.config.BOT_PREFIX;
            const mentionPrefix = `<@${this.client.user?.id}>`;
            
            let commandContent: string | null = null;
            
            if (content.startsWith(oinkPrefix + ' ')) {
                commandContent = content.substring(oinkPrefix.length + 1);
            } else if (content.startsWith(mentionPrefix + ' ')) {
                commandContent = content.substring(mentionPrefix.length + 1);
            }
            
            if (commandContent) {
                console.log(`🐷 Text command received: ${commandContent} from ${message.author.tag}`);
                
                // Parse the command and arguments
                const args = commandContent.split(' ');
                const commandName = args[0].toLowerCase();
                const commandArgs = args.slice(1);
                
                // Route text commands through the InteractionRouter
                // We'll need to create a mock interaction or handle this differently
                // For now, let's log it and respond with a message
                const response = `🐷 Oink! I received your text command: \`${commandName}\` with args: \`${commandArgs.join(' ')}\`\n\n` +
                               `💡 Tip: You can also use slash commands like \`/${commandName}\` for a better experience!`;
                
                await message.reply(response);
            }
        });

        this.client.on(Events.Error, (error) => {
            console.error('❌ Oink... Discord client error:', error);
        });

        // Add command usage tracking
        this.client.on(Events.InteractionCreate, async (interaction) => {
            if (interaction.isChatInputCommand() && this.useEnhancedCommands) {
                const command = this.enhancedCommandManager.getCommandMetadata(interaction.commandName);
                if (command) {
                    console.log(`🐷 Command used: /${interaction.commandName} by ${interaction.user.tag} (${interaction.user.id})`);
                    
                    // Log command metadata if available
                    if (command.cooldown) {
                        console.log(`   Cooldown: ${command.cooldown}s`);
                    }
                    if (command.requiresSetup) {
                        console.log(`   Requires Setup: Yes`);
                    }
                    if (command.aliases && command.aliases.length > 0) {
                        console.log(`   Aliases: ${command.aliases.join(', ')}`);
                    }
                }
            }
        });
    }

    /**
     * Get command statistics
     */
    public async getCommandStats(): Promise<any> {
        if (this.useEnhancedCommands) {
            return this.enhancedCommandManager.getCommandMetadata('help') ? 
                this.enhancedCommandManager.getCommandMetadata('help') : 
                { message: 'Enhanced command stats not available' };
        }
        return { message: 'Standard command system active' };
    }

    /**
     * Reload commands (useful for development)
     */
    public async reloadCommands(): Promise<void> {
        try {
            console.log('🔄 Oink! Reloading commands...');
            await this.registerSlashCommands();
            console.log('✅ Oink! Commands reloaded successfully!');
        } catch (error) {
            console.error('❌ Oink... Error reloading commands:', error);
            throw error;
        }
    }
}