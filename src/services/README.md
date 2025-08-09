# Services Architecture

This directory contains the service layer of the MInt-bot application, following clean architecture principles and best practices.

## Architecture Overview

The services are organized into focused, single-responsibility modules that follow these principles:

- **Single Responsibility**: Each service handles one specific domain concern
- **Dependency Injection**: Services accept dependencies through constructor injection
- **Interface Segregation**: Clean interfaces that expose only necessary methods
- **Clean Delegation**: Main services orchestrate operations by delegating to focused services

## Service Structure

### Core Services

- **PaymentService**: Main orchestrator for payment operations
- **UserAccountService**: User account management and operations
- **EscrowManager**: Escrow fund management and operations
- **NotificationService**: User notification handling
- **ServerConfigService**: Server configuration management

### Payment Services (`/payment`)

- **CorePaymentService**: Core payment initiation and processing
- **PaymentValidationService**: Payment parameter validation
- **TransactionManagementService**: Transaction lifecycle management
- **PaymentHistoryService**: Transaction history and user activity
- **PaymentMethodService**: Payment method selection and validation
- **PaymentFeeService**: Fee calculations and payment processor interactions

### User Services (`/user`)

- **PaymentMethodManagementService**: Payment method CRUD operations

## Best Practices

### 1. Line Length
- Keep lines under 80 characters for readability
- Break long method chains and parameter lists
- Use proper indentation and formatting

### 2. Method Organization
- Group related methods together with clear comments
- Use consistent naming conventions
- Keep methods focused and under 50 lines when possible

### 3. Error Handling
- Use descriptive error messages
- Implement proper validation at service boundaries
- Log errors appropriately for debugging

### 4. Dependency Management
- Inject dependencies through constructors
- Provide sensible defaults for optional dependencies
- Avoid circular dependencies

### 5. Data Conversion
- Handle database-to-domain model conversions in dedicated methods
- Use consistent naming for conversion methods
- Handle null/undefined values appropriately

## Usage Example

```typescript
// Main service usage
const paymentService = new PaymentServiceImpl();

// The main service orchestrates operations by delegating to focused services
const transaction = await paymentService.initiatePayment(
  senderId,
  recipientId,
  amount,
  paymentMethodId
);
```

## Adding New Services

When adding new services:

1. Create the service in the appropriate subdirectory
2. Define a clear interface
3. Implement the service with focused responsibilities
4. Export from the appropriate index file
5. Update this README with documentation

## Testing

Each service should have corresponding test files:
- Unit tests for individual service methods
- Integration tests for service interactions
- Mock dependencies for isolated testing

## Migration Notes

The original monolithic services have been refactored into focused services:
- **PaymentService**: Now orchestrates payment operations using focused services
- **UserAccountService**: Core user account operations remain, payment method operations moved to dedicated service
- All services maintain backward compatibility through the main service interfaces
