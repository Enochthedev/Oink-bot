// Escrow manager implementation
import {
  EscrowRecord,
  EscrowStatus,
  calculateReleaseTime,
} from '../models/EscrowRecord';
import { PaymentMethodType } from '../models/UserAccount';
import { TransactionStatus } from '../models/Transaction';
import { PaymentMethodType as PrismaPaymentMethodType, EscrowStatus as PrismaEscrowStatus } from '@prisma/client';
import { PaymentProcessorFactory } from '../processors/PaymentProcessorFactory';
import { getPrismaClient, withTransaction } from '../models/database';

export interface EscrowManager {
  holdFunds(
    transactionId: string,
    amount: number,
    paymentMethod: PrismaPaymentMethodType
  ): Promise<EscrowRecord>;

  releaseFunds(
    transactionId: string,
    recipientMethod: PrismaPaymentMethodType
  ): Promise<void>;

  returnFunds(transactionId: string): Promise<void>;

  getEscrowStatus(transactionId: string): Promise<EscrowStatus>;

  getEscrowRecord(transactionId: string): Promise<EscrowRecord | null>;

  processExpiredEscrows(): Promise<void>;

  cleanupCompletedEscrows(olderThanDays: number): Promise<number>;
}

export class EscrowManagerImpl implements EscrowManager {
  private readonly prisma = getPrismaClient();
  private readonly paymentProcessorFactory: PaymentProcessorFactory;
  private readonly escrowTimeoutHours: number;

  constructor(
    paymentProcessorFactory: PaymentProcessorFactory,
    escrowTimeoutHours: number = 24
  ) {
    this.paymentProcessorFactory = paymentProcessorFactory;
    this.escrowTimeoutHours = escrowTimeoutHours;
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
   * Convert application PaymentMethodType to Prisma PaymentMethodType
   */
  private convertToDbPaymentMethodType(type: PaymentMethodType): PrismaPaymentMethodType {
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
   * Convert application EscrowStatus to Prisma EscrowStatus
   */
  private convertToDbEscrowStatus(status: EscrowStatus): PrismaEscrowStatus {
    switch (status) {
      case EscrowStatus.HOLDING:
        return 'HOLDING';
      case EscrowStatus.RELEASED:
        return 'RELEASED';
      case EscrowStatus.RETURNED:
        return 'RETURNED';
      default:
        return 'HOLDING';
    }
  }

  async holdFunds(
    transactionId: string,
    amount: number,
    paymentMethod: PrismaPaymentMethodType
  ): Promise<EscrowRecord> {
    if (!transactionId || typeof transactionId !== 'string') {
      throw new Error('Invalid transaction ID');
    }

    if (!amount || amount <= 0 || !Number.isFinite(amount)) {
      throw new Error('Invalid amount for escrow');
    }

    if (!Object.values(PrismaPaymentMethodType).includes(paymentMethod)) {
      throw new Error('Invalid payment method type');
    }

    return await withTransaction(async (tx) => {
      // Check if escrow record already exists
      const existingEscrow = await tx.escrowRecord.findUnique({
        where: { transactionId }
      });

      if (existingEscrow) {
        throw new Error(`Escrow record already exists for transaction ${transactionId}`);
      }

      // Get transaction details to validate
      const transaction = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: {
          senderPaymentMethod: true
        }
      });

      if (!transaction) {
        throw new Error(`Transaction ${transactionId} not found`);
      }

      if (transaction.status !== TransactionStatus.PENDING) {
        throw new Error(`Transaction ${transactionId} is not in pending status`);
      }

      // Convert payment method type for processor
      const appPaymentMethodType = this.convertFromDbPaymentMethodType(paymentMethod);
      const processor = this.paymentProcessorFactory.createProcessor(appPaymentMethodType);
      
      const paymentMethodDetails = {
        type: transaction.senderPaymentMethod.type,
        accountInfo: JSON.parse(transaction.senderPaymentMethod.encryptedDetails)
      };

      const withdrawalResult = await processor.withdrawFunds(paymentMethodDetails, amount);

      if (!withdrawalResult.success) {
        throw new Error(`Failed to withdraw funds: ${withdrawalResult.error}`);
      }

      // Create escrow record
      const releaseAt = calculateReleaseTime(new Date(), this.escrowTimeoutHours);
      const escrowData = {
        transactionId,
        amount,
        currency: transaction.currency,
        paymentMethod,
        externalTransactionId: withdrawalResult.transactionId,
        status: this.convertToDbEscrowStatus(EscrowStatus.HOLDING),
        releaseAt
      };

      const dbEscrowRecord = await tx.escrowRecord.create({
        data: escrowData
      });

      // Update transaction status to ESCROWED
      await tx.transaction.update({
        where: { id: transactionId },
        data: { status: TransactionStatus.ESCROWED }
      });

      // Convert the database record to application format
      return {
        id: dbEscrowRecord.id,
        transactionId: dbEscrowRecord.transactionId,
        amount: dbEscrowRecord.amount,
        currency: dbEscrowRecord.currency,
        paymentMethod: this.convertFromDbPaymentMethodType(dbEscrowRecord.paymentMethod),
        externalTransactionId: dbEscrowRecord.externalTransactionId,
        status: this.convertFromDbEscrowStatus(dbEscrowRecord.status),
        createdAt: dbEscrowRecord.createdAt,
        releaseAt: dbEscrowRecord.releaseAt || undefined,
      };
    });
  }

  async releaseFunds(
    transactionId: string,
    recipientMethod: PrismaPaymentMethodType
  ): Promise<void> {
    if (!transactionId || typeof transactionId !== 'string') {
      throw new Error('Invalid transaction ID');
    }

    if (!Object.values(PrismaPaymentMethodType).includes(recipientMethod)) {
      throw new Error('Invalid recipient payment method type');
    }

    await withTransaction(async (tx) => {
      // Get escrow record
      const escrowRecord = await tx.escrowRecord.findUnique({
        where: { transactionId },
        include: {
          transaction: {
            include: {
              recipientPaymentMethod: true
            }
          }
        }
      });

      if (!escrowRecord) {
        throw new Error(`Escrow record not found for transaction ${transactionId}`);
      }

      if (escrowRecord.status !== this.convertToDbEscrowStatus(EscrowStatus.HOLDING)) {
        throw new Error(`Escrow is not in holding status: ${escrowRecord.status}`);
      }

      if (!escrowRecord.transaction.recipientPaymentMethod) {
        throw new Error(`Recipient payment method not found for transaction ${transactionId}`);
      }

      // Convert payment method type for processor
      const appRecipientMethodType = this.convertFromDbPaymentMethodType(recipientMethod);
      const processor = this.paymentProcessorFactory.createProcessor(appRecipientMethodType);
      
      const recipientPaymentDetails = {
        type: escrowRecord.transaction.recipientPaymentMethod.type,
        accountInfo: JSON.parse(escrowRecord.transaction.recipientPaymentMethod.encryptedDetails)
      };

      const depositResult = await processor.depositFunds(recipientPaymentDetails, escrowRecord.amount);

      if (!depositResult.success) {
        throw new Error(`Failed to deposit funds: ${depositResult.error}`);
      }

      // Update escrow record status
      await tx.escrowRecord.update({
        where: { transactionId },
        data: {
          status: this.convertToDbEscrowStatus(EscrowStatus.RELEASED),
          releaseAt: new Date()
        }
      });

      // Update transaction status to COMPLETED
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.COMPLETED,
          completedAt: new Date()
        }
      });
    });
  }

  async returnFunds(transactionId: string): Promise<void> {
    if (!transactionId || typeof transactionId !== 'string') {
      throw new Error('Invalid transaction ID');
    }

    await withTransaction(async (tx) => {
      // Get escrow record
      const escrowRecord = await tx.escrowRecord.findUnique({
        where: { transactionId },
        include: {
          transaction: {
            include: {
              senderPaymentMethod: true
            }
          }
        }
      });

      if (!escrowRecord) {
        throw new Error(`Escrow record not found for transaction ${transactionId}`);
      }

      if (escrowRecord.status !== this.convertToDbEscrowStatus(EscrowStatus.HOLDING)) {
        throw new Error(`Escrow is not in holding status: ${escrowRecord.status}`);
      }

      // Convert payment method type for processor
      const appPaymentMethodType = this.convertFromDbPaymentMethodType(escrowRecord.paymentMethod);
      const processor = this.paymentProcessorFactory.createProcessor(appPaymentMethodType);
      
      const senderPaymentDetails = {
        type: escrowRecord.transaction.senderPaymentMethod.type,
        accountInfo: JSON.parse(escrowRecord.transaction.senderPaymentMethod.encryptedDetails)
      };

      const depositResult = await processor.depositFunds(senderPaymentDetails, escrowRecord.amount);

      if (!depositResult.success) {
        throw new Error(`Failed to return funds: ${depositResult.error}`);
      }

      // Update escrow record status
      await tx.escrowRecord.update({
        where: { transactionId },
        data: {
          status: this.convertToDbEscrowStatus(EscrowStatus.RETURNED),
          releaseAt: new Date()
        }
      });

      // Update transaction status to FAILED
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.FAILED,
          failureReason: 'Funds returned from escrow'
        }
      });
    });
  }

  async getEscrowStatus(transactionId: string): Promise<EscrowStatus> {
    if (!transactionId || typeof transactionId !== 'string') {
      throw new Error('Invalid transaction ID');
    }

    const escrowRecord = await this.prisma.escrowRecord.findUnique({
      where: { transactionId }
    });

    if (!escrowRecord) {
      throw new Error(`Escrow record not found for transaction ${transactionId}`);
    }

    return this.convertFromDbEscrowStatus(escrowRecord.status);
  }

  async getEscrowRecord(transactionId: string): Promise<EscrowRecord | null> {
    if (!transactionId || typeof transactionId !== 'string') {
      throw new Error('Invalid transaction ID');
    }

    const dbRecord = await this.prisma.escrowRecord.findUnique({
      where: { transactionId }
    });

    if (!dbRecord) {
      return null;
    }

    // Convert the database record to application format
    return {
      id: dbRecord.id,
      transactionId: dbRecord.transactionId,
      amount: dbRecord.amount,
      currency: dbRecord.currency,
      paymentMethod: this.convertFromDbPaymentMethodType(dbRecord.paymentMethod),
      externalTransactionId: dbRecord.externalTransactionId,
      status: this.convertFromDbEscrowStatus(dbRecord.status),
      createdAt: dbRecord.createdAt,
      releaseAt: dbRecord.releaseAt || undefined,
    };
  }

  async processExpiredEscrows(): Promise<void> {
    const expiredEscrows = await this.prisma.escrowRecord.findMany({
      where: {
        status: this.convertToDbEscrowStatus(EscrowStatus.HOLDING),
        releaseAt: {
          lte: new Date()
        }
      },
      include: {
        transaction: true
      }
    });

    for (const escrowRecord of expiredEscrows) {
      try {
        await this.returnFunds(escrowRecord.transactionId);
        console.log(`🐷 Oink! Returned expired escrow funds for transaction ${escrowRecord.transactionId} 🐽💰`);
      } catch (error) {
        console.error(`❌ Oink... failed to return expired escrow funds for transaction ${escrowRecord.transactionId}:`, error);

        // Mark transaction as failed if we can't return funds
        await this.prisma.transaction.update({
          where: { id: escrowRecord.transactionId },
          data: {
            status: TransactionStatus.FAILED,
            failureReason: `Escrow timeout - failed to return funds: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        });
      }
    }
  }

  async cleanupCompletedEscrows(olderThanDays: number = 30): Promise<number> {
    if (olderThanDays <= 0) {
      throw new Error('olderThanDays must be positive');
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.escrowRecord.deleteMany({
      where: {
        status: {
          in: [
            this.convertToDbEscrowStatus(EscrowStatus.RELEASED), 
            this.convertToDbEscrowStatus(EscrowStatus.RETURNED)
          ]
        },
        releaseAt: {
          lte: cutoffDate
        }
      }
    });

    return result.count;
  }
}

// Error classes for better error handling
export class EscrowError extends Error {
  constructor(message: string, public readonly transactionId?: string) {
    super(message);
    this.name = 'EscrowError';
  }
}

export class EscrowTimeoutError extends EscrowError {
  constructor(transactionId: string) {
    super(`Escrow timeout for transaction ${transactionId}`, transactionId);
    this.name = 'EscrowTimeoutError';
  }
}

export class EscrowNotFoundError extends EscrowError {
  constructor(transactionId: string) {
    super(`Escrow record not found for transaction ${transactionId}`, transactionId);
    this.name = 'EscrowNotFoundError';
  }
}

export class EscrowStatusError extends EscrowError {
  constructor(transactionId: string, currentStatus: EscrowStatus, expectedStatus: EscrowStatus) {
    super(`Invalid escrow status for transaction ${transactionId}: expected ${expectedStatus}, got ${currentStatus}`, transactionId);
    this.name = 'EscrowStatusError';
  }
}