// Pig-themed message utility for Oink Bot
export class PigThemedMessages {
  // Pig emojis and expressions
  private static readonly PIG_EMOJIS = {
    HAPPY: '🐷',
    EXCITED: '🐽',
    THINKING: '🤔',
    MONEY: '💰',
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',
    HEART: '💖',
    PARTY: '🎉',
    SLEEP: '😴',
    WORK: '🔨',
    MAGIC: '✨',
    ROCKET: '🚀',
    TROPHY: '🏆',
    STAR: '⭐',
    SPARKLES: '💫',
    COIN: '🪙',
    BANK: '🏦',
    SHIELD: '🛡️'
  };

  // Pig-themed greetings and responses
  private static readonly GREETINGS = [
    'Oink oink! 🐷',
    'Hello there, piggy friend! 🐽',
    'Greetings, oinker! 🐷',
    'Well hello, little piglet! 🐽',
    'Oink! Nice to see you! 🐷'
  ];

  private static readonly EXCITED_RESPONSES = [
    'Oink oink oink! 🐽',
    'Wee wee wee! 🐷',
    'Snort snort! 🐽',
    'Piggy dance! 🐷💃',
    'Oink-tastic! 🐽✨'
  ];

  private static readonly THINKING_RESPONSES = [
    'Hmm... let me think about this... 🤔🐷',
    'Oink... processing... 🐽',
    'Let me put on my thinking snout... 🤔🐷',
    'Snort... calculating... 🐽',
    'Oink... analyzing... 🐷🤔'
  ];

  private static readonly SUCCESS_RESPONSES = [
    'Oink-tastic! That worked perfectly! 🐷✅',
    'Wee wee! Success! 🐽✨',
    'Snort! Job well done! 🐷🎉',
    'Oink! Everything is piggy perfect! 🐽✅',
    'Piggy success! 🐷🏆'
  ];

  private static readonly ERROR_RESPONSES = [
    'Oink... something went wrong... 🐷❌',
    'Snort... that didn\'t work as expected... 🐽❌',
    'Wee wee... error detected... 🐷❌',
    'Oink... trouble in piggy paradise... 🐽❌',
    'Snort... something\'s not quite right... 🐷❌'
  ];

  private static readonly MONEY_RESPONSES = [
    'Cha-ching! 💰🐷',
    'Money makes the piggy world go round! 🪙🐽',
    'Oink! Time to handle some cash! 🐷💰',
    'Snort! Financial matters ahead! 🐽🏦',
    'Wee wee! Money business! 🐷💸'
  ];

  // Get random response from arrays
  private static getRandomResponse(array: string[]): string {
    return array[Math.floor(Math.random() * array.length)];
  }

  // Public methods for different message types
  public static getGreeting(): string {
    return this.getRandomResponse(this.GREETINGS);
  }

  public static getExcited(): string {
    return this.getRandomResponse(this.EXCITED_RESPONSES);
  }

  public static getThinking(): string {
    return this.getRandomResponse(this.THINKING_RESPONSES);
  }

  public static getSuccess(): string {
    return this.getRandomResponse(this.SUCCESS_RESPONSES);
  }

  public static getError(): string {
    return this.getRandomResponse(this.ERROR_RESPONSES);
  }

  public static getMoney(): string {
    return this.getRandomResponse(this.MONEY_RESPONSES);
  }

  // Specific themed messages
  public static getPaymentInitiated(amount: number, currency: string = 'USD'): string {
    return `🐷 Oink! Payment of ${currency} ${amount.toFixed(2)} initiated! 🪙`;
  }

  public static getPaymentCompleted(amount: number, currency: string = 'USD'): string {
    return `🎉 Wee wee! Payment of ${currency} ${amount.toFixed(2)} completed successfully! 🐷💰`;
  }

  public static getPaymentFailed(reason: string): string {
    return `❌ Oink... payment failed: ${reason} 🐷`;
  }

  public static getSetupWelcome(): string {
    return `🐷 Welcome to Oink Bot setup! Let's get your payment methods configured, little piggy! 🐽✨`;
  }

  public static getSetupComplete(): string {
    return `🎉 Oink-tastic! Your payment setup is complete! You're ready to start oinking with money! 🐷💰`;
  }

  public static getWelcomeMessage(): string {
    return `🐷 **Welcome to Oink Bot!** 🐽\n\nI'm your friendly piggy payment assistant! I can help you:\n• Send payments to other users 💰\n• Request payments from friends 🪙\n• Manage your transaction history 📊\n• Set up secure payment methods 🔐\n\nUse \`/setup-payment\` to get started, or \`/pay\` to send money to someone!`;
  }

  public static getHelpMessage(): string {
    return `🐷 **Oink Bot Help** 🐽\n\n**Available Commands:**\n• \`/ping\` - Test if I'm responding (oink oink!)\n• \`/pay\` - Send money to another user 💰\n• \`/request\` - Request payment from someone 🪙\n• \`/transactions\` - View your payment history 📊\n• \`/setup-payment\` - Configure your payment methods 🔐\n• \`/payment-config\` - Server admin settings (Admin only) ⚙️\n\n**Need help?** Just ask and I'll oink you through it! 🐷`;
  }

  public static getRateLimitMessage(): string {
    return `⏱️ Oink... you're sending too many requests too quickly! 🐷 Please slow down a bit and try again later. 🐽`;
  }

  public static getValidationError(field: string): string {
    return `❌ Oink... there's an issue with your ${field}. 🐷 Please check it and try again! 🐽`;
  }

  public static getNoPaymentMethods(): string {
    return `🐷 Oink! You don't have any payment methods set up yet! 🐽\n\nUse \`/setup-payment\` to configure your first payment method and start sending money! 💰✨`;
  }

  public static getPaymentLimitExceeded(limit: number): string {
    return `⚠️ Oink... you've reached your daily payment limit of $${limit.toFixed(2)}! 🐷\n\nTry again tomorrow or contact an admin to increase your limit! 🐽`;
  }

  public static getTransactionHistory(transactionCount: number): string {
    return `📊 Oink! Here are your last ${transactionCount} transactions, little piggy! 🐷💰`;
  }

  public static getNoTransactions(): string {
    return `🐷 Oink... you don't have any transactions yet! 🐽\n\nStart by sending or requesting a payment to see your history here! 💰✨`;
  }

  // Get emoji by name
  public static getEmoji(name: keyof typeof PigThemedMessages.PIG_EMOJIS): string {
    return this.PIG_EMOJIS[name];
  }

  // Combine message with emoji
  public static withEmoji(message: string, emojiName: keyof typeof PigThemedMessages.PIG_EMOJIS): string {
    return `${message} ${this.getEmoji(emojiName)}`;
  }
}
