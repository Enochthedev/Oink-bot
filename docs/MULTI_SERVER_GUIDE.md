# Multi-Server Support Guide

## How Multi-Server Support Works

Your Oink Bot is designed to work across multiple Discord servers simultaneously. Here's how it handles different servers:

### Automatic Server Detection

The bot automatically detects which server a user is interacting from using Discord's built-in `interaction.guildId`:

```typescript
// Example from the codebase
serverId: interaction.guildId || undefined
```

### Per-Server Configuration

Each server can have its own configuration stored in the `ServerConfig` table:

```sql
-- Example server configurations
INSERT INTO server_configs (server_id, payments_enabled, max_amount_per_user) VALUES
('555666777888999000', true, 1000),   -- Server 1: Full payments enabled
('111222333444555777', true, 500),    -- Server 2: Limited payments
('999888777666555444', false, 100);   -- Server 3: Payments disabled
```

### Key Features

1. **Independent Settings**: Each server has its own:
   - Payment limits (`maxAmountPerUser`)
   - Transaction limits (`maxTransactionsPerUser`) 
   - Allowed payment methods (`allowedPaymentMethodsJson`)
   - Admin users (`adminUserIdsJson`)
   - Enable/disable payments (`paymentsEnabled`)

2. **Cross-Server Users**: Users maintain the same account across all servers but transactions are tracked per-server

3. **Server-Specific Commands**: Payment requests can include `serverId` to track which server they originated from

### No GUILD_ID Environment Variable Needed

❌ **Don't use**: `DISCORD_GUILD_ID` environment variable
✅ **Instead**: The bot gets server IDs automatically from Discord interactions

### Adding the Bot to New Servers

1. Generate an invite link with proper permissions
2. The bot will automatically work in the new server
3. Server admins can configure server-specific settings
4. No code changes or restarts needed

### Example Multi-Server Scenarios

**Scenario 1: Gaming Community**
- Server A: Gaming guild (high limits, crypto payments)
- Server B: Casual chat (low limits, ACH only)
- Server C: Trading server (payments disabled)

**Scenario 2: Business Network**
- Server A: Main company (full features)
- Server B: Partner companies (limited features)
- Server C: Public community (view-only)

### Database Schema

The bot uses these key fields for multi-server support:

```typescript
// Payment requests track which server they came from
model PaymentRequest {
  serverId      String?  // Discord server ID
  // ... other fields
}

// Server-specific configuration
model ServerConfig {
  serverId              String   @unique  // Discord server ID
  paymentsEnabled       Boolean  @default(true)
  maxAmountPerUser      Float    @default(1000)
  // ... other server settings
}
```

This design allows the bot to scale to hundreds of servers while maintaining isolated configurations and proper security boundaries.