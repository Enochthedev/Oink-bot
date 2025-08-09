import {
    ButtonInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    ChatInputCommandInteraction
} from 'discord.js';
import { ErrorHandler } from './ErrorHandler';
import { PaymentCommandHandler } from '../handlers/payment/';
import { RequestCommandHandler } from '../handlers/requests/RequestCommandHandler';
import { TransactionCommandHandler } from '../handlers/transactions/';
import { PaymentConfigCommandHandler } from '../handlers/config/PaymentConfigCommandHandler';
import { SetupFlowOrchestrator } from '../handlers/setup/SetupFlowOrchestrator';
import { ActivityCommandHandler } from '../handlers/ActivityCommandHandler';
import { ProfileCommandHandler } from '../handlers/ProfileCommandHandler';

export interface InteractionHandler {
    handleCommand(interaction: ChatInputCommandInteraction): Promise<void>;
    handleButtonInteraction(interaction: ButtonInteraction): Promise<void>;
    handleSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void>;
    handleModalSubmitInteraction(interaction: ModalSubmitInteraction): Promise<void>;
}

export class InteractionRouter {
    private errorHandler: ErrorHandler;
    private paymentHandler: PaymentCommandHandler;
    private requestHandler: RequestCommandHandler;
    private transactionHandler: TransactionCommandHandler;
    private paymentConfigHandler: PaymentConfigCommandHandler;
    private setupFlowOrchestrator: SetupFlowOrchestrator;
    private activityHandler: ActivityCommandHandler;
    private profileHandler: ProfileCommandHandler;

    constructor(
        paymentHandler: PaymentCommandHandler,
        requestHandler: RequestCommandHandler,
        transactionHandler: TransactionCommandHandler,
        paymentConfigHandler: PaymentConfigCommandHandler,
        setupFlowOrchestrator: SetupFlowOrchestrator,
        activityHandler: ActivityCommandHandler,
        profileHandler: ProfileCommandHandler,
        errorHandler: ErrorHandler
    ) {
        this.paymentHandler = paymentHandler;
        this.requestHandler = requestHandler;
        this.transactionHandler = transactionHandler;
        this.paymentConfigHandler = paymentConfigHandler;
        this.setupFlowOrchestrator = setupFlowOrchestrator;
        this.activityHandler = activityHandler;
        this.profileHandler = profileHandler;
        this.errorHandler = errorHandler;
    }

    /**
     * Handle slash command interactions
     */
    public async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const commandName = interaction.commandName;
            const route = this.getCommandRoute(commandName);

            if (route) {
                await route(interaction);
            } else {
                await this.handleUnknownCommand(interaction);
            }
        } catch (error) {
            console.error('❌ Oink... command interaction error:', error);
            await this.errorHandler.handleCommandError(interaction, error as Error);
        }
    }

    /**
     * Get the appropriate command handler for a given command name
     */
    private getCommandRoute(commandName: string): ((interaction: ChatInputCommandInteraction) => Promise<void>) | null {
        const routes: Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>> = {
            // Payment commands
            'pay': async (interaction) => {
                await this.paymentHandler.handle(interaction);
            },
            'tip': async (interaction) => {
                await this.paymentHandler.handle(interaction);
            },
            'send': async (interaction) => {
                await this.paymentHandler.handle(interaction);
            },

            // Request commands
            'request': async (interaction) => {
                await this.requestHandler.handle(interaction);
            },
            'request-payment': async (interaction) => {
                await this.requestHandler.handle(interaction);
            },

            // Transaction commands
            'transaction': async (interaction) => {
                await this.transactionHandler.handle(interaction);
            },
            'transactions': async (interaction) => {
                await this.transactionHandler.handle(interaction);
            },
            'history': async (interaction) => {
                await this.transactionHandler.handle(interaction);
            },

            // Activity and Profile commands
            'activity': async (interaction) => {
                await this.activityHandler.handle(interaction);
            },
            'profile': async (interaction) => {
                await this.profileHandler.handle(interaction);
            },

            // Setup commands - use the proper setup flow orchestrator
            'setup': async (interaction) => {
                await this.setupFlowOrchestrator.initiateSetup(interaction.user);
                
                // Show setup interface directly
                const { content, embed, components: welcomeComponents } = this.setupFlowOrchestrator.getDMHandler().createWelcomeMessage();
                const { embed: setupEmbed, components: setupComponents } = this.setupFlowOrchestrator.getDMHandler().createSetupOptions();
                
                await interaction.reply({
                    content: content,
                    embeds: [embed, setupEmbed],
                    components: [...welcomeComponents, ...setupComponents],
                    ephemeral: true
                });
            },
            'setup-payment': async (interaction) => {
                await this.setupFlowOrchestrator.initiateSetup(interaction.user);
                
                // Show setup interface directly
                const { content, embed, components: welcomeComponents } = this.setupFlowOrchestrator.getDMHandler().createWelcomeMessage();
                const { embed: setupEmbed, components: setupComponents } = this.setupFlowOrchestrator.getDMHandler().createSetupOptions();
                
                await interaction.reply({
                    content: content,
                    embeds: [embed, setupEmbed],
                    components: [...welcomeComponents, ...setupComponents],
                    ephemeral: true
                });
            },
            'configure': async (interaction) => {
                await this.setupFlowOrchestrator.initiateSetup(interaction.user);
                
                // Show setup interface directly
                const { content, embed, components: welcomeComponents } = this.setupFlowOrchestrator.getDMHandler().createWelcomeMessage();
                const { embed: setupEmbed, components: setupComponents } = this.setupFlowOrchestrator.getDMHandler().createSetupOptions();
                
                await interaction.reply({
                    content: content,
                    embeds: [embed, setupEmbed],
                    components: [...welcomeComponents, ...setupComponents],
                    ephemeral: true
                });
            },

            // Configuration commands
            'config': async (interaction) => {
                await this.paymentConfigHandler.handle(interaction);
            },
            'payment-config': async (interaction) => {
                await this.paymentConfigHandler.handle(interaction);
            },

            // Utility commands
            'help': async (interaction) => {
                await this.handleHelpCommand(interaction);
            },
            'ping': async (interaction) => {
                await this.handlePingCommand(interaction);
            },
            'info': async (interaction) => {
                await this.handleInfoCommand(interaction);
            },
            'test': async (interaction) => {
                // Test command to verify routing
                await interaction.reply({
                    content: '🐷 Oink! Test command routed successfully through InteractionRouter! 🐽✨',
                    ephemeral: true
                });
            },
            'test-dm': async (interaction) => {
                // Test DM functionality
                try {
                    const user = interaction.user;
                    console.log(`🐷 Testing DM functionality for user: ${user.tag} (${user.id})`);
                    
                    // Try to send a test DM
                    await user.send({
                        content: '🐷 Oink! This is a test DM from your bot! If you received this, DMs are working perfectly! 🐽✨',
                        flags: 64 as any
                    });
                    
                    console.log(`🐷 Successfully sent test DM to ${user.tag}`);
                    
                    await interaction.reply({
                        content: '✅ Test DM sent successfully! Check your direct messages. If you received it, DMs are working! 🐷',
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('🐷 DM test failed:', error);
                    
                    await interaction.reply({
                        content: `❌ Failed to send test DM: ${error instanceof Error ? error.message : 'Unknown error'}\n\nThis usually means:\n• You have DMs disabled for this bot\n• The bot doesn\'t have permission to send DMs\n• Discord is blocking the message\n\nTry running \`/test-dm\` again or check your Discord privacy settings.`,
                        ephemeral: true
                    });
                }
            },
            'dm-status': async (interaction) => {
                // Check DM handler status
                try {
                    // Get the bot instance to access DM handler
                    const bot = interaction.client;
                    const dmHandler = (bot as any).dmHandler;
                    
                    if (!dmHandler) {
                        await interaction.reply({
                            content: '❌ DM Handler not found on bot client. Bot may not be properly initialized.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Test DM handler status
                    const status = await dmHandler.testDMHandler();
                    
                    await interaction.reply({
                        content: `🐷 DM Handler Status:\n\`\`\`\n${status}\n\`\`\``,
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('🐷 DM status check failed:', error);
                    
                    await interaction.reply({
                        content: `❌ Failed to get DM handler status: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        ephemeral: true
                    });
                }
            },
            'test-user-dm': async (interaction) => {
                // Test if a specific user can send DMs to the bot
                try {
                    const targetUser = interaction.options.getUser('user');
                    if (!targetUser) {
                        await interaction.reply({
                            content: '❌ Please specify a user to test: `/test-user-dm user:@username`',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Get the bot instance to access DM handler
                    const bot = interaction.client;
                    const dmHandler = (bot as any).dmHandler;
                    
                    if (!dmHandler) {
                        await interaction.reply({
                            content: '❌ DM Handler not found on bot client.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Test if user can send DMs
                    const dmTest = await dmHandler.testReceiveDM(targetUser.id);
                    
                    if (dmTest.canReceive) {
                        await interaction.reply({
                            content: `✅ **${targetUser.tag}** can send DMs to the bot!\n\n**Status:** ${dmTest.reason}`,
                            ephemeral: true
                        });
                    } else {
                        await interaction.reply({
                            content: `❌ **${targetUser.tag}** cannot send DMs to the bot.\n\n**Reason:** ${dmTest.reason}\n\n**Solution:** Ask them to:\n1. Go to Discord Settings → Privacy & Safety\n2. Enable "Allow direct messages from server members"\n3. Make sure they haven't blocked the bot`,
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    console.error('🐷 User DM test failed:', error);
                    
                    await interaction.reply({
                        content: `❌ Failed to test user DM: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        ephemeral: true
                    });
                }
            },
            'dm-policy': async (interaction) => {
                // Check DM policy compliance for the current user
                try {
                    const userId = interaction.user.id;
                    
                    // Get the bot instance to access DM handler
                    const bot = interaction.client;
                    const dmHandler = (bot as any).dmHandler;
                    
                    if (!dmHandler) {
                        await interaction.reply({
                            content: '❌ DM Handler not found on bot client.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Check DM policy compliance
                    const policyCheck = await dmHandler.enforceDMPolicy(userId);
                    
                    if (policyCheck.compliant) {
                        const isInSetup = dmHandler.getSetupUsers().has(userId);
                        const setupUsers = dmHandler.getSetupUsers();
                        
                        let statusMessage = `✅ **DM Policy Compliant!**\n\n**Status:** ${policyCheck.reason}`;
                        
                        if (isInSetup) {
                            statusMessage += `\n\n🔄 **You are currently in setup mode**\n**Setup Users Active:** ${setupUsers.size}`;
                        }
                        
                        await interaction.reply({
                            content: statusMessage,
                            ephemeral: true
                        });
                    } else {
                        await interaction.reply({
                            content: `❌ **DM Policy Violation!**\n\n**Reason:** ${policyCheck.reason}\n\n**Required Action:** ${policyCheck.requiresAction}\n\n**Security Note:** This prevents exploitation of temporary DM enabling.`,
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    console.error('🐷 DM policy check failed:', error);
                    
                    await interaction.reply({
                        content: `❌ Failed to check DM policy: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        ephemeral: true
                    });
                }
            },
            'setup-users': async (interaction) => {
                // Show all users currently in setup mode (admin command)
                try {
                    // Get the bot instance to access DM handler
                    const bot = interaction.client;
                    const dmHandler = (bot as any).dmHandler;
                    
                    if (!dmHandler) {
                        await interaction.reply({
                            content: '❌ DM Handler not found on bot client.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    const setupUsers = dmHandler.getSetupUsers();
                    const setupStartTimes = dmHandler.getSetupStartTimes?.() || new Map();
                    
                    if (setupUsers.size === 0) {
                        await interaction.reply({
                            content: '🔄 **No users currently in setup mode**\n\nAll users have completed or abandoned setup.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    let statusMessage = `🔄 **Users Currently in Setup Mode: ${setupUsers.size}**\n\n`;
                    
                    for (const userId of setupUsers) {
                        try {
                            const user = await bot.users.fetch(userId);
                            const startTime = setupStartTimes.get(userId);
                            const duration = startTime ? Math.floor((Date.now() - startTime) / 1000 / 60) : 0;
                            
                            statusMessage += `• **${user.tag}** (${userId}) - Setup duration: ${duration} minutes\n`;
                        } catch (error) {
                            statusMessage += `• **Unknown User** (${userId}) - Setup duration: unknown\n`;
                        }
                    }
                    
                    statusMessage += `\n🛡️ **Security Note:** These users are under DM policy enforcement to prevent exploitation.`;
                    
                    await interaction.reply({
                        content: statusMessage,
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('🐷 Setup users check failed:', error);
                    
                    await interaction.reply({
                        content: `❌ Failed to get setup users: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        ephemeral: true
                    });
                }
            }
        };

        return routes[commandName] || null;
    }

    /**
     * Handle help command
     */
    private async handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        // Get all registered commands from the registry
        const { CommandRegistry } = require('./CommandRegistry');
        const registry = CommandRegistry.getInstance();
        const allCommands = registry.getAllCommands();
        
        // Group commands by category
        const commandsByCategory: Record<string, string[]> = {};
        allCommands.forEach((cmd: any) => {
            if (!commandsByCategory[cmd.category]) {
                commandsByCategory[cmd.category] = [];
            }
            commandsByCategory[cmd.category].push(`\`/${cmd.name}\` - ${cmd.description}`);
        });

        let helpText = `🐷 **Oink Bot Help** 🐽\n\n`;
        
        // Build help text by category
        Object.entries(commandsByCategory).forEach(([category, commands]) => {
            const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
            helpText += `**${categoryName} Commands:**\n`;
            commands.forEach(cmd => {
                helpText += `• ${cmd}\n`;
            });
            helpText += '\n';
        });

        helpText += `**Total Commands:** ${allCommands.length}\n`;
        helpText += `For more detailed help on a specific command, use \`/help <command>\``;

        await interaction.reply({
            content: helpText,
            ephemeral: true
        });
    }

    /**
     * Handle ping command
     */
    private async handlePingCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        const start = Date.now();
        await interaction.reply('🐷 Pinging...');
        const end = Date.now();
        const latency = end - start;

        await interaction.editReply(`🐷 **Pong!** 🐽\n\n**Bot Latency:** ${latency}ms\n**API Latency:** ${Math.round(interaction.client.ws.ping)}ms`);
    }

    /**
     * Handle info command
     */
    private async handleInfoCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        const infoText = `🐷 **Oink Bot Information** 🐽

**Version:** 2.0.0 (Refactored)
**Status:** Online and Ready
**Uptime:** ${Math.floor(interaction.client.uptime! / 1000 / 60)} minutes
**Servers:** ${interaction.client.guilds.cache.size}
**Users:** ${interaction.client.users.cache.size}

**Features:**
• Secure payment processing
• Escrow protection
• Multiple payment methods
• Transaction history
• Server configuration
• Advanced command system

**Support:** Use \`/help\` for command help`;

        await interaction.reply({
            content: infoText,
            ephemeral: true
        });
    }

    /**
     * Handle unknown command
     */
    private async handleUnknownCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.reply({
            content: '❌ Oink... Unknown command. Use `/help` to see available commands.',
            ephemeral: true
        });
    }

    public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
        try {
            const customId = interaction.customId;
            const route = this.getButtonRoute(customId);

            if (route) {
                await route(interaction);
            } else {
                await this.handleUnknownButton(interaction);
            }
        } catch (error) {
            console.error('❌ Oink... button interaction error:', error);
            await this.errorHandler.handleButtonError(interaction, error as Error);
        }
    }

    public async handleSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
        try {
            const customId = interaction.customId;
            const route = this.getSelectMenuRoute(customId);

            if (route) {
                await route(interaction);
            } else {
                await this.handleUnknownSelectMenu(interaction);
            }
        } catch (error) {
            console.error('❌ Oink... select menu interaction error:', error);
            await this.errorHandler.handleSelectMenuError(interaction, error as Error);
        }
    }

    public async handleModalSubmitInteraction(interaction: ModalSubmitInteraction): Promise<void> {
        try {
            const customId = interaction.customId;
            const route = this.getModalRoute(customId);

            if (route) {
                await route(interaction);
            } else {
                await this.handleUnknownModal(interaction);
            }
        } catch (error) {
            console.error('❌ Oink... modal submit interaction error:', error);
            await this.errorHandler.handleModalError(interaction, error as Error);
        }
    }

    private getButtonRoute(customId: string): ((interaction: ButtonInteraction) => Promise<void>) | null {
        const routes: Record<string, (interaction: ButtonInteraction) => Promise<void>> = {
            // Payment routes
            'payment_confirm_': async (interaction) => {
                await this.paymentHandler['paymentFlowOrchestrator'].getConfirmationHandler().handlePaymentConfirmation(interaction);
            },
            'payment_cancel': async (interaction) => {
                // Use the result handler for cancellation
                await this.paymentHandler['paymentFlowOrchestrator'].getResultHandler().handlePaymentCancellation(interaction as any);
            },

            // Request routes
            'request_': async (interaction) => {
                await this.requestHandler.handlePaymentRequestResponse(interaction);
            },

            // Transaction routes
            'transaction_detail_': async (interaction) => {
                await this.transactionHandler.handleTransactionDetailView(interaction);
            },
            'transaction_export_': async (interaction) => {
                await this.transactionHandler.handleTransactionExport(interaction);
            },

            // Setup routes - handle DM setup interactions
            'setup_': async (interaction) => {
                if (customId === 'setup_payment_redirect') {
                    await interaction.reply({
                        content: 'Please use the `/setup-payment` command to set up your payment methods.',
                        flags: 64
                    });
                } else if (customId.startsWith('setup_ach') || customId.startsWith('setup_crypto') || customId.startsWith('setup_other')) {
                    // Handle DM setup choices
                    await this.setupFlowOrchestrator.getSetupDelivery().handleSetupChoice(interaction);
                } else if (customId === 'show_friend_help') {
                    // Show friend request help
                    await this.setupFlowOrchestrator.getSetupDelivery().handleSetupChoice(interaction);
                } else {
                    // Fall back to button handler for other setup buttons
                    await this.setupFlowOrchestrator.getButtonHandler().handleSetupButton(interaction);
                }
            },

            // Config routes
            'config_toggle_payments': async (interaction) => {
                await this.paymentConfigHandler.handleTogglePayments(interaction);
            },
            'config_set_limits': async (interaction) => {
                await this.paymentConfigHandler.handleSetLimits(interaction);
            },
            'config_payment_methods': async (interaction) => {
                await this.paymentConfigHandler.handlePaymentMethods(interaction);
            },
            'config_manage_admins': async (interaction) => {
                await this.paymentConfigHandler.handleManageAdmins(interaction);
            },
            'config_back_to_main': async (interaction) => {
                await this.paymentConfigHandler.handleBackToMain(interaction);
            },
            'config_refresh': async (interaction) => {
                await this.paymentConfigHandler.handleRefresh(interaction);
            }
        };

        // Find matching route
        for (const [prefix, handler] of Object.entries(routes)) {
            if (customId.startsWith(prefix) || customId === prefix) {
                return handler;
            }
        }

        return null;
    }

    private getSelectMenuRoute(customId: string): ((interaction: StringSelectMenuInteraction) => Promise<void>) | null {
        const routes: Record<string, (interaction: StringSelectMenuInteraction) => Promise<void>> = {
            'payment_method_select_': async (interaction) => {
                // Use the method selection handler's show method
                await this.paymentHandler['paymentFlowOrchestrator'].getMethodSelectionHandler().showPaymentMethodSelection(interaction as any, {} as any, 0, '');
            },
            'transaction_filter_': async (interaction) => {
                await this.transactionHandler.handleTransactionFilter(interaction);
            },
            'config_payment_methods_select': async (interaction) => {
                await this.paymentConfigHandler.handlePaymentMethodsSelection(interaction);
            }
        };

        // Find matching route
        for (const [prefix, handler] of Object.entries(routes)) {
            if (customId.startsWith(prefix)) {
                return handler;
            }
        }

        return null;
    }

    private getModalRoute(customId: string): ((interaction: ModalSubmitInteraction) => Promise<void>) | null {
        const routes: Record<string, (interaction: ModalSubmitInteraction) => Promise<void>> = {
            'config_limits_modal': async (interaction) => {
                await this.paymentConfigHandler.handleLimitsModal(interaction);
            },
            'setup_': async (interaction) => {
                // Handle DM setup modals
                if (customId.startsWith('ach_setup_modal') || customId.startsWith('crypto_setup_modal') || customId.startsWith('other_setup_modal')) {
                    await this.setupFlowOrchestrator.getSetupDelivery().handleSetupModal(interaction);
                } else {
                    // Fall back to modal handler for other setup modals
                    await this.setupFlowOrchestrator.getModalHandler().handleSetupModal(interaction);
                }
            }
        };

        // Find matching route
        for (const [prefix, handler] of Object.entries(routes)) {
            if (customId.startsWith(prefix)) {
                return handler;
            }
        }

        return null;
    }

    private async handleUnknownButton(interaction: ButtonInteraction): Promise<void> {
        await interaction.reply({
            content: '❌ Oink... Unknown button interaction.',
            flags: 64
        });
    }

    private async handleUnknownSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
        await interaction.reply({
            content: '❌ Oink... Unknown select menu interaction.',
            flags: 64
        });
    }

    private async handleUnknownModal(interaction: ModalSubmitInteraction): Promise<void> {
        await interaction.reply({
            content: '❌ Oink... Unknown modal interaction.',
            flags: 64
        });
    }
}
