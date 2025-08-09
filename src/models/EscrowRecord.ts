// Escrow record model
import { PaymentMethodType, isValidPaymentMethodType } from './UserAccount';
import { isValidAmount, isValidCurrency } from './Transaction';

export interface EscrowRecord {
  id: string;
  transactionId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethodType;
  externalTransactionId: string;
  status: EscrowStatus;
  createdAt: Date;
  releaseAt?: Date;
}

export enum EscrowStatus {
  HOLDING = 'HOLDING',
  RELEASED = 'RELEASED',
  RETURNED = 'RETURNED'
}

// Database model interface (matching Prisma schema)
export interface EscrowRecordDB {
  id: string;
  transactionId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethodType;
  externalTransactionId: string;
  status: EscrowStatus;
  createdAt: Date;
  releaseAt?: Date;
}

// Validation functions
export function isValidEscrowStatus(status: string): status is EscrowStatus {
  return Object.values(EscrowStatus).includes(status as EscrowStatus);
}

export function isValidExternalTransactionId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 255;
}

export function isValidEscrowRecord(record: any): record is EscrowRecord {
  return (
    typeof record === 'object' &&
    typeof record.id === 'string' &&
    typeof record.transactionId === 'string' &&
    isValidAmount(record.amount) &&
    isValidCurrency(record.currency) &&
    isValidPaymentMethodType(record.paymentMethod) &&
    isValidExternalTransactionId(record.externalTransactionId) &&
    isValidEscrowStatus(record.status) &&
    record.createdAt instanceof Date &&
    (record.releaseAt === undefined || record.releaseAt instanceof Date)
  );
}

// Helper functions
export function isEscrowExpired(record: EscrowRecord, timeoutHours: number = 24): boolean {
  if (record.status !== EscrowStatus.HOLDING) {
    return false;
  }

  const timeoutMs = timeoutHours * 60 * 60 * 1000;
  const expirationTime = new Date(record.createdAt.getTime() + timeoutMs);
  return new Date() > expirationTime;
}

export function calculateReleaseTime(createdAt: Date, timeoutHours: number = 24): Date {
  return new Date(createdAt.getTime() + (timeoutHours * 60 * 60 * 1000));
}

// Conversion functions between DB and domain models
export function dbToEscrowRecord(dbRecord: EscrowRecordDB): EscrowRecord {
  return {
    id: dbRecord.id,
    transactionId: dbRecord.transactionId,
    amount: dbRecord.amount,
    currency: dbRecord.currency,
    paymentMethod: dbRecord.paymentMethod,
    externalTransactionId: dbRecord.externalTransactionId,
    status: dbRecord.status,
    createdAt: dbRecord.createdAt,
    releaseAt: dbRecord.releaseAt,
  };
}

export function escrowRecordToDb(record: EscrowRecord): Omit<EscrowRecordDB, 'id' | 'createdAt'> {
  return {
    transactionId: record.transactionId,
    amount: record.amount,
    currency: record.currency,
    paymentMethod: record.paymentMethod,
    externalTransactionId: record.externalTransactionId,
    status: record.status,
    releaseAt: record.releaseAt,
  };
}