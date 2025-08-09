// Payment request model interfaces
import { isValidDiscordId } from './UserAccount';

export interface PaymentRequest {
    id: string;
    requesterId: string;
    payerId: string;
    amount: number;
    currency: string;
    description: string;
    status: PaymentRequestStatus;
    serverId?: string;
    expiresAt: Date;
    createdAt: Date;
    respondedAt?: Date;
    transactionId?: string; // Set when request is approved and payment is initiated
}

export enum PaymentRequestStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    DECLINED = 'DECLINED',
    EXPIRED = 'EXPIRED',
    CANCELLED = 'CANCELLED'
}

// Database model interface (matching Prisma schema)
export interface PaymentRequestDB {
    id: string;
    requesterId: string;
    payerId: string;
    amount: number;
    currency: string;
    description: string;
    status: PaymentRequestStatus;
    serverId?: string;
    expiresAt: Date;
    createdAt: Date;
    respondedAt?: Date;
    transactionId?: string;
}

// Validation functions
export function isValidPaymentRequestStatus(status: string): status is PaymentRequestStatus {
    return Object.values(PaymentRequestStatus).includes(status as PaymentRequestStatus);
}

export function isValidAmount(amount: number): boolean {
    return typeof amount === 'number' && amount > 0 && Number.isFinite(amount);
}

export function isValidCurrency(currency: string): boolean {
    return typeof currency === 'string' && /^[A-Z]{3}$/.test(currency);
}

export function isValidDescription(description: string): boolean {
    return typeof description === 'string' && description.trim().length > 0 && description.length <= 500;
}

export function isValidPaymentRequest(request: any): request is PaymentRequest {
    return (
        typeof request === 'object' &&
        typeof request.id === 'string' &&
        isValidDiscordId(request.requesterId) &&
        isValidDiscordId(request.payerId) &&
        request.requesterId !== request.payerId &&
        isValidAmount(request.amount) &&
        isValidCurrency(request.currency) &&
        isValidDescription(request.description) &&
        isValidPaymentRequestStatus(request.status) &&
        (request.serverId === undefined || typeof request.serverId === 'string') &&
        request.expiresAt instanceof Date &&
        request.createdAt instanceof Date &&
        (request.respondedAt === undefined || request.respondedAt instanceof Date) &&
        (request.transactionId === undefined || typeof request.transactionId === 'string')
    );
}

// Helper functions
export function isRequestExpired(request: PaymentRequest): boolean {
    return new Date() > request.expiresAt;
}

export function canRequestBeResponded(request: PaymentRequest): boolean {
    return request.status === PaymentRequestStatus.PENDING && !isRequestExpired(request);
}

export function createExpirationDate(hoursFromNow: number = 24): Date {
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + hoursFromNow);
    return expiration;
}

// Conversion functions between DB and domain models
export function dbToPaymentRequest(dbRequest: PaymentRequestDB): PaymentRequest {
    return {
        id: dbRequest.id,
        requesterId: dbRequest.requesterId,
        payerId: dbRequest.payerId,
        amount: dbRequest.amount,
        currency: dbRequest.currency,
        description: dbRequest.description,
        status: dbRequest.status,
        serverId: dbRequest.serverId,
        expiresAt: dbRequest.expiresAt,
        createdAt: dbRequest.createdAt,
        respondedAt: dbRequest.respondedAt,
        transactionId: dbRequest.transactionId,
    };
}

export function paymentRequestToDb(request: PaymentRequest): Omit<PaymentRequestDB, 'id' | 'createdAt'> {
    return {
        requesterId: request.requesterId,
        payerId: request.payerId,
        amount: request.amount,
        currency: request.currency,
        description: request.description,
        status: request.status,
        serverId: request.serverId,
        expiresAt: request.expiresAt,
        respondedAt: request.respondedAt,
        transactionId: request.transactionId,
    };
}