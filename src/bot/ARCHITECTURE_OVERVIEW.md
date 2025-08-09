# 🏗️ Oink Bot Architecture Overview

This document provides a high-level overview of how the Oink Bot architecture works, explaining the relationships between components and the overall system design.

## 🎯 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DISCORD API                              │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DiscordBot.ts                                │
│              (Main Entry Point & Coordinator)                   │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                InteractionRouter.ts                             │
│              (Traffic Controller)                               │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              Command Handlers                                   │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐     │
│  │   Payment  │   Request   │ Transaction│    Setup    │     │
│  │   Handler  │   Handler   │   Handler  │   Handler   │     │
│  └─────────────┴─────────────┴─────────────┴─────────────┘     │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              ServiceContainer.ts                                │
│              (Dependency Injection)                             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              Business Services                                  │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐     │
│  │  Payment   │    User     │   Server    │ Escrow      │     │
│  │  Service   │   Account   │    Config   │  Manager    │     │
│  └─────────────┴─────────────┴─────────────┴─────────────┘     │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              Data Models                                        │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐     │
│  │   User     │ Transaction │  Payment   │   Server    │     │
│  │  Account   │             │  Request   │    Config   │     │
│  └─────────────┴─────────────┴─────────────┴─────────────┘     │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE                                     │
│              (SQLite via Prisma)                               │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow & Lifecycle

### 1. **Bot Startup**
```
DiscordBot.start() → ServiceContainer.init() → CommandRegistry.init() → Discord API Registration
```

### 2. **Command Execution**
```
User Input → Discord → DiscordBot → InteractionRouter → CommandHandler → Service → Database → Response
```

### 3. **Event Handling**
```
Discord Event → DiscordBot → InteractionRouter → Appropriate Handler → Service → Response
```

## 🧩 Component Responsibilities

### **Core Bot Layer** (`src/bot/`)

#### `DiscordBot.ts` - The Conductor
- **Role**: Main orchestrator and entry point
- **Responsibilities**:
  - Initialize all components
  - Handle Discord client lifecycle
  - Coordinate startup/shutdown
  - Manage global bot state
- **Key Methods**:
  - `start()`: Initialize and start the bot
  - `stop()`: Gracefully shutdown
  - `registerSlashCommands()`: Register with Discord API

#### `InteractionRouter.ts` - The Traffic Controller
- **Role**: Routes all Discord interactions to appropriate handlers
- **Responsibilities**:
  - Determine interaction type (command, button, select, modal)
  - Route to correct handler based on interaction ID
  - Handle unknown interactions gracefully
- **Routing Logic**:
  ```typescript
  // Command routing
  case 'pay': → PaymentCommandHandler
  case 'request': → RequestCommandHandler
  case 'setup': → SetupCommandHandler
  
  // Button routing
  case 'confirm_payment': → PaymentConfirmationHandler
  case 'cancel_payment': → PaymentCancellationHandler
  ```

#### `ServiceContainer.ts` - The Dependency Manager
- **Role**: Central dependency injection container
- **Responsibilities**:
  - Manage service lifecycle
  - Provide access to all services
  - Handle service initialization order
  - Manage shared resources
- **Services Managed**:
  - Payment handlers
  - Request handlers
  - Transaction handlers
  - Setup flow orchestrators
  - Error handlers

### **Command Management Layer**

#### `CommandRegistry.ts` - The Command Library
- **Role**: Central repository for all command definitions
- **Responsibilities**:
  - Store command metadata
  - Manage command aliases
  - Provide command lookup
  - Generate Discord.js command data
- **Command Types**:
  - Payment commands (pay, request, tip)
  - Utility commands (help, ping, info)
  - Admin commands (server-stats, ban)
  - Setup commands (setup, configure)

#### `CommandFactory.ts` - The Command Builder
- **Role**: Factory for creating standardized commands
- **Responsibilities**:
  - Create different command types
  - Apply consistent metadata
  - Handle option configuration
  - Validate command structure
- **Factory Methods**:
  - `createPaymentCommand()`: Payment-related commands
  - `createUtilityCommand()`: Simple utility commands
  - `createAdminCommand()`: Admin-only commands

#### `CommandManager.ts` - The Command Executor
- **Role**: Manages command execution lifecycle
- **Responsibilities**:
  - Command validation
  - Execution coordination
  - Command statistics
  - Performance monitoring

#### `EnhancedCommandManager.ts` - The Advanced System
- **Role**: Provides advanced command features
- **Responsibilities**:
  - Cooldown management
  - Help system generation
  - Command usage analytics
  - Advanced metadata handling

### **Handler Layer** (`src/handlers/`)

#### Handler Categories
```
src/handlers/
├── payment/           # Money transfer commands
├── requests/          # Payment request handling
├── transactions/      # Transaction history & management
├── setup/            # Bot configuration & setup
├── config/           # Server configuration
└── index.ts          # Handler exports
```

#### Handler Pattern
Every handler follows this structure:
```typescript
export abstract class CommandHandler {
    // Must implement this method
    protected abstract async handleCommand(interaction: CommandInteraction): Promise<void>;
    
    // Error handling (can override)
    protected async handleError(interaction: CommandInteraction, error: any): Promise<void>;
    
    // Permission validation (can override)
    protected async validatePermissions(interaction: CommandInteraction): Promise<boolean>;
}
```

### **Service Layer** (`src/services/`)

#### Core Services
- **`PaymentService`**: Handles payment processing logic
- **`UserAccountService`**: Manages user accounts and balances
- **`ServerConfigService`**: Handles server-specific configuration
- **`EscrowManager`**: Manages escrow transactions
- **`NotificationService`**: Handles user notifications

#### Service Pattern
Services are stateless and handle business logic:
```typescript
export class PaymentService {
    async processPayment(from: string, to: string, amount: number): Promise<PaymentResult> {
        // Business logic here
    }
}
```

### **Model Layer** (`src/models/`)

#### Data Models
- **`UserAccount`**: User account information and balances
- **`Transaction`**: Transaction records and history
- **`PaymentRequest`**: Payment request data
- **`ServerConfig`**: Server configuration settings
- **`EscrowRecord`**: Escrow transaction data

#### Database Access
All models use Prisma ORM for database operations:
```typescript
export class UserAccount {
    static async findByDiscordId(discordId: string): Promise<UserAccount | null> {
        return await prisma.userAccount.findUnique({
            where: { discordId }
        });
    }
}
```

## 🔧 Configuration & Environment

### Environment Variables
```typescript
// src/config/environment.ts
export const config = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN!,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID!,
    DATABASE_URL: process.env.DATABASE_URL!,
    // ... other config
};
```

### Database Configuration
```typescript
// prisma/schema.prisma
datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
}

generator client {
    provider = "prisma-client-js"
}
```

## 🚀 Extension Points

### Adding New Commands
1. Create handler in appropriate category
2. Register command in `CommandRegistry`
3. Add to `ServiceContainer`
4. Route in `InteractionRouter`

### Adding New Services
1. Create service class
2. Add to `ServiceContainer`
3. Inject into handlers as needed

### Adding New Interaction Types
1. Update `InteractionRouter` routing logic
2. Create appropriate handler
3. Register in service container

## 🧪 Testing Strategy

### Testing Layers
```
┌─────────────────────────────────────────────────────────────────┐
│                    E2E Tests                                   │
│              (Full bot integration)                            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                Integration Tests                                │
│              (Component interaction)                            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                Unit Tests                                       │
│              (Individual components)                            │
└─────────────────────────────────────────────────────────────────┘
```

### Test Utilities
- **`MockDiscordServer.ts`**: Discord interaction mocking
- **`TestDataFactory.ts`**: Test data generation
- **`TestCleanupUtility.ts`**: Test cleanup and isolation

## 🔒 Security & Error Handling

### Security Features
- **Input Validation**: All user input is validated
- **Permission Checking**: Commands check user permissions
- **Rate Limiting**: Prevents abuse
- **Audit Logging**: Tracks all actions

### Error Handling
- **Centralized**: All errors go through `ErrorHandler`
- **User-Friendly**: Errors are translated to user-friendly messages
- **Logging**: All errors are logged for debugging
- **Recovery**: Graceful error recovery where possible

## 📊 Performance & Scalability

### Performance Features
- **Connection Pooling**: Efficient database connections
- **Caching**: Command metadata caching
- **Async Operations**: Non-blocking I/O operations
- **Resource Management**: Efficient resource usage

### Scalability Considerations
- **Stateless Services**: Easy horizontal scaling
- **Modular Architecture**: Components can be scaled independently
- **Database Optimization**: Efficient queries and indexing
- **Memory Management**: Proper cleanup and resource management

## 🔄 Deployment & Operations

### Deployment Process
1. Build TypeScript to JavaScript
2. Run database migrations
3. Start bot with environment variables
4. Monitor logs and performance

### Monitoring
- **Logging**: Comprehensive logging system
- **Metrics**: Command usage and performance metrics
- **Health Checks**: Bot health monitoring
- **Error Tracking**: Error aggregation and reporting

## 🎉 Benefits of This Architecture

### **Maintainability**
- Clear separation of concerns
- Consistent patterns throughout
- Easy to understand and modify

### **Extensibility**
- Simple to add new commands
- Easy to add new services
- Flexible interaction handling

### **Testability**
- Components can be tested independently
- Mocking is straightforward
- Clear testing boundaries

### **Scalability**
- Components can be scaled independently
- Efficient resource usage
- Good performance characteristics

### **Reliability**
- Comprehensive error handling
- Graceful degradation
- Robust error recovery

---

*This architecture provides a solid foundation for building and extending the Oink Bot while maintaining code quality and developer productivity.* 🐷✨
