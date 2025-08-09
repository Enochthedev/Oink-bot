# Data Models and Database Schema

This directory contains the core data models, database schema, and validation functions for the Discord Payment Bot.

## Overview

The bot uses Prisma as the ORM with SQLite as the database. The models are designed to handle:
- User account management with multiple payment methods
- Transaction processing with escrow functionality
- Server-specific configuration and permissions
- Secure storage of payment information

## Database Schema

### Tables

#### `user_accounts`
Stores Discord user information and notification preferences.
- `id`: Primary key (CUID)
- `discordId`: Unique Discord user ID
- `transactionHistoryJson`: JSON array of transaction IDs
- `enableDMNotifications`: Boolean for DM notification preference
- `enableChannelNotifications`: Boolean for channel notification preference
- `createdAt`, `updatedAt`: Timestamps

#### `payment_method_configs`
Stores user payment method configurations.
- `id`: Primary key (CUID)
- `userId`: Foreign key to user_accounts
- `type`: Payment method type (CRYPTO, ACH, OTHER)
- `displayName`: User-friendly name for the payment method
- `encryptedDetails`: Tokenized/encrypted payment details
- `isActive`: Boolean indicating if method is active
- `addedAt`: Timestamp when method was added

#### `transactions`
Stores all payment transactions.
- `id`: Primary key (CUID)
- `senderId`, `recipientId`: Foreign keys to user_accounts
- `amount`: Transaction amount
- `currency`: Currency code (e.g., USD, BTC)
- `senderPaymentMethodId`, `recipientPaymentMethodId`: Foreign keys to payment methods
- `status`: Transaction status (PENDING, ESCROWED, COMPLETED, FAILED, CANCELLED)
- `processingFee`, `escrowFee`, `totalFees`: Fee breakdown
- `createdAt`, `completedAt`: Timestamps
- `failureReason`: Optional failure description

#### `server_configs`
Stores Discord server-specific payment configurations.
- `id`: Primary key (CUID)
- `serverId`: Unique Discord server ID
- `paymentsEnabled`: Boolean for server payment status
- `maxAmountPerUser`, `maxTransactionsPerUser`: Daily limits
- `allowedPaymentMethodsJson`: JSON array of allowed payment types
- `adminUserIdsJson`: JSON array of admin Discord user IDs
- `createdAt`, `updatedAt`: Timestamps

#### `escrow_records`
Stores escrow information for transactions.
- `id`: Primary key (CUID)
- `transactionId`: Foreign key to transactions (unique)
- `amount`: Escrowed amount
- `currency`: Currency code
- `paymentMethod`: Payment method type used
- `externalTransactionId`: External payment processor transaction ID
- `status`: Escrow status (HOLDING, RELEASED, RETURNED)
- `createdAt`, `releaseAt`: Timestamps

## Model Files

### Core Models
- `UserAccount.ts`: User account interfaces and validation
- `Transaction.ts`: Transaction interfaces and validation
- `ServerConfig.ts`: Server configuration interfaces and validation
- `EscrowRecord.ts`: Escrow record interfaces and validation

### Utilities
- `database.ts`: Prisma client setup and database utilities
- `index.ts`: Exports all models and utilities

### Tests
- `models.test.ts`: Unit tests for validation functions and model conversions
- `database.test.ts`: Integration tests for database operations

## Key Features

### Type Safety
- TypeScript interfaces for all models
- Validation functions with type guards
- Conversion functions between database and domain models

### JSON Array Handling
SQLite doesn't support native arrays, so we use JSON strings:
- `transactionHistoryJson` stores transaction IDs as JSON array
- `allowedPaymentMethodsJson` stores payment method types as JSON array
- `adminUserIdsJson` stores admin user IDs as JSON array

Helper functions handle parsing and stringifying these arrays safely.

### Validation Functions
Each model includes comprehensive validation:
- `isValidDiscordId()`: Validates Discord user/server IDs
- `isValidPaymentMethodType()`: Validates payment method types
- `isValidAmount()`: Validates transaction amounts
- `isValidCurrency()`: Validates currency codes
- Model-specific validation functions for complete objects

### Database Utilities
- Singleton Prisma client with development/production configurations
- Connection management functions
- Health check functionality
- Transaction wrapper for atomic operations
- Graceful shutdown cleanup

## Usage Examples

### Creating a User Account
```typescript
import { getPrismaClient, userAccountToDb } from './models';

const prisma = getPrismaClient();
const userData = userAccountToDb({
  discordId: '123456789012345678',
  transactionHistory: [],
  notificationPreferences: {
    enableDMNotifications: true,
    enableChannelNotifications: false,
  },
});

const user = await prisma.userAccount.create({ data: userData });
```

### Querying with Relationships
```typescript
const transaction = await prisma.transaction.findUnique({
  where: { id: 'transaction_id' },
  include: {
    sender: true,
    recipient: true,
    senderPaymentMethod: true,
    recipientPaymentMethod: true,
    escrowRecord: true,
  },
});

// Convert to domain model
const domainTransaction = dbToTransaction(
  transaction,
  transaction.senderPaymentMethod,
  transaction.recipientPaymentMethod,
  transaction.escrowRecord ? dbToEscrowRecord(transaction.escrowRecord) : undefined
);
```

### Using Transactions
```typescript
import { withTransaction } from './models';

const result = await withTransaction(async (prisma) => {
  const user = await prisma.userAccount.create({ data: userData });
  const paymentMethod = await prisma.paymentMethodConfig.create({
    data: { ...paymentMethodData, userId: user.id },
  });
  return { user, paymentMethod };
});
```

## Database Commands

### Development
```bash
# Generate Prisma client
npx prisma generate

# Create and apply migration
npx prisma migrate dev --name migration_name

# Seed database with test data
npm run db:seed

# Reset database and reseed
npm run db:reset

# Open Prisma Studio
npm run db:studio
```

### Testing
```bash
# Run model validation tests
npm test -- src/models/models.test.ts

# Run database integration tests
npm test -- src/models/database.test.ts

# Run all model tests
npm test -- src/models/
```

## Security Considerations

1. **Encrypted Payment Details**: All sensitive payment information is stored encrypted
2. **Input Validation**: All inputs are validated before database operations
3. **Foreign Key Constraints**: Database enforces referential integrity
4. **Unique Constraints**: Prevents duplicate Discord IDs and other unique fields
5. **Type Safety**: TypeScript prevents many runtime errors

## Migration Strategy

When updating the schema:
1. Update the Prisma schema file
2. Create a new migration: `npx prisma migrate dev --name descriptive_name`
3. Update TypeScript interfaces to match
4. Update validation functions if needed
5. Update conversion functions between DB and domain models
6. Add tests for new functionality
7. Update seed script if needed

## Performance Considerations

1. **Indexes**: Unique indexes on `discordId` and `serverId` for fast lookups
2. **Foreign Keys**: Proper relationships for efficient joins
3. **Connection Pooling**: Prisma handles connection pooling automatically
4. **Query Optimization**: Use `include` for related data in single queries
5. **Pagination**: Implement pagination for large result sets