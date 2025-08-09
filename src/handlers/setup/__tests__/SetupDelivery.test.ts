import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ButtonInteraction, ModalSubmitInteraction, User } from 'discord.js';
import { SetupDelivery } from '../SetupDelivery';
import { UserAccountService } from '../../../services/UserAccountService';

// Mock Discord.js classes
vi.mock('discord.js', () => ({
  ButtonInteraction: vi.fn(),
  ModalSubmitInteraction: vi.fn(),
  User: vi.fn(),
}));

// Mock services
vi.mock('../../../services/UserAccountService');
vi.mock('../../../utils/AuditLogger');
vi.mock('../../../utils/ErrorHandler');

describe('SetupDelivery', () => {
  let setupDelivery: SetupDelivery;
  let mockUserAccountService: UserAccountService;
  let mockUser: User;

  beforeEach(() => {
    mockUserAccountService = {} as UserAccountService;
    mockUser = {} as User;
    setupDelivery = new SetupDelivery(mockUserAccountService);
  });

  describe('handleSetupChoice', () => {
    it('should handle ACH setup choice', async () => {
      const mockInteraction = {
        customId: 'setup_ach',
        user: mockUser,
        reply: vi.fn(),
        showModal: vi.fn(),
      } as unknown as ButtonInteraction;

      await setupDelivery.handleSetupChoice(mockInteraction);

      expect(mockInteraction.showModal).toHaveBeenCalled();
    });

    it('should handle crypto setup choice', async () => {
      const mockInteraction = {
        customId: 'setup_crypto',
        user: mockUser,
        reply: vi.fn(),
        showModal: vi.fn(),
      } as unknown as ButtonInteraction;

      await setupDelivery.handleSetupChoice(mockInteraction);

      expect(mockInteraction.showModal).toHaveBeenCalled();
    });

    it('should handle other setup choice', async () => {
      const mockInteraction = {
        customId: 'setup_other',
        user: mockUser,
        reply: vi.fn(),
        showModal: vi.fn(),
      } as unknown as ButtonInteraction;

      await setupDelivery.handleSetupChoice(mockInteraction);

      expect(mockInteraction.showModal).toHaveBeenCalled();
    });

    it('should handle friend help choice', async () => {
      const mockInteraction = {
        customId: 'show_friend_help',
        user: mockUser,
        reply: vi.fn(),
      } as unknown as ButtonInteraction;

      await setupDelivery.handleSetupChoice(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should handle unknown choice', async () => {
      const mockInteraction = {
        customId: 'unknown_choice',
        user: mockUser,
        reply: vi.fn(),
      } as unknown as ButtonInteraction;

      await setupDelivery.handleSetupChoice(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Unknown setup option. Please try again.',
        ephemeral: true
      });
    });
  });

  describe('handleSetupModal', () => {
    it('should handle ACH setup modal', async () => {
      const mockInteraction = {
        customId: 'ach_setup_modal',
        user: mockUser,
        reply: vi.fn(),
        fields: {
          getTextInputValue: vi.fn((field: string) => {
            const values: Record<string, string> = {
              'account_number': '1234567890',
              'routing_number': '123456789',
              'account_type': 'checking',
              'account_holder': 'John Doe'
            };
            return values[field];
          })
        }
      } as unknown as ModalSubmitInteraction;

      await setupDelivery.handleSetupModal(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should handle crypto setup modal', async () => {
      const mockInteraction = {
        customId: 'crypto_setup_modal',
        user: mockUser,
        reply: vi.fn(),
        fields: {
          getTextInputValue: vi.fn((field: string) => {
            const values: Record<string, string> = {
              'wallet_address': '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
              'crypto_type': 'BTC',
              'wallet_name': 'My Bitcoin Wallet'
            };
            return values[field];
          })
        }
      } as unknown as ModalSubmitInteraction;

      await setupDelivery.handleSetupModal(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should handle other setup modal', async () => {
      const mockInteraction = {
        customId: 'other_setup_modal',
        user: mockUser,
        reply: vi.fn(),
        fields: {
          getTextInputValue: vi.fn((field: string) => {
            const values: Record<string, string> = {
              'method_type': 'PayPal',
              'account_info': 'john.doe@example.com',
              'additional_notes': 'Preferred payment method'
            };
            return values[field];
          })
        }
      } as unknown as ModalSubmitInteraction;

      await setupDelivery.handleSetupModal(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should handle unknown modal', async () => {
      const mockInteraction = {
        customId: 'unknown_modal',
        user: mockUser,
        reply: vi.fn(),
      } as unknown as ModalSubmitInteraction;

      await setupDelivery.handleSetupModal(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Unknown setup form. Please try again.',
        ephemeral: true
      });
    });
  });

  describe('validation methods', () => {
    it('should validate ACH inputs correctly', () => {
      const isValid = (setupDelivery as any).validateACHInputs(
        '1234567890',
        '123456789',
        'checking',
        'John Doe'
      );
      expect(isValid).toBe(true);
    });

    it('should validate crypto inputs correctly', () => {
      const isValid = (setupDelivery as any).validateCryptoInputs(
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        'BTC'
      );
      expect(isValid).toBe(true);
    });

    it('should validate other inputs correctly', () => {
      const isValid = (setupDelivery as any).validateOtherInputs(
        'PayPal',
        'john.doe@example.com'
      );
      expect(isValid).toBe(true);
    });
  });

  describe('account number masking', () => {
    it('should mask account number correctly', () => {
      const masked = (setupDelivery as any).maskAccountNumber('1234567890');
      expect(masked).toBe('******7890');
    });

    it('should handle short account numbers', () => {
      const masked = (setupDelivery as any).maskAccountNumber('1234');
      expect(masked).toBe('1234');
    });
  });
});


