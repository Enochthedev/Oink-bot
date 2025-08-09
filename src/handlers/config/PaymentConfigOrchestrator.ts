// PaymentConfigOrchestrator manages the overall configuration flow
import {
    CommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    PermissionFlagsBits
} from 'discord.js';
import { ServerConfigService } from '../../services/ServerConfigService';
import { ServerConfig } from '../../models/ServerConfig';
import { ConfigMenuHandler } from './ConfigMenuHandler';
import { ConfigButtonHandler } from './ConfigButtonHandler';
import { ConfigModalHandler } from './ConfigModalHandler';
import { ConfigSelectMenuHandler } from './ConfigSelectMenuHandler';

export class PaymentConfigOrchestrator {
    private serverConfigService: ServerConfigService;
    private menuHandler: ConfigMenuHandler;
    private buttonHandler: ConfigButtonHandler;
    private modalHandler: ConfigModalHandler;
    private selectMenuHandler: ConfigSelectMenuHandler;

    constructor(serverConfigService: ServerConfigService) {
        this.serverConfigService = serverConfigService;
        this.menuHandler = new ConfigMenuHandler(serverConfigService);
        this.buttonHandler = new ConfigButtonHandler(serverConfigService);
        this.modalHandler = new ConfigModalHandler(serverConfigService);
        this.selectMenuHandler = new ConfigSelectMenuHandler(serverConfigService);
    }

    /**
     * Check if user has admin permissions
     */
    public hasAdminPermissions(interaction: CommandInteraction): boolean {
        // Check Discord permissions
        if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
            interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return true;
        }

        return false;
    }

    /**
     * Check admin permissions including server-specific admins
     */
    public async checkAdminPermissions(interaction: CommandInteraction): Promise<boolean> {
        // Check Discord permissions first
        if (this.hasAdminPermissions(interaction)) {
            return true;
        }

        // Check if user is a configured server admin
        if (interaction.guildId) {
            const isServerAdmin = await this.serverConfigService.isServerAdmin(
                interaction.user.id,
                interaction.guildId
            );
            return isServerAdmin;
        }

        return false;
    }

    /**
     * Show the main configuration menu
     */
    public async showConfigurationMenu(interaction: CommandInteraction, config: ServerConfig | null): Promise<void> {
        await this.menuHandler.showConfigurationMenu(interaction, config);
    }

    /**
     * Handle toggle payments button
     */
    public async handleTogglePayments(interaction: ButtonInteraction): Promise<void> {
        await this.buttonHandler.handleTogglePayments(interaction);
    }

    /**
     * Handle set limits button
     */
    public async handleSetLimits(interaction: ButtonInteraction): Promise<void> {
        await this.buttonHandler.handleSetLimits(interaction);
    }

    /**
     * Handle payment methods button
     */
    public async handlePaymentMethods(interaction: ButtonInteraction): Promise<void> {
        await this.buttonHandler.handlePaymentMethods(interaction);
    }

    /**
     * Handle manage admins button
     */
    public async handleManageAdmins(interaction: ButtonInteraction): Promise<void> {
        await this.buttonHandler.handleManageAdmins(interaction);
    }

    /**
     * Handle back to main button
     */
    public async handleBackToMain(interaction: ButtonInteraction): Promise<void> {
        await this.buttonHandler.handleBackToMain(interaction);
    }

    /**
     * Handle refresh button
     */
    public async handleRefresh(interaction: ButtonInteraction): Promise<void> {
        await this.buttonHandler.handleRefresh(interaction);
    }

    /**
     * Handle limits modal
     */
    public async handleLimitsModal(interaction: ModalSubmitInteraction): Promise<void> {
        await this.modalHandler.handleLimitsModal(interaction);
    }

    /**
     * Handle payment methods selection
     */
    public async handlePaymentMethodsSelection(interaction: StringSelectMenuInteraction): Promise<void> {
        await this.selectMenuHandler.handlePaymentMethodsSelection(interaction);
    }

    /**
     * Handle not in server error
     */
    public async handleNotInServer(interaction: CommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction): Promise<void> {
        await this.menuHandler.handleNotInServer(interaction);
    }

    /**
     * Handle insufficient permissions error
     */
    public async handleInsufficientPermissions(interaction: CommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction): Promise<void> {
        await this.menuHandler.handleInsufficientPermissions(interaction);
    }

    /**
     * Handle configuration error
     */
    public async handleConfigError(interaction: CommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction, error: Error): Promise<void> {
        await this.menuHandler.handleConfigError(interaction, error);
    }

    // Getter methods for individual handlers
    public getMenuHandler(): ConfigMenuHandler {
        return this.menuHandler;
    }

    public getButtonHandler(): ConfigButtonHandler {
        return this.buttonHandler;
    }

    public getModalHandler(): ConfigModalHandler {
        return this.modalHandler;
    }

    public getSelectMenuHandler(): ConfigSelectMenuHandler {
        return this.selectMenuHandler;
    }
}
