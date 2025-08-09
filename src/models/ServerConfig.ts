// Server configuration model
import { PaymentMethodType, isValidPaymentMethodType, isValidDiscordId } from './UserAccount';

export interface ServerConfig {
  id: string;
  serverId: string;
  paymentsEnabled: boolean;
  dailyLimits: {
    maxAmountPerUser: number;
    maxTransactionsPerUser: number;
  };
  allowedPaymentMethods: PaymentMethodType[];
  adminUserIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Database model interface (matching Prisma schema)
export interface ServerConfigDB {
  id: string;
  serverId: string;
  paymentsEnabled: boolean;
  maxAmountPerUser: number;
  maxTransactionsPerUser: number;
  allowedPaymentMethodsJson: string;
  adminUserIdsJson: string;
  createdAt: Date;
  updatedAt: Date;
}

// Validation functions
export function isValidServerId(serverId: string): boolean {
  return /^\d{17,19}$/.test(serverId);
}

export function isValidServerConfig(config: any): config is ServerConfig {
  return (
    typeof config === 'object' &&
    typeof config.id === 'string' &&
    isValidServerId(config.serverId) &&
    typeof config.paymentsEnabled === 'boolean' &&
    typeof config.dailyLimits === 'object' &&
    typeof config.dailyLimits.maxAmountPerUser === 'number' &&
    config.dailyLimits.maxAmountPerUser > 0 &&
    typeof config.dailyLimits.maxTransactionsPerUser === 'number' &&
    config.dailyLimits.maxTransactionsPerUser > 0 &&
    Array.isArray(config.allowedPaymentMethods) &&
    config.allowedPaymentMethods.every(isValidPaymentMethodType) &&
    Array.isArray(config.adminUserIds) &&
    config.adminUserIds.every(isValidDiscordId) &&
    config.createdAt instanceof Date &&
    config.updatedAt instanceof Date
  );
}

// Helper functions for JSON array handling
export function parseAllowedPaymentMethods(json: string): PaymentMethodType[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((method: any) => typeof method === 'string' && isValidPaymentMethodType(method))
      : ['CRYPTO', 'ACH', 'OTHER'];
  } catch {
    return ['CRYPTO', 'ACH', 'OTHER'];
  }
}

export function stringifyAllowedPaymentMethods(methods: PaymentMethodType[]): string {
  const validMethods = methods.filter(isValidPaymentMethodType);
  return JSON.stringify(validMethods.length > 0 ? validMethods : ['CRYPTO', 'ACH', 'OTHER']);
}

export function parseAdminUserIds(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((id: any) => typeof id === 'string' && isValidDiscordId(id)) : [];
  } catch {
    return [];
  }
}

export function stringifyAdminUserIds(userIds: string[]): string {
  return JSON.stringify(userIds.filter(isValidDiscordId));
}

// Conversion functions between DB and domain models
export function dbToServerConfig(dbConfig: ServerConfigDB): ServerConfig {
  return {
    id: dbConfig.id,
    serverId: dbConfig.serverId,
    paymentsEnabled: dbConfig.paymentsEnabled,
    dailyLimits: {
      maxAmountPerUser: dbConfig.maxAmountPerUser,
      maxTransactionsPerUser: dbConfig.maxTransactionsPerUser,
    },
    allowedPaymentMethods: parseAllowedPaymentMethods(dbConfig.allowedPaymentMethodsJson),
    adminUserIds: parseAdminUserIds(dbConfig.adminUserIdsJson),
    createdAt: dbConfig.createdAt,
    updatedAt: dbConfig.updatedAt,
  };
}

export function serverConfigToDb(config: ServerConfig): Omit<ServerConfigDB, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    serverId: config.serverId,
    paymentsEnabled: config.paymentsEnabled,
    maxAmountPerUser: config.dailyLimits.maxAmountPerUser,
    maxTransactionsPerUser: config.dailyLimits.maxTransactionsPerUser,
    allowedPaymentMethodsJson: stringifyAllowedPaymentMethods(config.allowedPaymentMethods),
    adminUserIdsJson: stringifyAdminUserIds(config.adminUserIds),
  };
}