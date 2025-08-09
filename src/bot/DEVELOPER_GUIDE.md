# 🐷 Oink Bot Developer Guide

This comprehensive guide explains how to extend the Oink Bot, add new commands, and understand how each component works together.

## 📚 Table of Contents

1. [Quick Start: Adding Your First Command](#quick-start-adding-your-first-command)
2. [Architecture Deep Dive](#architecture-deep-dive)
3. [Command System Explained](#command-system-explained)
4. [Folder Structure & Responsibilities](#folder-structure--responsibilities)
5. [Advanced Command Features](#advanced-command-features)
6. [Testing Your Commands](#testing-your-commands)
7. [Best Practices & Patterns](#best-practices--patterns)
8. [Troubleshooting](#troubleshooting)

## 🚀 Quick Start: Adding Your First Command

### Step 1: Create Your Command Handler

Create a new file in `src/handlers/` (e.g., `src/handlers/MyCommandHandler.ts`):

```typescript
import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { CommandHandler } from './CommandHandler';

export class MyCommandHandler extends CommandHandler {
    public async handleCommand(interaction: CommandInteraction): Promise<void> {
        try {
            // Your command logic here
            await interaction.reply('🐷 Oink! Your command worked!');
        } catch (error) {
            await this.handleError(interaction, error);
        }
    }
}
```

### Step 2: Register Your Command

Add your command to `src/bot/CommandRegistry.ts`:

```typescript
// In the initializeCommands() method
this.registerCommand(CommandFactory.createUtilityCommand(
    'mycommand',
    '🐷 A description of what your command does',
    [
        {
            name: 'input',
            description: 'Some input parameter',
            required: true,
            type: 'string'
        }
    ],
    {
        aliases: ['mc', 'mycmd'],
        examples: ['/mycommand hello', '/mycommand world'],
        usage: '/mycommand <input>',
        cooldown: 10
    }
));
```

### Step 3: Add to Service Container

Update `src/bot/ServiceContainer.ts`:

```typescript
// Add your handler to the service container
private myCommandHandler: MyCommandHandler;

constructor() {
    // ... existing code ...
    this.myCommandHandler = new MyCommandHandler();
}

// Add getter method
public get myHandler(): MyCommandHandler {
    return this.myCommandHandler;
}
```

### Step 4: Route Interactions

Update `src/bot/InteractionRouter.ts`:

```typescript
// In the handleCommand method
private async handleCommand(interaction: CommandInteraction): Promise<void> {
    const commandName = interaction.commandName;
    
    switch (commandName) {
        // ... existing cases ...
        case 'mycommand':
            await this.serviceContainer.myHandler.handleCommand(interaction);
            break;
        default:
            await this.handleUnknownCommand(interaction);
    }
}
```

## 🏗️ Architecture Deep Dive

### How Components Work Together

```
User types /command → Discord → DiscordBot → InteractionRouter → CommandHandler → Response
```

1. **DiscordBot**: Receives all Discord events and routes them
2. **InteractionRouter**: Determines what type of interaction occurred
3. **CommandHandler**: Executes the actual command logic
4. **ServiceContainer**: Provides access to all services and handlers
5. **CommandRegistry**: Stores command definitions and metadata

### Data Flow

```
Command Definition → CommandRegistry → CommandManager → Discord API → User Interaction → Handler → Response
```

## 🎯 Command System Explained

### Command Types

#### 1. **Utility Commands** (`CommandCategory.UTILITY`)
- Simple commands that don't require special permissions
- Examples: help, ping, info

#### 2. **Payment Commands** (`CommandCategory.PAYMENT`)
- Commands related to money transfers
- Examples: pay, request, tip

#### 3. **Admin Commands** (`CommandCategory.ADMIN`)
- Commands requiring special permissions
- Examples: server-stats, ban, kick

#### 4. **Setup Commands** (`CommandCategory.SETUP`)
- Commands for initial bot configuration
- Examples: setup, configure

### Command Structure

Every command has these components:

```typescript
interface CommandDefinition {
    name: string;                    // Command name (e.g., 'pay')
    description: string;             // What the command does
    builder: SlashCommandBuilder;    // Discord.js command builder
    category: CommandCategory;       // Command category
    permissions?: string[];          // Required permissions
    cooldown?: number;              // Cooldown in seconds
    guildOnly?: boolean;            // Server-only command?
    aliases?: string[];             // Alternative names
    examples?: string[];             // Usage examples
    usage?: string;                  // Usage syntax
    longDescription?: string;        // Detailed description
    requiresSetup?: boolean;         // Needs bot setup first?
    isEphemeral?: boolean;          // Private response?
    maxUses?: number;               // Maximum uses per user
    minLevel?: number;              // Minimum user level
}
```

## 📁 Folder Structure & Responsibilities

### `src/bot/` - Core Bot Architecture

#### `DiscordBot.ts`
- **Purpose**: Main bot class, handles lifecycle and coordination
- **Responsibilities**: 
  - Bot startup/shutdown
  - Event handling setup
  - Command registration with Discord
  - Service coordination
- **Key Methods**:
  - `start()`: Initialize and start the bot
  - `registerSlashCommands()`: Register commands with Discord
  - `stop()`: Gracefully shutdown the bot

#### `CommandRegistry.ts`
- **Purpose**: Central registry for all command definitions
- **Responsibilities**:
  - Store command metadata
  - Provide command lookup
  - Manage command aliases
  - Generate Discord.js command data
- **Key Methods**:
  - `registerCommand()`: Add new command
  - `getCommand()`: Lookup command by name
  - `getSlashCommandData()`: Generate Discord API data

#### `CommandFactory.ts`
- **Purpose**: Factory for creating command definitions
- **Responsibilities**:
  - Create different types of commands
  - Handle option configuration
  - Apply metadata and validation
- **Key Methods**:
  - `createPaymentCommand()`: Create payment-related commands
  - `createUtilityCommand()`: Create utility commands
  - `createAdminCommand()`: Create admin commands

#### `CommandManager.ts`
- **Purpose**: Manages command execution and lifecycle
- **Responsibilities**:
  - Command registration
  - Command validation
  - Command execution coordination
- **Key Methods**:
  - `getSlashCommandData()`: Get command data for Discord
  - `validateCommand()`: Validate command before execution

#### `EnhancedCommandManager.ts`
- **Purpose**: Advanced command system with extra features
- **Responsibilities**:
  - Cooldown management
  - Help system
  - Command statistics
  - Advanced metadata
- **Key Methods**:
  - `getSlashCommandData()`: Enhanced command data
  - `getHelpEmbed()`: Generate help embeds
  - `checkCooldown()`: Validate cooldowns

#### `InteractionRouter.ts`
- **Purpose**: Routes all Discord interactions to appropriate handlers
- **Responsibilities**:
  - Command interaction routing
  - Button interaction routing
  - Select menu routing
  - Modal submission routing
- **Key Methods**:
  - `handleCommand()`: Route slash commands
  - `handleButton()`: Route button clicks
  - `handleSelectMenu()`: Route select menu choices

#### `ServiceContainer.ts`
- **Purpose**: Dependency injection container for all services
- **Responsibilities**:
  - Service lifecycle management
  - Dependency injection
  - Service access control
- **Key Methods**:
  - `getInstance()`: Get singleton instance
  - `startScheduler()`: Start background services
  - Various getters for services

#### `ErrorHandler.ts`
- **Purpose**: Centralized error handling and logging
- **Responsibilities**:
  - Error logging
  - User-friendly error messages
  - Error recovery strategies
- **Key Methods**:
  - `handleError()`: Process and log errors
  - `createUserFriendlyMessage()`: Generate user messages

### `src/handlers/` - Command Logic Implementation

#### Structure by Category:
```
src/handlers/
├── payment/           # Payment-related commands
├── requests/          # Payment request commands
├── transactions/      # Transaction history commands
├── setup/            # Bot setup commands
├── config/           # Configuration commands
└── index.ts          # Exports all handlers
```

#### Handler Pattern:
Every handler extends `CommandHandler` and implements:

```typescript
export abstract class CommandHandler {
    protected abstract async handleCommand(interaction: CommandInteraction): Promise<void>;
    protected async handleError(interaction: CommandInteraction, error: any): Promise<void>;
    protected async validatePermissions(interaction: CommandInteraction): Promise<boolean>;
}
```

### `src/services/` - Business Logic Services

#### Core Services:
- **`PaymentService`**: Payment processing logic
- **`UserAccountService`**: User account management
- **`ServerConfigService`**: Server configuration
- **`EscrowManager`**: Escrow transaction handling
- **`NotificationService`**: User notifications

#### Service Pattern:
Services handle business logic and are injected into handlers via the ServiceContainer.

### `src/models/` - Data Models

#### Database Models:
- **`UserAccount`**: User account information
- **`Transaction`**: Transaction records
- **`PaymentRequest`**: Payment request data
- **`ServerConfig`**: Server configuration
- **`EscrowRecord`**: Escrow transaction data

## ⚡ Advanced Command Features

### 1. **Cooldowns**
```typescript
// In CommandRegistry.ts
this.registerCommand(CommandFactory.createUtilityCommand(
    'spam',
    '🐷 A command with cooldown',
    [],
    {
        cooldown: 60, // 60 second cooldown
        isEphemeral: true
    }
));
```

### 2. **Permissions**
```typescript
// In CommandRegistry.ts
this.registerCommand(CommandFactory.createAdminCommand(
    'ban',
    '🐷 Ban a user (Admin only)',
    [
        {
            name: 'user',
            description: 'User to ban',
            required: true,
            type: 'user'
        }
    ],
    {
        permissions: ['BanMembers'],
        guildOnly: true
    }
));
```

### 3. **Subcommands**
```typescript
// In CommandRegistry.ts
this.registerCommand(CommandFactory.createCommand({
    name: 'config',
    description: '🐷 Configure bot settings',
    category: CommandCategory.CONFIG,
    subcommands: [
        {
            name: 'payment',
            description: 'Configure payment settings',
            options: [
                {
                    name: 'currency',
                    description: 'Default currency',
                    required: true,
                    type: 'string',
                    choices: [
                        { name: 'USD', value: 'USD' },
                        { name: 'EUR', value: 'EUR' }
                    ]
                }
            ]
        }
    ]
}));
```

### 4. **Ephemeral Responses**
```typescript
// In your handler
await interaction.reply({
    content: '🐷 This is a private response!',
    ephemeral: true
});
```

## 🧪 Testing Your Commands

### Unit Testing
```typescript
// src/handlers/__tests__/MyCommandHandler.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MyCommandHandler } from '../MyCommandHandler';
import { createMockInteraction } from '@test/utils/MockDiscordServer';

describe('MyCommandHandler', () => {
    let handler: MyCommandHandler;
    let mockInteraction: any;

    beforeEach(() => {
        handler = new MyCommandHandler();
        mockInteraction = createMockInteraction('mycommand');
    });

    it('should handle command successfully', async () => {
        await handler.handleCommand(mockInteraction);
        expect(mockInteraction.reply).toHaveBeenCalledWith('🐷 Oink! Your command worked!');
    });
});
```

### Integration Testing
```typescript
// src/__tests__/integration/MyCommand.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DiscordBot } from '@bot/DiscordBot';
import { TestCleanupUtility } from '@test/utils/TestCleanupUtility';

describe('MyCommand Integration', () => {
    let bot: DiscordBot;

    beforeAll(async () => {
        bot = new DiscordBot();
        await bot.start();
    });

    afterAll(async () => {
        await bot.stop();
        await TestCleanupUtility.cleanup();
    });

    it('should register command with Discord', async () => {
        const commands = await bot.getCommandStats();
        expect(commands.total).toBeGreaterThan(0);
        expect(commands.byCategory.utility).toBeGreaterThan(0);
    });
});
```

## 🎯 Best Practices & Patterns

### 1. **Command Naming**
- Use descriptive names: `pay`, `request-payment`, `view-transactions`
- Avoid abbreviations: `pay` not `p`, `help` not `h`
- Use kebab-case for multi-word commands

### 2. **Error Handling**
```typescript
try {
    // Your command logic
    await interaction.reply('Success!');
} catch (error) {
    await this.handleError(interaction, error);
}
```

### 3. **Input Validation**
```typescript
// Validate user input
const amount = interaction.options.getNumber('amount');
if (amount <= 0) {
    await interaction.reply({
        content: '❌ Amount must be greater than 0',
        ephemeral: true
    });
    return;
}
```

### 4. **Permission Checking**
```typescript
// Check if user has required permissions
if (!interaction.memberPermissions?.has('ManageGuild')) {
    await interaction.reply({
        content: '❌ You need Manage Server permission for this command',
        ephemeral: true
    });
    return;
}
```

### 5. **Response Patterns**
```typescript
// Immediate response
await interaction.reply('🐷 Processing...');

// Deferred response for long operations
await interaction.deferReply();

// Edit response
await interaction.editReply('🐷 Operation completed!');
```

## 🔧 Troubleshooting

### Common Issues

#### 1. **Command Not Appearing**
- Check if command is registered in `CommandRegistry`
- Verify command is added to `InteractionRouter`
- Ensure bot has proper permissions

#### 2. **Permission Errors**
- Check bot permissions in Discord server
- Verify user permissions in command handler
- Check `guildOnly` and permission flags

#### 3. **Cooldown Issues**
- Verify cooldown is set in command definition
- Check if `EnhancedCommandManager` is active
- Look for cooldown validation in handler

#### 4. **Service Injection Errors**
- Ensure service is added to `ServiceContainer`
- Check service constructor parameters
- Verify service lifecycle management

### Debug Commands

Add these to your bot for debugging:

```typescript
// Debug command to see all registered commands
this.registerCommand(CommandFactory.createUtilityCommand(
    'debug-commands',
    '🐷 Show all registered commands (Debug)',
    [],
    {
        aliases: ['debug'],
        isEphemeral: true
    }
));

// Debug command to see bot stats
this.registerCommand(CommandFactory.createUtilityCommand(
    'bot-stats',
    '🐷 Show bot statistics (Debug)',
    [],
    {
        aliases: ['stats'],
        isEphemeral: true
    }
));
```

## 🎉 Conclusion

The Oink Bot architecture is designed to be:
- **Extensible**: Easy to add new commands and features
- **Maintainable**: Clean separation of concerns
- **Testable**: Each component can be tested independently
- **Scalable**: New features don't break existing ones

Remember: When in doubt, follow the existing patterns in the codebase. The architecture is consistent and well-documented!

Happy coding! 🐷✨

---

*Need help? Check the main README.md or create an issue in the repository!*
