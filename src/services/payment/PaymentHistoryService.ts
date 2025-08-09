// PaymentHistoryService handles transaction history and user activity queries
import { Transaction } from '../../models/Transaction';
import { PaymentMethodConfig, PaymentMethodType } from '../../models/UserAccount';
import { getPrismaClient } from '../../models/database';
import { 
  PaymentMethodType as PrismaPaymentMethodType, 
  TransactionStatus as PrismaTransactionStatus,
  EscrowStatus as PrismaEscrowStatus 
} from '@prisma/client';
import { TransactionStatus } from '../../models/Transaction';
import { EscrowStatus } from '../../models/EscrowRecord';
import { dbToTransaction } from '../../models/Transaction';

export interface PaymentHistoryService {
  getTransactionHistory(
    userId: string, 
    limit?: number, 
    offset?: number
  ): Promise<Transaction[]>;

  getUserActivity(userId: string): Promise<{
    totalSent: number;
    totalReceived: number;
    totalTransactions: number;
    pendingRequests: number;
    recentTransactions: Array<{
      type: 'SENT' | 'RECEIVED';
      amount: number;
      currency: string;
      status: string;
    }>;
  }>;

  getTransaction(transactionId: string): Promise<Transaction | null>;
}

export class PaymentHistoryServiceImpl implements PaymentHistoryService {
  private readonly prisma = getPrismaClient();

  /**
   * Convert Prisma EscrowStatus to application EscrowStatus
   */
  private convertFromDbEscrowStatus(status: PrismaEscrowStatus): EscrowStatus {
    switch (status) {
      case 'HOLDING':
        return EscrowStatus.HOLDING;
      case 'RELEASED':
        return EscrowStatus.RELEASED;
      case 'RETURNED':
        return EscrowStatus.RETURNED;
      default:
        return EscrowStatus.HOLDING;
    }
  }

  /**
   * Convert Prisma PaymentMethodType to application PaymentMethodType
   */
  private convertFromDbPaymentMethodType(type: PrismaPaymentMethodType): PaymentMethodType {
    switch (type) {
      case 'CRYPTO':
        return 'CRYPTO';
      case 'ACH':
        return 'ACH';
      case 'OTHER':
        return 'OTHER';
      default:
        return 'OTHER';
    }
  }

  /**
   * Convert Prisma TransactionStatus to application TransactionStatus
   */
  private convertFromDbTransactionStatus(status: PrismaTransactionStatus): TransactionStatus {
    switch (status) {
      case 'PENDING':
        return TransactionStatus.PENDING;
      case 'ESCROWED':
        return TransactionStatus.ESCROWED;
      case 'COMPLETED':
        return TransactionStatus.COMPLETED;
      case 'FAILED':
        return TransactionStatus.FAILED;
      case 'CANCELLED':
        return TransactionStatus.CANCELLED;
      default:
        return TransactionStatus.PENDING;
    }
  }

  /**
   * Convert database payment method to domain model
   */
  private convertDbPaymentMethod(pm: any): PaymentMethodConfig {
    return {
      id: pm.id,
      type: this.convertFromDbPaymentMethodType(pm.type),
      displayName: pm.displayName,
      encryptedDetails: pm.encryptedDetails,
      isActive: pm.isActive,
      addedAt: pm.addedAt,
    };
  }

  async getTransactionHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    if (!userId) {
      throw new Error('User ID is required');
    }

    if (limit <= 0 || limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }

    if (offset < 0) {
      throw new Error('Offset must be non-negative');
    }

    const dbTransactions = await this.prisma.transaction.findMany({
      where: {
        OR: [
          { senderId: userId },
          { recipientId: userId }
        ]
      },
      include: {
        senderPaymentMethod: true,
        recipientPaymentMethod: true,
        escrowRecord: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });

    return dbTransactions.map(dbTx => {
      const senderPaymentMethod = this.convertDbPaymentMethod(dbTx.senderPaymentMethod);
      
      const recipientPaymentMethod = dbTx.recipientPaymentMethod 
        ? this.convertDbPaymentMethod(dbTx.recipientPaymentMethod)
        : undefined;

      // Convert the Prisma transaction to our transaction type with proper null handling
      const convertedDbTx = {
        id: dbTx.id,
        senderId: dbTx.senderId,
        recipientId: dbTx.recipientId,
        amount: dbTx.amount,
        currency: dbTx.currency,
        senderPaymentMethodId: dbTx.senderPaymentMethodId,
        recipientPaymentMethodId: dbTx.recipientPaymentMethodId || undefined,
        status: this.convertFromDbTransactionStatus(dbTx.status),
        processingFee: dbTx.processingFee,
        escrowFee: dbTx.escrowFee,
        totalFees: dbTx.totalFees,
        createdAt: dbTx.createdAt,
        completedAt: dbTx.completedAt || undefined,
        failureReason: dbTx.failureReason || undefined,
      };

      const escrowRecord = dbTx.escrowRecord ? {
        ...dbTx.escrowRecord,
        paymentMethod: this.convertFromDbPaymentMethodType(
          dbTx.escrowRecord.paymentMethod
        ),
        status: this.convertFromDbEscrowStatus(dbTx.escrowRecord.status),
        releaseAt: dbTx.escrowRecord.releaseAt || undefined,
      } : undefined;

      return dbToTransaction(
        convertedDbTx, 
        senderPaymentMethod, 
        recipientPaymentMethod, 
        escrowRecord
      );
    });
  }

  async getUserActivity(userId: string): Promise<{
    totalSent: number;
    totalReceived: number;
    totalTransactions: number;
    pendingRequests: number;
    recentTransactions: Array<{
      type: 'SENT' | 'RECEIVED';
      amount: number;
      currency: string;
      status: string;
    }>;
  }> {
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Get transaction totals
    const [sentTransactions, receivedTransactions, pendingRequests] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          senderId: userId,
          status: 'COMPLETED'
        },
        select: { 
          amount: true, 
          currency: true, 
          status: true, 
          createdAt: true 
        }
      }),
      this.prisma.transaction.findMany({
        where: {
          recipientId: userId,
          status: 'COMPLETED'
        },
        select: { 
          amount: true, 
          currency: true, 
          status: true, 
          createdAt: true 
        }
      }),
      this.prisma.paymentRequest.count({
        where: {
          payerId: userId,
          status: 'PENDING'
        }
      })
    ]);

    const totalSent = sentTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    const totalReceived = receivedTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    const totalTransactions = sentTransactions.length + receivedTransactions.length;

    // Get recent transactions for display
    const allTransactions = [
      ...sentTransactions.map(tx => ({ ...tx, type: 'SENT' as const })),
      ...receivedTransactions.map(tx => ({ ...tx, type: 'RECEIVED' as const }))
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const recentTransactions = allTransactions.slice(0, 5).map(tx => ({
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status
    }));

    return {
      totalSent,
      totalReceived,
      totalTransactions,
      pendingRequests,
      recentTransactions
    };
  }

  async getTransaction(transactionId: string): Promise<Transaction | null> {
    if (!transactionId) {
      throw new Error('Transaction ID is required');
    }

    const dbTransaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        senderPaymentMethod: true,
        recipientPaymentMethod: true,
        escrowRecord: true
      }
    });

    if (!dbTransaction) {
      return null;
    }

    const senderPaymentMethod = this.convertDbPaymentMethod(dbTransaction.senderPaymentMethod);
    
    const recipientPaymentMethod = dbTransaction.recipientPaymentMethod 
      ? this.convertDbPaymentMethod(dbTransaction.recipientPaymentMethod)
      : undefined;

    // Convert the Prisma transaction to our transaction type with proper null handling
    const convertedDbTransaction = {
      id: dbTransaction.id,
      senderId: dbTransaction.senderId,
      recipientId: dbTransaction.recipientId,
      amount: dbTransaction.amount,
      currency: dbTransaction.currency,
      senderPaymentMethodId: dbTransaction.senderPaymentMethodId,
      recipientPaymentMethodId: dbTransaction.recipientPaymentMethodId || undefined,
      status: this.convertFromDbTransactionStatus(dbTransaction.status),
      processingFee: dbTransaction.processingFee,
      escrowFee: dbTransaction.escrowFee,
      totalFees: dbTransaction.totalFees,
      createdAt: dbTransaction.createdAt,
      completedAt: dbTransaction.completedAt || undefined,
      failureReason: dbTransaction.failureReason || undefined,
    };

    const escrowRecord = dbTransaction.escrowRecord ? {
      ...dbTransaction.escrowRecord,
      paymentMethod: this.convertFromDbPaymentMethodType(
        dbTransaction.escrowRecord.paymentMethod
      ),
      status: this.convertFromDbEscrowStatus(dbTransaction.escrowRecord.status),
      releaseAt: dbTransaction.escrowRecord.releaseAt || undefined,
    } : undefined;

    return dbToTransaction(
      convertedDbTransaction, 
      senderPaymentMethod, 
      recipientPaymentMethod, 
      escrowRecord
    );
  }
}
