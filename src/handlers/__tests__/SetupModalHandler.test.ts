// Unit tests for SetupModalHandler
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SetupModalHandler } from '../setup/SetupModalHandler';
import { UserAccountService } from '../../services/UserAccountService';
import { ModalSubmitInteraction, User } from 'discord.js';

// Mock UserAccountService
const mockUserAccountService: UserAccountService = {
  createAccount: vi.fn(),
  getAccount: vi.fn(),
  addPaymentMethod: vi.fn(),
  removePaymentMethod: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  validatePaymentMethod: vi.fn(),
  encryptPaymentDetails: vi.fn(),
  decryptPaymentDetails: vi.fn(),
};

// Mock Discord.js objects
const createMockUser = (id: string = '123456789012345678'): User => ({
  id,
} as any);

const createMockModalSubmitInteraction = (customId: string, user: User, fields: any): ModalSubmitInteraction => ({
  customId,
  user,
  reply: vi.fn(),
  fields: {
    getTextInputValue: vi.fn((fieldId: string) => fields[fieldId] || ''),
  },
} as any);

describe('SetupModalHandler', () => {
  let setupModalHandler: SetupModalHandler;
  let mockUser: User;

  beforeEach(() => {
    setupModalHandler = new SetupModalHandler(mockUserAccountService);
    mockUser = createMockUser();
    vi.clearAllMocks();
  });

  describe('ensureUserAccountExists', () => {
    it('should create account when user does not have one', async () => {
      // Mock that user doesn't have an account
      mockUserAccountService.getAccount = vi.fn().mockResolvedValue(null);
      mockUserAccountService.createAccount = vi.fn().mockResolvedValue({
        id: 'user_123',
        discordId: '123456789012345678',
        paymentMethods: [],
        transactionHistory: [],
        notificationPreferences: {
          enableDMNotifications: true,
          enableChannelNotifications: false,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Test the private method using any type
      const handler = setupModalHandler as any;
      await handler.ensureUserAccountExists('123456789012345678');

      expect(mockUserAccountService.getAccount).toHaveBeenCalledWith('123456789012345678');
      expect(mockUserAccountService.createAccount).toHaveBeenCalledWith('123456789012345678');
    });

    it('should not create account when user already has one', async () => {
      // Mock that user already has an account
      mockUserAccountService.getAccount = vi.fn().mockResolvedValue({
        id: 'user_123',
        discordId: '123456789012345678',
        paymentMethods: [],
        transactionHistory: [],
        notificationPreferences: {
          enableDMNotifications: true,
          enableChannelNotifications: false,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Test the private method using any type
      const handler = setupModalHandler as any;
      await handler.ensureUserAccountExists('123456789012345678');

      expect(mockUserAccountService.getAccount).toHaveBeenCalledWith('123456789012345678');
      expect(mockUserAccountService.createAccount).not.toHaveBeenCalled();
    });
  });

  describe('handleSetupModal', () => {
    it('should ensure user account exists before processing crypto setup', async () => {
      const fields = {
        crypto_wallet_address: '0x1234567890abcdef',
        crypto_type: 'ETH'
      };
      const interaction = createMockModalSubmitInteraction('setup_crypto_modal', mockUser, fields);

      // Mock account creation
      mockUserAccountService.getAccount = vi.fn().mockResolvedValue(null);
      mockUserAccountService.createAccount = vi.fn().mockResolvedValue({});
      mockUserAccountService.addPaymentMethod = vi.fn().mockResolvedValue({});

      await setupModalHandler.handleSetupModal(interaction);

      expect(mockUserAccountService.getAccount).toHaveBeenCalledWith('123456789012345678');
      expect(mockUserAccountService.createAccount).toHaveBeenCalledWith('123456789012345678');
    });
  });
});
