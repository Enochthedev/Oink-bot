// Payment request service interface and implementation
import { PaymentRequest, PaymentRequestStatus, dbToPaymentRequest, paymentRequestToDb, createExpirationDate, canRequestBeResponded } from '../models/PaymentRequest';
import { getPrismaClient, withTransaction } from '../models/database';
import { PaymentService } from './PaymentService';
import { UserAccountService } from './UserAccountService';
import { v4 as uuidv4 } from 'uuid';

export interface PaymentRequestService {
    createPaymentRequest(
        requesterId: string,
        payerId: string,
        amount: number,
        description: string,
        serverId?: string,
        expirationHours?: number
    ): Promise<PaymentRequest>;

    getPaymentRequest(requestId: string): Promise<PaymentRequest | null>;

    approvePaymentRequest(
        requestId: string,
        payerId: string,
        senderPaymentMethodId: string,
        recipientPaymentMethodId?: string
    ): Promise<PaymentRequest>;

    declinePaymentRequest(requestId: string, payerId: string): Promise<PaymentRequest>;

    cancelPaymentRequest(requestId: string, requesterId: string): Promise<PaymentRequest>;

    getPaymentRequestsForUser(
        userId: string,
        type: 'sent' | 'received',
        limit?: number,
        offset?: number
    ): Promise<PaymentRequest[]>;

    expireOldRequests(): Promise<number>; // Returns number of expired requests

    getUserPendingRequests(userId: string): Promise<PaymentRequest[]>;
}

export class PaymentRequestServiceImpl implements PaymentRequestService {
    private readonly prisma = getPrismaClient();
    private readonly defaultCurrency = 'USD';

    constructor(
        private readonly paymentService: PaymentService,
        private readonly userAccountService: UserAccountService
    ) { }

    async createPaymentRequest(
        requesterId: string,
        payerId: string,
        amount: number,
        description: string,
        serverId?: string,
        expirationHours: number = 24
    ): Promise<PaymentRequest> {
        // Validate input parameters
        if (!requesterId || !payerId || requesterId === payerId) {
            throw new Error('Invalid requester or payer ID');
        }

        if (!amount || amount <= 0 || !Number.isFinite(amount)) {
            throw new Error('Invalid payment amount');
        }

        if (!description || description.trim().length === 0) {
            throw new Error('Description is required');
        }

        if (description.length > 500) {
            throw new Error('Description must be 500 characters or less');
        }

        if (expirationHours <= 0 || expirationHours > 168) { // Max 1 week
            throw new Error('Expiration hours must be between 1 and 168 (1 week)');
        }

        // Verify both users exist
        const requesterAccount = await this.userAccountService.getAccount(requesterId);
        if (!requesterAccount) {
            throw new Error('Requester account not found');
        }

        const payerAccount = await this.userAccountService.getAccount(payerId);
        if (!payerAccount) {
            throw new Error('Payer account not found');
        }

        // Create payment request
        const requestId = uuidv4();
        const expiresAt = createExpirationDate(expirationHours);

        const paymentRequest: PaymentRequest = {
            id: requestId,
            requesterId,
            payerId,
            amount,
            currency: this.defaultCurrency,
            description: description.trim(),
            status: PaymentRequestStatus.PENDING,
            serverId,
            expiresAt,
            createdAt: new Date(),
        };

        // Save to database
        await this.prisma.paymentRequest.create({
            data: {
                id: requestId,
                ...paymentRequestToDb(paymentRequest),
            }
        });

        return paymentRequest;
    }

    async getPaymentRequest(requestId: string): Promise<PaymentRequest | null> {
        if (!requestId) {
            throw new Error('Request ID is required');
        }

        const dbRequest = await this.prisma.paymentRequest.findUnique({
            where: { id: requestId }
        });

        if (!dbRequest) {
            return null;
        }

        return dbToPaymentRequest(dbRequest as any);
    }

    async approvePaymentRequest(
        requestId: string,
        payerId: string,
        senderPaymentMethodId: string,
        recipientPaymentMethodId?: string
    ): Promise<PaymentRequest> {
        if (!requestId || !payerId || !senderPaymentMethodId) {
            throw new Error('Request ID, payer ID, and sender payment method ID are required');
        }

        return await withTransaction(async (tx) => {
            // Get the payment request
            const dbRequest = await tx.paymentRequest.findUnique({
                where: { id: requestId }
            });

            if (!dbRequest) {
                throw new Error('Payment request not found');
            }

            const request = dbToPaymentRequest(dbRequest as any);

            // Verify the payer is authorized to approve this request
            if (request.payerId !== payerId) {
                throw new Error('Unauthorized to approve this payment request');
            }

            // Check if request can be responded to
            if (!canRequestBeResponded(request)) {
                throw new Error('Payment request cannot be approved (expired or already responded)');
            }

            // Initiate the payment
            const transaction = await this.paymentService.initiatePayment(
                payerId, // The payer becomes the sender
                request.requesterId, // The requester becomes the recipient
                request.amount,
                senderPaymentMethodId,
                recipientPaymentMethodId,
                request.serverId
            );

            // Update the payment request
            const updatedRequest = await tx.paymentRequest.update({
                where: { id: requestId },
                data: {
                    status: PaymentRequestStatus.APPROVED,
                    respondedAt: new Date(),
                    transactionId: transaction.id,
                }
            });

            return dbToPaymentRequest(updatedRequest as any);
        });
    }

    async declinePaymentRequest(requestId: string, payerId: string): Promise<PaymentRequest> {
        if (!requestId || !payerId) {
            throw new Error('Request ID and payer ID are required');
        }

        return await withTransaction(async (tx) => {
            // Get the payment request
            const dbRequest = await tx.paymentRequest.findUnique({
                where: { id: requestId }
            });

            if (!dbRequest) {
                throw new Error('Payment request not found');
            }

            const request = dbToPaymentRequest(dbRequest as any);

            // Verify the payer is authorized to decline this request
            if (request.payerId !== payerId) {
                throw new Error('Unauthorized to decline this payment request');
            }

            // Check if request can be responded to
            if (!canRequestBeResponded(request)) {
                throw new Error('Payment request cannot be declined (expired or already responded)');
            }

            // Update the payment request
            const updatedRequest = await tx.paymentRequest.update({
                where: { id: requestId },
                data: {
                    status: PaymentRequestStatus.DECLINED,
                    respondedAt: new Date(),
                }
            });

            return dbToPaymentRequest(updatedRequest as any);
        });
    }

    async cancelPaymentRequest(requestId: string, requesterId: string): Promise<PaymentRequest> {
        if (!requestId || !requesterId) {
            throw new Error('Request ID and requester ID are required');
        }

        return await withTransaction(async (tx) => {
            // Get the payment request
            const dbRequest = await tx.paymentRequest.findUnique({
                where: { id: requestId }
            });

            if (!dbRequest) {
                throw new Error('Payment request not found');
            }

            const request = dbToPaymentRequest(dbRequest as any);

            // Verify the requester is authorized to cancel this request
            if (request.requesterId !== requesterId) {
                throw new Error('Unauthorized to cancel this payment request');
            }

            // Check if request can be cancelled
            if (request.status !== PaymentRequestStatus.PENDING) {
                throw new Error('Only pending payment requests can be cancelled');
            }

            // Update the payment request
            const updatedRequest = await tx.paymentRequest.update({
                where: { id: requestId },
                data: {
                    status: PaymentRequestStatus.CANCELLED,
                    respondedAt: new Date(),
                }
            });

            return dbToPaymentRequest(updatedRequest as any);
        });
    }

    async getPaymentRequestsForUser(
        userId: string,
        type: 'sent' | 'received',
        limit: number = 50,
        offset: number = 0
    ): Promise<PaymentRequest[]> {
        if (!userId) {
            throw new Error('User ID is required');
        }

        if (limit <= 0 || limit > 100) {
            throw new Error('Limit must be between 1 and 100');
        }

        if (offset < 0) {
            throw new Error('Offset must be non-negative');
        }

        const whereClause = type === 'sent'
            ? { requesterId: userId }
            : { payerId: userId };

        const dbRequests = await this.prisma.paymentRequest.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset
        });

        return dbRequests.map(req => dbToPaymentRequest(req as any));
    }

    async expireOldRequests(): Promise<number> {
        const now = new Date();

        const result = await this.prisma.paymentRequest.updateMany({
            where: {
                status: PaymentRequestStatus.PENDING,
                expiresAt: {
                    lt: now
                }
            },
            data: {
                status: PaymentRequestStatus.EXPIRED,
                respondedAt: now,
            }
        });

        return result.count;
    }

    async getUserPendingRequests(userId: string): Promise<PaymentRequest[]> {
        if (!userId) {
            throw new Error('User ID is required');
        }

        const dbRequests = await this.prisma.paymentRequest.findMany({
            where: {
                payerId: userId,
                status: PaymentRequestStatus.PENDING,
                expiresAt: {
                    gt: new Date() // Not expired
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return dbRequests.map(req => dbToPaymentRequest(req as any));
    }
}