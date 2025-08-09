# 🐷 Oink Bot Architecture

This directory contains the refactored Discord bot architecture that provides a clean, maintainable, and scalable foundation for the Oink Bot.

## 🏗️ Architecture Overview

The new architecture follows the **Single Responsibility Principle** and **Dependency Injection** patterns, making it much easier to maintain and extend.

### Core Components

1. **`DiscordBot`** - Main bot class (now much cleaner!)
2. **`CommandRegistry`** - Manages all command definitions and metadata
3. **`CommandManager`** - Handles command registration, validation, and execution
4. **`InteractionRouter`** - Routes all Discord interactions to appropriate handlers
5. **`ServiceContainer`** - Manages all service dependencies and their lifecycle
6. **`CommandFactory`** - Factory for creating new commands easily
7. **`ErrorHandler`** - Centralized error handling

## 🚀 How to Add New Commands

### Method 1: Using CommandFactory (Recommended)

```typescript
import { CommandFactory, CommandCategory } from '@bot/CommandFactory';

// Create a simple utility command
const helpCommand = CommandFactory.createUtilityCommand(
    'help',
    '🐷 Get help with Oink Bot commands'
);

// Create a payment command with options
const tipCommand = CommandFactory.createPaymentCommand(
    'tip',
    '🐷 Send a tip to another user',
    [
        {
            name: 'recipient',
            description: '🐽 The user to tip',
            required: true,
            type: 'user'
        },
        {
            name: 'amount',
            description: '💰 Tip amount',
            required: true,
            type: 'number',
            minValue: 0.01
        }
    ]
);

// Create an admin command
const adminCommand = CommandFactory.createAdminCommand(
    'server-stats',
    '🐷 View server statistics (Admin only)'
);
```

### Method 2: Manual Command Definition

```typescript
import { CommandDefinition, CommandCategory } from '@bot/CommandRegistry';
import { SlashCommandBuilder } from 'discord.js';

const customCommand: CommandDefinition = {
    name: 'custom',
    description: '🐷 A custom command',
    category: CommandCategory.UTILITY,
    builder: new SlashCommandBuilder()
        .setName('custom')
        .setDescription('🐷 A custom command')
        .addStringOption(option =>
            option.setName('input')
                .setDescription('Some input')
                .setRequired(true)
        )
};
```

## 🔧 Adding New Interaction Types

To add new button, select menu, or modal interactions, update the `InteractionRouter`:

```typescript
// In InteractionRouter.ts
private getButtonRoute(customId: string): ((interaction: ButtonInteraction) => Promise<void>) | null {
    const routes: Record<string, (interaction: ButtonInteraction) => Promise<void>> = {
        // ... existing routes ...
        
        // Add your new route
        'my_new_button': async (interaction) => {
            await this.myNewHandler.handleButton(interaction);
        }
    };
    
    // ... rest of the method
}
```

## 🎯 Benefits of the New Architecture

1. **Separation of Concerns** - Each class has a single responsibility
2. **Easy to Extend** - Adding new commands is straightforward
3. **Maintainable** - Code is organized and easy to understand
4. **Testable** - Each component can be tested independently
5. **Scalable** - New features can be added without affecting existing code
6. **Type Safe** - Full TypeScript support with proper interfaces

## 📁 File Structure

```
src/bot/
├── DiscordBot.ts          # Main bot class (clean and focused)
├── CommandRegistry.ts     # Command definitions and metadata
├── CommandManager.ts      # Command handling and execution
├── InteractionRouter.ts   # Routes all interactions
├── ServiceContainer.ts    # Manages all dependencies
├── CommandFactory.ts      # Factory for creating commands
├── ErrorHandler.ts        # Centralized error handling
├── index.ts              # Exports all components
└── README.md             # This file
```

## 🧪 Testing

Each component can be tested independently:

```typescript
import { CommandRegistry } from '@bot/CommandRegistry';

describe('CommandRegistry', () => {
    it('should register commands correctly', () => {
        const registry = CommandRegistry.getInstance();
        const commands = registry.getAllCommands();
        expect(commands.length).toBeGreaterThan(0);
    });
});
```

## 🔄 Migration from Old Architecture

The old `DiscordBot.ts` had everything mixed together. The new architecture:

- ✅ Separates command definitions into `CommandRegistry`
- ✅ Moves interaction handling to `InteractionRouter`
- ✅ Centralizes services in `ServiceContainer`
- ✅ Makes command management clean with `CommandManager`
- ✅ Provides easy command creation with `CommandFactory`

## 🎉 Oink! 

This new architecture makes the bot much more maintainable and fun to work with! 🐷✨
