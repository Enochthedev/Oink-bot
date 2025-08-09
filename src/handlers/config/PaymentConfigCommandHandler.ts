// Core PaymentConfigCommandHandler that orchestrates configuration flows
import {
    CommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction
} from 'discord.js';
import { BaseCommandHandler } from '../CommandHandler';
import { ServerConfigService, ServerConfigServiceImpl } from '../../services/ServerConfigService';
import { ServerConfig } from '../../models/ServerConfig';
import { PaymentConfigOrchestrator } from './PaymentConfigOrchestrator';

export class PaymentConfigCommandHandler extends BaseCommandHandler {
    private serverConfigService: ServerConfigService;
    private configOrchestrator: PaymentConfigOrchestrator;

    constructor(serverConfigService?: ServerConfigService) {
        super();
        this.serverConfigService = serverConfigService || new ServerConfigServiceImpl();
        this.configOrchestrator = new PaymentConfigOrchestrator(this.serverConfigService);
    }

    public getCommandName(): string {
        return 'payment-config';
    }

    public validateParameters(interaction: CommandInteraction): boolean {
        if (!super.validateParameters(interaction)) {
            return false;
        }

        // Must be in a server
        if (!interaction.guildId) {
            return false;
        }

        // Must have admin permissions or be a configured server admin
        return this.configOrchestrator.hasAdminPermissions(interaction);
    }

    public async handle(interaction: CommandInteraction): Promise<void> {
        try {
            await this.deferReply(interaction, true); // Ephemeral for admin privacy

            if (!interaction.guildId) {
                await this.configOrchestrator.handleNotInServer(interaction);
                return;
            }

            // Check admin permissions
            const hasPermission = await this.configOrchestrator.checkAdminPermissions(interaction);
            if (!hasPermission) {
                await this.configOrchestrator.handleInsufficientPermissions(interaction);
                return;
            }

            // Get current server configuration
            const config = await this.serverConfigService.getServerConfig(interaction.guildId);
            await this.configOrchestrator.showConfigurationMenu(interaction, config);

        } catch (error) {
            console.error('Payment config command error:', error);
            await this.configOrchestrator.handleConfigError(interaction, error as Error);
        }
    }

    // Button interaction handlers
    public async handleTogglePayments(interaction: ButtonInteraction): Promise<void> {
        await this.configOrchestrator.handleTogglePayments(interaction);
    }

    public async handleSetLimits(interaction: ButtonInteraction): Promise<void> {
        await this.configOrchestrator.handleSetLimits(interaction);
    }

    public async handlePaymentMethods(interaction: ButtonInteraction): Promise<void> {
        await this.configOrchestrator.handlePaymentMethods(interaction);
    }

    public async handleManageAdmins(interaction: ButtonInteraction): Promise<void> {
        await this.configOrchestrator.handleManageAdmins(interaction);
    }

    public async handleBackToMain(interaction: ButtonInteraction): Promise<void> {
        await this.configOrchestrator.handleBackToMain(interaction);
    }

    public async handleRefresh(interaction: ButtonInteraction): Promise<void> {
        await this.configOrchestrator.handleRefresh(interaction);
    }

    // Modal interaction handlers
    public async handleLimitsModal(interaction: ModalSubmitInteraction): Promise<void> {
        await this.configOrchestrator.handleLimitsModal(interaction);
    }

    // Select menu interaction handlers
    public async handlePaymentMethodsSelection(interaction: StringSelectMenuInteraction): Promise<void> {
        await this.configOrchestrator.handlePaymentMethodsSelection(interaction);
    }

    // Get the orchestrator for direct access if needed
    public getConfigOrchestrator(): PaymentConfigOrchestrator {
        return this.configOrchestrator;
    }
}
