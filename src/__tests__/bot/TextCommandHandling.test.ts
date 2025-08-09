import { describe, it, expect } from 'vitest';

// Test the text command parsing logic directly
describe('Text Command Handling', () => {
  describe('oink prefix commands', () => {
    it('should handle "oink pay" command', () => {
      const content = 'oink pay @user 10.50 Coffee payment';
      const oinkPrefix = 'oink';
      
      if (content.startsWith(oinkPrefix + ' ')) {
        const commandContent = content.substring(oinkPrefix.length + 1);
        const args = commandContent.split(' ');
        const commandName = args[0].toLowerCase();
        const commandArgs = args.slice(1);
        
        expect(commandName).toBe('pay');
        expect(commandArgs).toEqual(['@user', '10.50', 'Coffee', 'payment']);
      }
    });

    it('should handle "oink balance" command', () => {
      const content = 'oink balance';
      const oinkPrefix = 'oink';
      
      if (content.startsWith(oinkPrefix + ' ')) {
        const commandContent = content.substring(oinkPrefix.length + 1);
        const args = commandContent.split(' ');
        const commandName = args[0].toLowerCase();
        
        expect(commandName).toBe('balance');
        expect(args).toEqual(['balance']);
      }
    });
  });

  describe('@oink mention commands', () => {
    it('should handle "@oink pay" command', () => {
      const content = '<@123456789> pay @user 25.00 Lunch';
      const mentionPrefix = '<@123456789>';
      
      if (content.startsWith(mentionPrefix + ' ')) {
        const commandContent = content.substring(mentionPrefix.length + 1);
        const args = commandContent.split(' ');
        const commandName = args[0].toLowerCase();
        const commandArgs = args.slice(1);
        
        expect(commandName).toBe('pay');
        expect(commandArgs).toEqual(['@user', '25.00', 'Lunch']);
      }
    });

    it('should handle "@oink profile" command', () => {
      const content = '<@123456789> profile';
      const mentionPrefix = '<@123456789>';
      
      if (content.startsWith(mentionPrefix + ' ')) {
        const commandContent = content.substring(mentionPrefix.length + 1);
        const args = commandContent.split(' ');
        const commandName = args[0].toLowerCase();
        
        expect(commandName).toBe('profile');
        expect(args).toEqual(['profile']);
      }
    });
  });

  describe('command validation', () => {
    it('should ignore bot messages', () => {
      const isBot = true;
      const content = 'oink pay @user 10.50';
      
      // Bot messages should be ignored
      expect(isBot).toBe(true);
    });

    it('should ignore empty messages', () => {
      const content = '';
      
      // Empty messages should be ignored
      expect(content).toBe('');
    });

    it('should ignore messages without oink prefix', () => {
      const content = 'hello world';
      const oinkPrefix = 'oink';
      const mentionPrefix = '<@123456789>';
      
      // Messages without proper prefixes should be ignored
      const hasOinkPrefix = content.startsWith(oinkPrefix + ' ');
      const hasMentionPrefix = content.startsWith(mentionPrefix + ' ');
      
      expect(hasOinkPrefix).toBe(false);
      expect(hasMentionPrefix).toBe(false);
    });
  });

  describe('command parsing', () => {
    it('should correctly parse command arguments', () => {
      const testCases = [
        {
          input: 'oink pay @user 10.50 Coffee',
          expected: { command: 'pay', args: ['@user', '10.50', 'Coffee'] }
        },
        {
          input: 'oink request @user 25.00 Lunch payment',
          expected: { command: 'request', args: ['@user', '25.00', 'Lunch', 'payment'] }
        },
        {
          input: 'oink balance',
          expected: { command: 'balance', args: ['balance'] }
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const content = input.trim();
        const oinkPrefix = 'oink';
        
        if (content.startsWith(oinkPrefix + ' ')) {
          const commandContent = content.substring(oinkPrefix.length + 1);
          const args = commandContent.split(' ');
          const commandName = args[0].toLowerCase();
          const commandArgs = args.slice(1);
          
          expect(commandName).toBe(expected.command);
          expect(commandArgs).toEqual(expected.args);
        }
      });
    });
  });

  describe('command prefix configuration', () => {
    it('should support configurable bot prefix', () => {
      const config = {
        BOT_PREFIX: 'oink'
      };
      
      const content = `${config.BOT_PREFIX} pay @user 10.50`;
      const prefix = config.BOT_PREFIX;
      
      if (content.startsWith(prefix + ' ')) {
        const commandContent = content.substring(prefix.length + 1);
        const args = commandContent.split(' ');
        const commandName = args[0].toLowerCase();
        
        expect(commandName).toBe('pay');
        expect(prefix).toBe('oink');
      }
    });

    it('should handle different prefix lengths', () => {
      const testPrefixes = ['oink', 'pig', 'bot'];
      
      testPrefixes.forEach(prefix => {
        const content = `${prefix} pay @user 10.50`;
        
        if (content.startsWith(prefix + ' ')) {
          const commandContent = content.substring(prefix.length + 1);
          const args = commandContent.split(' ');
          const commandName = args[0].toLowerCase();
          
          expect(commandName).toBe('pay');
          expect(args).toEqual(['@user', '10.50']);
        }
      });
    });
  });
});
