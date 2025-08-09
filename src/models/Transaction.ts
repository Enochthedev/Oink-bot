// Transaction model interfaces
import { PaymentMethodConfig, isValidDiscordId } from './UserAccount';
import { EscrowRecord } from './EscrowRecord';

export interface Transaction {
  id: string;
  senderId: string;
  recipientId: string;
  amount: number;
  currency: string;
  senderPaymentMethod: PaymentMethodConfig;
  recipientPaymentMethod?: PaymentMethodConfig;
  status: TransactionStatus;
  escrowRecord?: EscrowRecord;
  fees: FeeBreakdown;
  createdAt: Date;
  completedAt?: Date;
  failureReason?: string;
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  ESCROWED = 'ESCROWED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export interface FeeBreakdown {
  processingFee: number;
  escrowFee: number;
  total: number;
}

// Database model interface (matching Prisma schema)
export interface TransactionDB {
  id: string;
  senderId: string;
  recipientId: string;
  amount: number;
  currency: string;
  senderPaymentMethodId: string;
  recipientPaymentMethodId?: string;
  status: TransactionStatus;
  processingFee: number;
  escrowFee: number;
  totalFees: number;
  createdAt: Date;
  completedAt?: Date;
  failureReason?: string;
}

// Validation functions
export function isValidTransactionStatus(status: string): status is TransactionStatus {
  return Object.values(TransactionStatus).includes(status as TransactionStatus);
}

export function isValidAmount(amount: number): boolean {
  return typeof amount === 'number' && amount > 0 && Number.isFinite(amount);
}

export function isValidCurrency(currency: string): boolean {
  return typeof currency === 'string' && /^[A-Z]{3}$/.test(currency);
}

export function isValidFeeBreakdown(fees: any): fees is FeeBreakdown {
  return (
    typeof fees === 'object' &&
    typeof fees.processingFee === 'number' &&
    fees.processingFee >= 0 &&
    typeof fees.escrowFee === 'number' &&
    fees.escrowFee >= 0 &&
    typeof fees.total === 'number' &&
    fees.total >= 0 &&
    Math.abs(fees.total - (fees.processingFee + fees.escrowFee)) < 0.01 // Allow for floating point precision
  );
}

export function isValidTransaction(transaction: any): transaction is Transaction {
  return (
    typeof transaction === 'object' &&
    typeof transaction.id === 'string' &&
    isValidDiscordId(transaction.senderId) &&
    isValidDiscordId(transaction.recipientId) &&
    transaction.senderId !== transaction.recipientId &&
    isValidAmount(transaction.amount) &&
    isValidCurrency(transaction.currency) &&
    typeof transaction.senderPaymentMethod === 'object' &&
    (transaction.recipientPaymentMethod === undefined || typeof transaction.recipientPaymentMethod === 'object') &&
    isValidTransactionStatus(transaction.status) &&
    isValidFeeBreakdown(transaction.fees) &&
    transaction.createdAt instanceof Date &&
    (transaction.completedAt === undefined || transaction.completedAt instanceof Date) &&
    (transaction.failureReason === undefined || typeof transaction.failureReason === 'string')
  );
}

// Helper functions
export function calculateTotalFees(processingFee: number, escrowFee: number): number {
  return Math.round((processingFee + escrowFee) * 100) / 100; // Round to 2 decimal places
}

export function createFeeBreakdown(processingFee: number, escrowFee: number): FeeBreakdown {
  return {
    processingFee: Math.round(processingFee * 100) / 100,
    escrowFee: Math.round(escrowFee * 100) / 100,
    total: calculateTotalFees(processingFee, escrowFee),
  };
}

// Conversion functions between DB and domain models
export function dbToTransaction(
  dbTransaction: TransactionDB,
  senderPaymentMethod: PaymentMethodConfig,
  recipientPaymentMethod?: PaymentMethodConfig,
  escrowRecord?: EscrowRecord
): Transaction {
  return {
    id: dbTransaction.id,
    senderId: dbTransaction.senderId,
    recipientId: dbTransaction.recipientId,
    amount: dbTransaction.amount,
    currency: dbTransaction.currency,
    senderPaymentMethod,
    recipientPaymentMethod,
    status: dbTransaction.status,
    escrowRecord,
    fees: {
      processingFee: dbTransaction.processingFee,
      escrowFee: dbTransaction.escrowFee,
      total: dbTransaction.totalFees,
    },
    createdAt: dbTransaction.createdAt,
    completedAt: dbTransaction.completedAt,
    failureReason: dbTransaction.failureReason,
  };
}

export function transactionToDb(transaction: Transaction): Omit<TransactionDB, 'id' | 'createdAt'> {
  return {
    senderId: transaction.senderId,
    recipientId: transaction.recipientId,
    amount: transaction.amount,
    currency: transaction.currency,
    senderPaymentMethodId: transaction.senderPaymentMethod.id,
    recipientPaymentMethodId: transaction.recipientPaymentMethod?.id,
    status: transaction.status,
    processingFee: transaction.fees.processingFee,
    escrowFee: transaction.fees.escrowFee,
    totalFees: transaction.fees.total,
    completedAt: transaction.completedAt,
    failureReason: transaction.failureReason,
  };
}