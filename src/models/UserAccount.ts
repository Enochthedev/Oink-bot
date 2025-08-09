// User account model interfaces
export interface UserAccount {
  id: string;
  discordId: string;
  paymentMethods: PaymentMethodConfig[];
  notificationPreferences: NotificationSettings;
  isSetupComplete: boolean;
  isPublicProfile: boolean;
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentMethodConfig {
  id: string;
  type: PaymentMethodType;
  displayName: string;
  encryptedDetails: string;
  isActive: boolean;
  addedAt: Date;
}

export type PaymentMethodType = 'CRYPTO' | 'ACH' | 'OTHER';

export interface NotificationSettings {
  enableDMNotifications: boolean;
  enableChannelNotifications: boolean;
}

// Database model interfaces (matching Prisma schema)
export interface UserAccountDB {
  id: string;
  discordId: string;
  enableDMNotifications: boolean;
  enableChannelNotifications: boolean;
  isSetupComplete: boolean;
  isPublicProfile: boolean;
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentMethodConfigDB {
  id: string;
  userId: string;
  type: PaymentMethodType;
  displayName: string;
  encryptedDetails: string;
  isActive: boolean;
  addedAt: Date;
}

// Validation functions
export function isValidPaymentMethodType(type: string): type is PaymentMethodType {
  return ['CRYPTO', 'ACH', 'OTHER'].includes(type);
}

export function isValidDiscordId(discordId: string): boolean {
  return /^\d{17,19}$/.test(discordId);
}

export function isValidPaymentMethodConfig(config: any): config is PaymentMethodConfig {
  return (
    typeof config === 'object' &&
    typeof config.id === 'string' &&
    isValidPaymentMethodType(config.type) &&
    typeof config.displayName === 'string' &&
    typeof config.encryptedDetails === 'string' &&
    typeof config.isActive === 'boolean' &&
    config.addedAt instanceof Date
  );
}

export function isValidUserAccount(account: any): account is UserAccount {
  return (
    typeof account === 'object' &&
    typeof account.id === 'string' &&
    isValidDiscordId(account.discordId) &&
    Array.isArray(account.paymentMethods) &&
    account.paymentMethods.every(isValidPaymentMethodConfig) &&
    typeof account.notificationPreferences === 'object' &&
    typeof account.notificationPreferences.enableDMNotifications === 'boolean' &&
    typeof account.notificationPreferences.enableChannelNotifications === 'boolean' &&
    typeof account.isSetupComplete === 'boolean' &&
    typeof account.isPublicProfile === 'boolean' &&
    (account.lastActivityAt === undefined || account.lastActivityAt instanceof Date) &&
    account.createdAt instanceof Date &&
    account.updatedAt instanceof Date
  );
}



// Conversion functions between DB and domain models
export function dbToUserAccount(
  dbUser: UserAccountDB,
  paymentMethods: PaymentMethodConfig[] = []
): UserAccount {
  return {
    id: dbUser.id,
    discordId: dbUser.discordId,
    paymentMethods,
    notificationPreferences: {
      enableDMNotifications: dbUser.enableDMNotifications,
      enableChannelNotifications: dbUser.enableChannelNotifications,
    },
    isSetupComplete: dbUser.isSetupComplete,
    isPublicProfile: dbUser.isPublicProfile,
    lastActivityAt: dbUser.lastActivityAt,
    createdAt: dbUser.createdAt,
    updatedAt: dbUser.updatedAt,
  };
}

export function userAccountToDb(user: UserAccount): Omit<UserAccountDB, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    discordId: user.discordId,
    enableDMNotifications: user.notificationPreferences.enableDMNotifications,
    enableChannelNotifications: user.notificationPreferences.enableChannelNotifications,
    isSetupComplete: user.isSetupComplete,
    isPublicProfile: user.isPublicProfile,
    lastActivityAt: user.lastActivityAt,
  };
}