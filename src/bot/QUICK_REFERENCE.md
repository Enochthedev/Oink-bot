# 🐷 Oink Bot Quick Reference

Quick reference guide for common development tasks and patterns.

## 🚀 Adding a New Command (4 Steps)

### 1. Create Handler
```typescript
// src/handlers/MyCommandHandler.ts
import { CommandInteraction } from 'discord.js';
import { CommandHandler } from './CommandHandler';

export class MyCommandHandler extends CommandHandler {
    public async handleCommand(interaction: CommandInteraction): Promise<void> {
        try {
            // Your logic here
            await interaction.reply('🐷 Oink!');
        } catch (error) {
            await this.handleError(interaction, error);
        }
    }
}
```

### 2. Register Command
```typescript
// src/bot/CommandRegistry.ts - in initializeCommands()
this.registerCommand(CommandFactory.createUtilityCommand(
    'mycommand',
    '🐷 Description',
    [
        {
            name: 'input',
            description: 'Input description',
            required: true,
            type: 'string'
        }
    ]
));
```

### 3. Add to Service Container
```typescript
// src/bot/ServiceContainer.ts
private myCommandHandler: MyCommandHandler;

constructor() {
    this.myCommandHandler = new MyCommandHandler();
}

public get myHandler(): MyCommandHandler {
    return this.myCommandHandler;
}
```

### 4. Route Interactions
```typescript
// src/bot/InteractionRouter.ts - in handleCommand()
case 'mycommand':
    await this.serviceContainer.myHandler.handleCommand(interaction);
    break;
```

## 📝 Command Types & Factory Methods

### Utility Command
```typescript
CommandFactory.createUtilityCommand(
    'name',
    'description',
    options?,           // CommandOption[]
    metadata?           // Partial<CommandDefinition>
)
```

### Payment Command
```typescript
CommandFactory.createPaymentCommand(
    'name',
    'description',
    options?,           // CommandOption[]
    metadata?           // Partial<CommandDefinition>
)
```

### Admin Command
```typescript
CommandFactory.createAdminCommand(
    'name',
    'description',
    options?,           // CommandOption[]
    metadata?           // Partial<CommandDefinition>
)
```

### Custom Command
```typescript
CommandFactory.createCommand({
    name: 'name',
    description: 'description',
    category: CommandCategory.UTILITY,
    options: [...],
    subcommands: [...],
    permissions: ['ManageGuild'],
    cooldown: 30,
    guildOnly: true
})
```

## 🔧 Command Options

### Option Types
```typescript
interface CommandOption {
    name: string;
    description: string;
    required: boolean;
    type: 'string' | 'number' | 'integer' | 'boolean' | 'user' | 'channel' | 'role';
    minValue?: number;
    maxValue?: number;
    choices?: { name: string; value: string | number }[];
}
```

### Common Option Patterns
```typescript
// String with choices
{
    name: 'currency',
    description: 'Currency to use',
    required: true,
    type: 'string',
    choices: [
        { name: 'USD', value: 'USD' },
        { name: 'EUR', value: 'EUR' }
    ]
}

// Number with validation
{
    name: 'amount',
    description: 'Amount to transfer',
    required: true,
    type: 'number',
    minValue: 0.01,
    maxValue: 10000
}

// User mention
{
    name: 'recipient',
    description: 'User to send to',
    required: true,
    type: 'user'
}
```

## 🎨 Command Metadata

### Available Metadata
```typescript
interface CommandDefinition {
    name: string;
    description: string;
    builder: SlashCommandBuilder;
    category: CommandCategory;
    permissions?: string[];
    cooldown?: number;
    guildOnly?: boolean;
    aliases?: string[];
    examples?: string[];
    usage?: string;
    longDescription?: string;
    requiresSetup?: boolean;
    isEphemeral?: boolean;
    maxUses?: number;
    minLevel?: number;
}
```

### Category Enum
```typescript
enum CommandCategory {
    PAYMENT = 'payment',
    REQUESTS = 'requests',
    TRANSACTIONS = 'transactions',
    SETUP = 'setup',
    CONFIG = 'config',
    UTILITY = 'utility',
    ADMIN = 'admin',
    HELP = 'help'
}
```

## 🔄 Interaction Handling

### Command Interaction
```typescript
public async handleCommand(interaction: CommandInteraction): Promise<void> {
    // Get options
    const user = interaction.options.getUser('recipient');
    const amount = interaction.options.getNumber('amount');
    const description = interaction.options.getString('description');
    
    // Handle command
    await interaction.reply('Processing...');
}
```

### Button Interaction
```typescript
// In InteractionRouter.ts
case 'confirm_payment':
    await this.serviceContainer.paymentHandler.handleConfirmButton(interaction);
    break;
```

### Select Menu Interaction
```typescript
// In InteractionRouter.ts
case 'payment_method':
    await this.serviceContainer.paymentHandler.handleMethodSelection(interaction);
    break;
```

### Modal Submission
```typescript
// In InteractionRouter.ts
case 'payment_form':
    await this.serviceContainer.paymentHandler.handlePaymentForm(interaction);
    break;
```

## 🧪 Testing Patterns

### Unit Test Template
```typescript
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
        expect(mockInteraction.reply).toHaveBeenCalledWith('🐷 Oink!');
    });
});
```

### Integration Test Template
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DiscordBot } from '@bot/DiscordBot';

describe('MyCommand Integration', () => {
    let bot: DiscordBot;

    beforeAll(async () => {
        bot = new DiscordBot();
        await bot.start();
    });

    afterAll(async () => {
        await bot.stop();
    });

    it('should register command with Discord', async () => {
        const commands = await bot.getCommandStats();
        expect(commands.total).toBeGreaterThan(0);
    });
});
```

## 🔒 Security & Validation

### Permission Checking
```typescript
// Check bot permissions
if (!interaction.guild?.members.me?.permissions.has('SendMessages')) {
    await interaction.reply({ content: '❌ Bot needs Send Messages permission', ephemeral: true });
    return;
}

// Check user permissions
if (!interaction.memberPermissions?.has('ManageGuild')) {
    await interaction.reply({ content: '❌ You need Manage Server permission', ephemeral: true });
    return;
}
```

### Input Validation
```typescript
// Validate amount
const amount = interaction.options.getNumber('amount');
if (!amount || amount <= 0) {
    await interaction.reply({ content: '❌ Amount must be greater than 0', ephemeral: true });
    return;
}

// Validate user
const user = interaction.options.getUser('recipient');
if (user.id === interaction.user.id) {
    await interaction.reply({ content: '❌ Cannot send to yourself', ephemeral: true });
    return;
}
```

## 📊 Response Patterns

### Immediate Response
```typescript
await interaction.reply('🐷 Processing your request...');
```

### Deferred Response
```typescript
await interaction.deferReply();
// ... do work ...
await interaction.editReply('🐷 Request completed!');
```

### Ephemeral Response
```typescript
await interaction.reply({
    content: '🐷 This is private!',
    ephemeral: true
});
```

### Error Response
```typescript
try {
    // ... command logic ...
} catch (error) {
    await this.handleError(interaction, error);
}
```

## 🗂️ File Organization

### Handler Location
```
src/handlers/
├── payment/           # Payment commands
│   ├── PaymentCommandHandler.ts
│   └── index.ts
├── requests/          # Request commands
│   ├── RequestCommandHandler.ts
│   └── index.ts
├── transactions/      # Transaction commands
│   ├── TransactionCommandHandler.ts
│   └── index.ts
├── setup/            # Setup commands
│   ├── SetupCommandHandler.ts
│   └── index.ts
└── index.ts          # Export all handlers
```

### Service Location
```
src/services/
├── PaymentService.ts
├── UserAccountService.ts
├── ServerConfigService.ts
├── EscrowManager.ts
├── NotificationService.ts
└── index.ts
```

### Model Location
```
src/models/
├── UserAccount.ts
├── Transaction.ts
├── PaymentRequest.ts
├── ServerConfig.ts
├── EscrowRecord.ts
└── index.ts
```

## 🔍 Common Debugging

### Check Registered Commands
```typescript
// Add debug command
this.registerCommand(CommandFactory.createUtilityCommand(
    'debug-commands',
    '🐷 Show all commands (Debug)',
    [],
    { isEphemeral: true }
));

// In handler
const commands = this.serviceContainer.commandRegistry.getAllCommands();
const commandList = commands.map(cmd => `/${cmd.name}: ${cmd.description}`).join('\n');
await interaction.reply({ content: `**Registered Commands:**\n${commandList}`, ephemeral: true });
```

### Check Bot Permissions
```typescript
// Add debug command
this.registerCommand(CommandFactory.createUtilityCommand(
    'debug-permissions',
    '🐷 Check bot permissions (Debug)',
    [],
    { isEphemeral: true }
));

// In handler
const permissions = interaction.guild?.members.me?.permissions;
const permissionList = permissions?.toArray().join(', ') || 'None';
await interaction.reply({ content: `**Bot Permissions:**\n${permissionList}`, ephemeral: true });
```

### Check Service Status
```typescript
// Add debug command
this.registerCommand(CommandFactory.createUtilityCommand(
    'debug-services',
    '🐷 Check service status (Debug)',
    [],
    { isEphemeral: true }
));

// In handler
const services = {
    payment: !!this.serviceContainer.paymentHandler,
    userAccount: !!this.serviceContainer.userAccountService,
    serverConfig: !!this.serviceContainer.serverConfigService
};
await interaction.reply({ content: `**Service Status:**\n${JSON.stringify(services, null, 2)}`, ephemeral: true });
```

## 🚨 Common Errors & Fixes

### Command Not Appearing
- ✅ Check command is registered in `CommandRegistry`
- ✅ Check command is routed in `InteractionRouter`
- ✅ Check bot has proper permissions
- ✅ Restart bot to re-register commands

### Permission Denied
- ✅ Check bot permissions in Discord server
- ✅ Check user permissions in command handler
- ✅ Verify `guildOnly` and permission flags

### Service Not Found
- ✅ Check service is added to `ServiceContainer`
- ✅ Check service constructor parameters
- ✅ Verify service lifecycle management

### Database Errors
- ✅ Check database connection string
- ✅ Run `npx prisma generate` after schema changes
- ✅ Run `npx prisma migrate dev` for new migrations

## 📚 Useful Commands

### Development
```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Reset database
npx prisma migrate reset

# Open database
npx prisma studio

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- MyCommandHandler.test.ts
```

### Bot Management
```typescript
// Toggle enhanced commands
bot.toggleEnhancedCommands(false);

// Get command statistics
const stats = await bot.getCommandStats();

// Reload commands
await bot.reloadCommands();

// Stop bot
await bot.stop();
```

---

*Keep this reference handy for quick development tasks!* 🐷✨
