// SetupFlowOrchestrator manages the overall setup flow
import { User } from 'discord.js';
import { UserAccountService } from '../../services/UserAccountService';
import { SetupModalHandler } from './SetupModalHandler';
import { SetupButtonHandler } from './SetupButtonHandler';
import { SetupDMHandler } from './SetupDMHandler';
import { SetupDelivery } from './SetupDelivery';

export class SetupFlowOrchestrator {
  private userAccountService: UserAccountService;
  private modalHandler: SetupModalHandler;
  private buttonHandler: SetupButtonHandler;
  private dmHandler: SetupDMHandler;
  private setupDelivery: SetupDelivery;

  constructor(userAccountService: UserAccountService) {
    this.userAccountService = userAccountService;
    this.modalHandler = new SetupModalHandler(userAccountService);
    this.buttonHandler = new SetupButtonHandler(userAccountService);
    this.dmHandler = new SetupDMHandler();
    this.setupDelivery = new SetupDelivery(userAccountService);
  }

  /**
   * Initializes the setup flow
   * Returns false to indicate no DM was sent (we show popup instead)
   */
  async initiateSetup(user: User): Promise<boolean> {
    // Skip DM attempt and go straight to popup interface
    // This provides immediate setup options without DM complications
    return false;
  }

  /**
   * Gets the modal handler for processing setup modals
   */
  getModalHandler(): SetupModalHandler {
    return this.modalHandler;
  }

  /**
   * Gets the button handler for processing setup button interactions
   */
  getButtonHandler(): SetupButtonHandler {
    return this.buttonHandler;
  }

  /**
   * Gets the DM handler for sending setup-related messages
   */
  getDMHandler(): SetupDMHandler {
    return this.dmHandler;
  }

  /**
   * Gets the setup delivery handler for processing DM interactions
   */
  getSetupDelivery(): SetupDelivery {
    return this.setupDelivery;
  }

  /**
   * Checks if a user has completed setup
   */
  async isSetupComplete(userId: string): Promise<boolean> {
    try {
      const account = await this.userAccountService.getAccount(userId);
      if (!account) {
        return false;
      }
      
      // Check if payment methods are configured
      const paymentMethods = await this.userAccountService.getPaymentMethods(userId);
      const hasPaymentMethods = paymentMethods.length > 0;
      
      return hasPaymentMethods;
    } catch (error) {
      console.error(`🐷 Error checking setup status for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Gets setup status for a user
   */
  async getSetupStatus(userId: string): Promise<{
    hasAccount: boolean;
    hasPaymentMethods: boolean;
    isComplete: boolean;
  }> {
    try {
      const account = await this.userAccountService.getAccount(userId);
      const hasAccount = account !== null;
      
      let hasPaymentMethods = false;
      if (hasAccount) {
        const paymentMethods = await this.userAccountService.getPaymentMethods(userId);
        hasPaymentMethods = paymentMethods.length > 0;
      }
      
      return {
        hasAccount,
        hasPaymentMethods,
        isComplete: hasAccount && hasPaymentMethods
      };
    } catch (error) {
      console.error(`🐷 Error getting setup status for user ${userId}:`, error);
      return {
        hasAccount: false,
        hasPaymentMethods: false,
        isComplete: false
      };
    }
  }
}
