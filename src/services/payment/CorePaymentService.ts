// CorePaymentService handles the main payment logic
import { Transaction, TransactionStatus, createFeeBreakdown, dbToTransaction, transactionToDb } from '../../models/Transaction';
import { PaymentMethodType, PaymentMethodConfig } from '../../models/UserAccount';
import { EscrowManager, EscrowManagerImpl } from '../EscrowManager';
import { UserAccountService, UserAccountServiceImpl } from '../UserAccountService';
import { ServerConfigService, ServerConfigServiceImpl } from '../ServerConfigService';
import { PaymentProcessorFactory, DefaultPaymentProcessorFactory } from '../../processors/PaymentProcessorFactory';
import { getPrismaClient, withTransaction } from '../../models/database';
import { v4 as uuidv4 } from 'uuid';
import { PaymentMethodType as PrismaPaymentMethodType, TransactionStatus as PrismaTransactionStatus, EscrowStatus as PrismaEscrowStatus, Prisma } from '@prisma/client';
import { EscrowStatus } from '../../models/EscrowRecord';
import { PaymentValidationService } from './PaymentValidationService';
import { TransactionManagementService } from './TransactionManagementService';

export interface CorePaymentService {
  initiatePayment(
    senderId: string,
    recipientId: string,
    amount: number,
    senderPaymentMethodId: string,
    recipientPaymentMethodId?: string,
    serverId?: string
  ): Promise<Transaction>;

  processPaymentRequest(requestId: string, approved: boolean): Promise<void>;
}

export class CorePaymentServiceImpl implements CorePaymentService {
  private readonly prisma = getPrismaClient();
  private readonly escrowManager: EscrowManager;
  private readonly userAccountService: UserAccountService;
  private readonly serverConfigService: ServerConfigService;
  private readonly paymentProcessorFactory: PaymentProcessorFactory;
  private readonly paymentValidationService: PaymentValidationService;
  private readonly transactionManagementService: TransactionManagementService;
  private readonly defaultCurrency = 'USD';
  private readonly escrowFeePercentage = 0.01; // 1% escrow fee

  constructor(
    escrowManager?: EscrowManager,
    userAccountService?: UserAccountService,
    serverConfigService?: ServerConfigService,
    paymentProcessorFactory?: PaymentProcessorFactory
  ) {
    this.paymentProcessorFactory = paymentProcessorFactory || new DefaultPaymentProcessorFactory();
    this.userAccountService = userAccountService || new UserAccountServiceImpl();
    this.serverConfigService = serverConfigService || new ServerConfigServiceImpl();
    this.escrowManager = escrowManager || new EscrowManagerImpl(this.paymentProcessorFactory);
    this.paymentValidationService = new PaymentValidationService();
    this.transactionManagementService = new TransactionManagementService();
  }

  /**
   * Initiates a new payment transaction
   */
  async initiatePayment(
    senderId: string,
    recipientId: string,
    amount: number,
    senderPaymentMethodId: string,
    recipientPaymentMethodId?: string,
    serverId?: string
  ): Promise<Transaction> {
    // Validate payment parameters
    await this.paymentValidationService.validatePaymentParameters(
      senderId,
      recipientId,
      amount,
      senderPaymentMethodId,
      serverId
    );

    // Get user accounts and payment methods
    const [senderAccount, recipientAccount] = await Promise.all([
      this.userAccountService.getAccount(senderId),
      this.userAccountService.getAccount(recipientId)
    ]);

    if (!senderAccount || !recipientAccount) {
      throw new Error('Sender or recipient account not found');
    }

    const senderPaymentMethod = senderAccount.paymentMethods.find(
      method => method.id === senderPaymentMethodId
    );

    if (!senderPaymentMethod) {
      throw new Error('Sender payment method not found');
    }

    // Calculate fees
    const fees = await this.calculateTransactionFees(amount, senderPaymentMethod.type);
    const totalAmount = amount + fees.total;

    // Create transaction record
    const transaction = await withTransaction(async (tx) => {
      const dbTransaction = await tx.transaction.create({
        data: {
          id: uuidv4(),
          senderId,
          recipientId,
          amount,
          processingFee: fees.processingFee,
          escrowFee: fees.escrowFee,
          totalFees: totalAmount,
          currency: this.defaultCurrency,
          status: this.convertToDbTransactionStatus(TransactionStatus.PENDING),
          senderPaymentMethodId: senderPaymentMethodId,
          recipientPaymentMethodId: recipientPaymentMethodId || null
        }
      });

      // Create escrow record using holdFunds
      await this.escrowManager.holdFunds(
        dbTransaction.id,
        amount,
        this.convertToDbPaymentMethodType(senderPaymentMethod.type)
      );

      // Convert DB transaction to domain model
      return {
        id: dbTransaction.id,
        senderId: dbTransaction.senderId,
        recipientId: dbTransaction.recipientId,
        amount: dbTransaction.amount,
        currency: dbTransaction.currency,
        senderPaymentMethod,
        recipientPaymentMethod: undefined,
        status: TransactionStatus.PENDING,
        escrowRecord: undefined,
        fees: {
          processingFee: dbTransaction.processingFee,
          escrowFee: dbTransaction.escrowFee,
          total: dbTransaction.totalFees,
        },
        createdAt: dbTransaction.createdAt,
        completedAt: dbTransaction.completedAt || undefined,
        failureReason: dbTransaction.failureReason || undefined,
      };
    });

    // Process the payment
    await this.processPaymentTransaction(transaction, senderPaymentMethod);

    return transaction;
  }

  /**
   * Processes a payment request (approval/rejection)
   */
  async processPaymentRequest(requestId: string, approved: boolean): Promise<void> {
    const transaction = await this.transactionManagementService.getTransaction(requestId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (approved) {
      // Get recipient payment method for release
      const recipientAccount = await this.userAccountService.getAccount(transaction.recipientId);
      const recipientPaymentMethod = recipientAccount?.paymentMethods.find(m => m.isActive);
      
      if (recipientPaymentMethod) {
        await this.escrowManager.releaseFunds(
          requestId,
          this.convertToDbPaymentMethodType(recipientPaymentMethod.type)
        );
      }
      
      await this.transactionManagementService.updateTransactionStatus(
        requestId,
        TransactionStatus.COMPLETED
      );
    } else {
      await this.escrowManager.returnFunds(requestId);
      await this.transactionManagementService.updateTransactionStatus(
        requestId,
        TransactionStatus.CANCELLED
      );
    }
  }

  /**
   * Processes the actual payment transaction
   */
  private async processPaymentTransaction(
    transaction: Transaction,
    senderPaymentMethod: PaymentMethodConfig
  ): Promise<void> {
    try {
      const processor = this.paymentProcessorFactory.createProcessor(senderPaymentMethod.type);
      // Note: PaymentProcessor interface needs to be updated to include processPayment method
      // For now, we'll skip the actual processing and just update status
      
      await this.transactionManagementService.updateTransactionStatus(
        transaction.id,
        TransactionStatus.ESCROWED
      );
    } catch (error) {
      await this.transactionManagementService.updateTransactionStatus(
        transaction.id,
        TransactionStatus.FAILED,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Calculate transaction fees
   */
  private async calculateTransactionFees(
    amount: number,
    paymentMethodType: PaymentMethodType
  ): Promise<{ processingFee: number; escrowFee: number; total: number }> {
    const processingFee = amount * 0.029 + 0.30; // 2.9% + $0.30
    const escrowFee = amount * this.escrowFeePercentage;
    
    return {
      processingFee,
      escrowFee,
      total: processingFee + escrowFee
    };
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
      case TransactionStatus.CANCELLED:
        return 'CANCELLED';
      case TransactionStatus.FAILED:
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }
}
