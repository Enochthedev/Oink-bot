// Database seeding script for development and testing
import { PrismaClient, PaymentMethodType, TransactionStatus, EscrowStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting database seeding...');

    // Create test user accounts
    const user1 = await prisma.userAccount.create({
        data: {
            discordId: '123456789012345678',
            transactionHistoryJson: '[]',
            enableDMNotifications: true,
            enableChannelNotifications: false,
            isSetupComplete: true,
            isPublicProfile: false,
        },
    });

    const user2 = await prisma.userAccount.create({
        data: {
            discordId: '987654321098765432',
            transactionHistoryJson: '[]',
            enableDMNotifications: true,
            enableChannelNotifications: true,
            isSetupComplete: true,
            isPublicProfile: true,
        },
    });

    console.log('Created test users:', { user1: user1.id, user2: user2.id });

    // Create payment methods for users
    const cryptoMethod1 = await prisma.paymentMethodConfig.create({
        data: {
            userId: user1.id,
            type: PaymentMethodType.CRYPTO,
            displayName: 'Bitcoin Wallet',
            encryptedDetails: 'encrypted_bitcoin_address_123',
            isActive: true,
        },
    });

    const achMethod1 = await prisma.paymentMethodConfig.create({
        data: {
            userId: user1.id,
            type: PaymentMethodType.ACH,
            displayName: 'Chase Checking',
            encryptedDetails: 'encrypted_bank_details_123',
            isActive: true,
        },
    });

    const cryptoMethod2 = await prisma.paymentMethodConfig.create({
        data: {
            userId: user2.id,
            type: PaymentMethodType.CRYPTO,
            displayName: 'Ethereum Wallet',
            encryptedDetails: 'encrypted_ethereum_address_456',
            isActive: true,
        },
    });

    console.log('Created payment methods:', {
        crypto1: cryptoMethod1.id,
        ach1: achMethod1.id,
        crypto2: cryptoMethod2.id,
    });

    // Create a test server configuration
    const serverConfig = await prisma.serverConfig.create({
        data: {
            serverId: '555666777888999000',
            paymentsEnabled: true,
            maxAmountPerUser: 1000,
            maxTransactionsPerUser: 10,
            allowedPaymentMethodsJson: '["CRYPTO","ACH","OTHER"]',
            adminUserIdsJson: '["123456789012345678"]',
        },
    });

    console.log('Created server config:', serverConfig.id);

    // Create a test transaction
    const transaction = await prisma.transaction.create({
        data: {
            senderId: user1.id,
            recipientId: user2.id,
            amount: 50.0,
            currency: 'USD',
            senderPaymentMethodId: cryptoMethod1.id,
            recipientPaymentMethodId: cryptoMethod2.id,
            status: TransactionStatus.ESCROWED,
            processingFee: 1.5,
            escrowFee: 0.5,
            totalFees: 2.0,
        },
    });

    console.log('Created test transaction:', transaction.id);

    // Create an escrow record for the transaction
    const escrowRecord = await prisma.escrowRecord.create({
        data: {
            transactionId: transaction.id,
            amount: 50.0,
            currency: 'USD',
            paymentMethod: PaymentMethodType.CRYPTO,
            externalTransactionId: 'ext_crypto_tx_123456',
            status: EscrowStatus.HOLDING,
        },
    });

    console.log('Created escrow record:', escrowRecord.id);

    // Update user transaction histories
    await prisma.userAccount.update({
        where: { id: user1.id },
        data: {
            transactionHistoryJson: JSON.stringify([transaction.id]),
        },
    });

    await prisma.userAccount.update({
        where: { id: user2.id },
        data: {
            transactionHistoryJson: JSON.stringify([transaction.id]),
        },
    });

    console.log('Updated user transaction histories');
    console.log('Database seeding completed successfully!');
}

main()
    .catch((e) => {
        console.error('Error during seeding:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });