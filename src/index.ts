// Main entry point for the Oink Bot
import { DiscordBot } from './bot/DiscordBot';

async function main() {
  try {
    // Initialize the Discord bot
    // The DiscordBot constructor now automatically sets up all handlers
    // through ServiceContainer and InteractionRouter
    const bot = new DiscordBot();

    // Register slash commands with Discord
    await bot.registerSlashCommands();

    // Start the bot
    await bot.start();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Received SIGINT, shutting down gracefully...');
      await bot.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      await bot.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start Oink Bot:', error);
    process.exit(1);
  }
}

// Start the application
main();