// TransactionManagementService handles transaction-related operations
import { Transaction, TransactionStatus, dbToTransaction, transactionToDb } from '../../models/Transaction';
import { getPrismaClient } from '../../models/database';
import { TransactionStatus as PrismaTransactionStatus } from '@prisma/client';
import { UserAccountService } from '../UserAccountService';
import { UserAccountServiceImpl } from '../UserAccountService';
import { PaymentMethodConfig } from '../../models/UserAccount';

export class TransactionManagementService {
  private readonly prisma = getPrismaClient();
  private readonly userAccountService: UserAccountService;

  constructor(userAccountService?: UserAccountService) {
    this.userAccountService = userAccountService || new UserAccountServiceImpl();
  }

  /**
   * Gets a transaction by ID
   */
  async getTransaction(transactionId: string): Promise<Transaction | null> {
    try {
      const dbTransaction = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
        include: {
          escrowRecord: true
        }
      });

      if (!dbTransaction) return null;

      // For now, return null since we need payment method data
      // TODO: Implement proper payment method fetching
      return null;
    } catch (error) {
      console.error('Error fetching transaction:', error);
      return null;
    }
  }

  /**
   * Gets transaction history for a user
   */
  async getTransactionHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    try {
      const dbTransactions = await this.prisma.transaction.findMany({
        where: {
          OR: [
            { senderId: userId },
            { recipientId: userId }
          ]
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit,
        skip: offset,
        include: {
          escrowRecord: true
        }
      });

      // For now, return empty array since we need payment method data
      // TODO: Implement proper payment method fetching for bulk operations
      return [];
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      return [];
    }
  }

  /**
   * Updates transaction status
   */
  async updateTransactionStatus(
    transactionId: string,
    status: TransactionStatus,
    failureReason?: string
  ): Promise<void> {
    if (!transactionId) {
      throw new Error('Transaction ID is required');
    }

    if (!Object.values(TransactionStatus).includes(status)) {
      throw new Error('Invalid transaction status');
    }

    try {
      const updateData: any = {
        status: this.convertToDbTransactionStatus(status),
        updatedAt: new Date()
      };

      if (status === TransactionStatus.COMPLETED) {
        updateData.completedAt = new Date();
      }

      if (status === TransactionStatus.FAILED && failureReason) {
        updateData.failureReason = failureReason;
      }

      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: updateData
      });
    } catch (error) {
      console.error('Error updating transaction status:', error);
      throw new Error(`Failed to update transaction status: ${error}`);
    }
  }

  /**
   * Gets transactions by status
   */
  async getTransactionsByStatus(status: TransactionStatus): Promise<Transaction[]> {
    try {
      const dbTransactions = await this.prisma.transaction.findMany({
        where: {
          status: this.convertToDbTransactionStatus(status)
        },
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          escrowRecord: true
        }
      });

      // For now, return empty array since we need payment method data
      // TODO: Implement proper payment method fetching for bulk operations
      return [];
    } catch (error) {
      console.error('Error fetching transactions by status:', error);
      return [];
    }
  }

  /**
   * Gets pending transactions for a user
   */
  async getPendingTransactions(userId: string): Promise<Transaction[]> {
    try {
      const dbTransactions = await this.prisma.transaction.findMany({
        where: {
          OR: [
            { senderId: userId },
            { recipientId: userId }
          ],
          status: this.convertToDbTransactionStatus(TransactionStatus.PENDING)
        },
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          escrowRecord: true
        }
      });

      // For now, return empty array since we need payment method data
      // TODO: Implement proper payment method fetching for bulk operations
      return [];
    } catch (error) {
      console.error('Error fetching pending transactions:', error);
      return [];
    }
  }

  /**
   * Gets completed transactions for a user
   */
  async getCompletedTransactions(userId: string): Promise<Transaction[]> {
    try {
      const dbTransactions = await this.prisma.transaction.findMany({
        where: {
          OR: [
            { senderId: userId },
            { recipientId: userId }
          ],
          status: this.convertToDbTransactionStatus(TransactionStatus.COMPLETED)
        },
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          escrowRecord: true
        }
      });

      // For now, return empty array since we need payment method data
      // TODO: Implement proper payment method fetching for bulk operations
      return [];
    } catch (error) {
      console.error('Error fetching completed transactions:', error);
      return [];
    }
  }

  /**
   * Deletes a transaction (for cleanup purposes)
   */
  async deleteTransaction(transactionId: string): Promise<void> {
    try {
      await this.prisma.transaction.delete({
        where: { id: transactionId }
      });
    } catch (error) {
      console.error('Error deleting transaction:', error);
      throw new Error(`Failed to delete transaction: ${error}`);
    }
  }

  /**
   * Convert application TransactionStatus to Prisma TransactionStatus
   */
  private convertToDbTransactionStatus(status: TransactionStatus): PrismaTransactionStatus {
    switch (status) {
      case TransactionStatus.PENDING:
        return 'PENDING';
      case TransactionStatus.ESCROWED:
        return 'ESCROWED';
      case TransactionStatus.COMPLETED:
        return 'COMPLETED';
      case TransactionStatus.FAILED:
        return 'FAILED';
      case TransactionStatus.CANCELLED:
        return 'CANCELLED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Gets payment method configuration by ID
   */
  private async getPaymentMethodConfig(paymentMethodId: string): Promise<PaymentMethodConfig> {
    // This is a simplified approach - in a real implementation, you'd want to cache this
    // or have a more efficient way to fetch payment method configs
    // For now, we'll need to implement a different approach since getAllAccounts doesn't exist
    
    // TODO: Implement proper payment method fetching
    // This could involve:
    // 1. Adding a method to UserAccountService to get payment method by ID
    // 2. Using a separate PaymentMethodService
    // 3. Caching payment method data
    
    throw new Error(`Payment method fetching not implemented yet: ${paymentMethodId}`);
  }
}
