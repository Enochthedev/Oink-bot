// PaymentService orchestrates payment operations using focused services
import { Transaction, TransactionStatus } from '../models/Transaction';
import { PaymentMethodConfig } from '../models/UserAccount';
import { CorePaymentService, CorePaymentServiceImpl } from './payment/CorePaymentService';
import { PaymentHistoryService, PaymentHistoryServiceImpl } from './payment/PaymentHistoryService';
import { PaymentMethodService, PaymentMethodServiceImpl } from './payment/PaymentMethodService';
import { PaymentFeeService, PaymentFeeServiceImpl } from './payment/PaymentFeeService';
import { TransactionManagementService } from './payment/TransactionManagementService';
import { PaymentValidationService } from './payment/PaymentValidationService';
import { EscrowManager, EscrowManagerImpl } from './EscrowManager';
import { UserAccountService, UserAccountServiceImpl } from './UserAccountService';
import { ServerConfigService, ServerConfigServiceImpl } from './ServerConfigService';
import { PaymentProcessorFactory, DefaultPaymentProcessorFactory } from '../processors/PaymentProcessorFactory';

export interface PaymentService {
  // Core payment operations
  initiatePayment(
    senderId: string,
    recipientId: string,
    amount: number,
    senderPaymentMethodId: string,
    recipientPaymentMethodId?: string,
    serverId?: string
  ): Promise<Transaction>;

  processPaymentRequest(requestId: string, approved: boolean): Promise<void>;

  // Transaction management
  getTransactionHistory(
    userId: string, 
    limit?: number, 
    offset?: number
  ): Promise<Transaction[]>;

  getTransaction(transactionId: string): Promise<Transaction | null>;

  updateTransactionStatus(
    transactionId: string,
    status: TransactionStatus,
    failureReason?: string
  ): Promise<void>;

  // User activity and analytics
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

  // Payment method operations
  selectPaymentMethod(
    userId: string,
    paymentMethodId: string
  ): Promise<PaymentMethodConfig>;

  // Fee calculations
  calculateTransactionFees(
    amount: number,
    paymentMethodType: string
  ): Promise<{ 
    processingFee: number; 
    escrowFee: number; 
    total: number 
  }>;

  // Validation
  validatePaymentLimits(
    userId: string,
    amount: number,
    serverId: string
  ): Promise<boolean>;
}

export class PaymentServiceImpl implements PaymentService {
  private readonly corePaymentService: CorePaymentService;
  private readonly paymentHistoryService: PaymentHistoryService;
  private readonly paymentMethodService: PaymentMethodService;
  private readonly paymentFeeService: PaymentFeeService;
  private readonly transactionManagementService: TransactionManagementService;
  private readonly paymentValidationService: PaymentValidationService;

  constructor(
    escrowManager?: EscrowManager,
    userAccountService?: UserAccountService,
    serverConfigService?: ServerConfigService,
    paymentProcessorFactory?: PaymentProcessorFactory
  ) {
    // Initialize dependencies
    const escrowManagerInstance = escrowManager || new EscrowManagerImpl(
      paymentProcessorFactory || new DefaultPaymentProcessorFactory()
    );
    const userAccountServiceInstance = userAccountService || new UserAccountServiceImpl();
    const serverConfigServiceInstance = serverConfigService || new ServerConfigServiceImpl();
    const paymentProcessorFactoryInstance = paymentProcessorFactory || new DefaultPaymentProcessorFactory();

    // Initialize focused services
    this.corePaymentService = new CorePaymentServiceImpl(
      escrowManagerInstance,
      userAccountServiceInstance,
      serverConfigServiceInstance,
      paymentProcessorFactoryInstance
    );

    this.paymentHistoryService = new PaymentHistoryServiceImpl();
    this.paymentMethodService = new PaymentMethodServiceImpl(userAccountServiceInstance);
    this.paymentFeeService = new PaymentFeeServiceImpl(paymentProcessorFactoryInstance);
    this.transactionManagementService = new TransactionManagementService();
    this.paymentValidationService = new PaymentValidationService();
  }

  // Core payment operations - delegate to CorePaymentService
  async initiatePayment(
    senderId: string,
    recipientId: string,
    amount: number,
    senderPaymentMethodId: string,
    recipientPaymentMethodId?: string,
    serverId?: string
  ): Promise<Transaction> {
    return this.corePaymentService.initiatePayment(
      senderId,
      recipientId,
      amount,
      senderPaymentMethodId,
      recipientPaymentMethodId,
      serverId
    );
  }

  async processPaymentRequest(requestId: string, approved: boolean): Promise<void> {
    return this.corePaymentService.processPaymentRequest(requestId, approved);
  }

  // Transaction management - delegate to TransactionManagementService
  async getTransaction(transactionId: string): Promise<Transaction | null> {
    return this.paymentHistoryService.getTransaction(transactionId);
  }

  async updateTransactionStatus(
    transactionId: string,
    status: TransactionStatus,
    failureReason?: string
  ): Promise<void> {
    return this.transactionManagementService.updateTransactionStatus(
      transactionId,
      status,
      failureReason
    );
  }

  // History and analytics - delegate to PaymentHistoryService
  async getTransactionHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    return this.paymentHistoryService.getTransactionHistory(userId, limit, offset);
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
    return this.paymentHistoryService.getUserActivity(userId);
  }

  // Payment method operations - delegate to PaymentMethodService
  async selectPaymentMethod(
    userId: string,
    paymentMethodId: string
  ): Promise<PaymentMethodConfig> {
    return this.paymentMethodService.selectPaymentMethod(userId, paymentMethodId);
  }

  // Fee calculations - delegate to PaymentFeeService
  async calculateTransactionFees(
    amount: number,
    paymentMethodType: string
  ): Promise<{ 
    processingFee: number; 
    escrowFee: number; 
    total: number 
  }> {
    return this.paymentFeeService.calculateTransactionFees(amount, paymentMethodType as any);
  }

  // Validation - delegate to PaymentValidationService
  async validatePaymentLimits(
    userId: string,
    amount: number,
    serverId: string
  ): Promise<boolean> {
    return this.paymentValidationService.validatePaymentLimits(userId, amount, serverId);
  }
}