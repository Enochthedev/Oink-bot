import crypto from 'crypto';
import { SecurityError } from './ErrorHandler';
import { config } from '../config/environment';
import { logger } from './Logger';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits

export interface EncryptedData {
    encrypted: string;
    iv: string;
    tag: string;
    salt?: string;
}

export interface TokenizedData {
    token: string;
    metadata?: Record<string, any>;
}

export class EncryptionService {
    private static instance: EncryptionService;
    private masterKey!: Buffer; // Use definite assignment assertion
    private tokenStore: Map<string, string> = new Map(); // In production, use secure storage

    private constructor() {
        this.initializeMasterKey();
    }

    public static getInstance(): EncryptionService {
        if (!EncryptionService.instance) {
            EncryptionService.instance = new EncryptionService();
        }
        return EncryptionService.instance;
    }

    /**
     * Initialize the master encryption key
     */
    private initializeMasterKey(): void {
        const encryptionKey = config.ENCRYPTION_KEY;

        if (!encryptionKey) {
            throw new SecurityError(
                'Encryption key not configured',
                'MISSING_ENCRYPTION_KEY',
                'System configuration error'
            );
        }

        if (encryptionKey.length < 32) {
            throw new SecurityError(
                'Encryption key too short',
                'WEAK_ENCRYPTION_KEY',
                'System configuration error'
            );
        }

        // Derive a consistent key from the provided key
        this.masterKey = crypto.scryptSync(encryptionKey, 'payment-bot-salt', KEY_LENGTH);
    }

    /**
     * Encrypt sensitive data
     */
    encrypt(plaintext: string, useRandomSalt: boolean = false): EncryptedData {
        try {
            const iv = crypto.randomBytes(IV_LENGTH);
            let key = this.masterKey;
            let salt: Buffer | undefined;

            // Use additional salt for extra security if requested
            if (useRandomSalt) {
                salt = crypto.randomBytes(SALT_LENGTH);
                key = crypto.scryptSync(this.masterKey, salt, KEY_LENGTH);
            }

            const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
            cipher.setAAD(Buffer.from('payment-bot-aad')); // Additional authenticated data

            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            const tag = cipher.getAuthTag();

            const result: EncryptedData = {
                encrypted,
                iv: iv.toString('hex'),
                tag: tag.toString('hex'),
            };

            if (salt) {
                result.salt = salt.toString('hex');
            }

            return result;
        } catch (error) {
            logger.error('Encryption failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new SecurityError(
                'Failed to encrypt data',
                'ENCRYPTION_FAILED',
                'Unable to secure sensitive data'
            );
        }
    }

    /**
     * Decrypt sensitive data
     */
    decrypt(encryptedData: EncryptedData): string {
        try {
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const tag = Buffer.from(encryptedData.tag, 'hex');
            let key = this.masterKey;

            // Handle additional salt if present
            if (encryptedData.salt) {
                const salt = Buffer.from(encryptedData.salt, 'hex');
                key = crypto.scryptSync(this.masterKey, salt, KEY_LENGTH);
            }

            const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
            decipher.setAAD(Buffer.from('payment-bot-aad'));
            decipher.setAuthTag(tag);

            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            logger.error('Decryption failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new SecurityError(
                'Failed to decrypt data',
                'DECRYPTION_FAILED',
                'Unable to decrypt sensitive data'
            );
        }
    }

    /**
     * Create a secure token for sensitive data (tokenization)
     */
    tokenize(sensitiveData: string, metadata?: Record<string, any>): TokenizedData {
        try {
            // Generate a random token
            const token = crypto.randomBytes(32).toString('hex');

            // Encrypt the sensitive data
            const encrypted = this.encrypt(sensitiveData, true);

            // Store the mapping (in production, use secure database)
            this.tokenStore.set(token, JSON.stringify(encrypted));

            logger.info('Data tokenized', {
                tokenLength: token.length,
                hasMetadata: !!metadata,
            });

            return {
                token,
                metadata,
            };
        } catch (error) {
            logger.error('Tokenization failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new SecurityError(
                'Failed to tokenize data',
                'TOKENIZATION_FAILED',
                'Unable to secure sensitive data'
            );
        }
    }

    /**
     * Retrieve original data from token (detokenization)
     */
    detokenize(token: string): string {
        try {
            const encryptedDataStr = this.tokenStore.get(token);

            if (!encryptedDataStr) {
                throw new SecurityError(
                    'Token not found',
                    'INVALID_TOKEN',
                    'Invalid or expired token'
                );
            }

            const encryptedData: EncryptedData = JSON.parse(encryptedDataStr);
            return this.decrypt(encryptedData);
        } catch (error) {
            if (error instanceof SecurityError) {
                throw error;
            }

            logger.error('Detokenization failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new SecurityError(
                'Failed to detokenize data',
                'DETOKENIZATION_FAILED',
                'Unable to retrieve original data'
            );
        }
    }

    /**
     * Remove a token and its associated data
     */
    revokeToken(token: string): boolean {
        const existed = this.tokenStore.has(token);
        this.tokenStore.delete(token);

        if (existed) {
            logger.info('Token revoked', { token: token.substring(0, 8) + '...' });
        }

        return existed;
    }

    /**
     * Hash sensitive data for comparison (one-way)
     */
    hash(data: string, salt?: string): string {
        try {
            const actualSalt = salt || crypto.randomBytes(SALT_LENGTH).toString('hex');
            const hash = crypto.scryptSync(data, actualSalt, 64);
            return `${actualSalt}:${hash.toString('hex')}`;
        } catch (error) {
            logger.error('Hashing failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new SecurityError(
                'Failed to hash data',
                'HASHING_FAILED',
                'Unable to process data'
            );
        }
    }

    /**
     * Verify hashed data
     */
    verifyHash(data: string, hashedData: string): boolean {
        try {
            const [salt, hash] = hashedData.split(':');
            const newHash = crypto.scryptSync(data, salt, 64);
            return hash === newHash.toString('hex');
        } catch (error) {
            logger.error('Hash verification failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
        }
    }

    /**
     * Generate a secure random string
     */
    generateSecureRandom(length: number = 32): string {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Generate a cryptographically secure UUID
     */
    generateSecureUUID(): string {
        return crypto.randomUUID();
    }

    /**
     * Securely compare two strings (timing-safe)
     */
    secureCompare(a: string, b: string): boolean {
        if (a.length !== b.length) {
            return false;
        }

        const bufferA = Buffer.from(a);
        const bufferB = Buffer.from(b);

        return crypto.timingSafeEqual(bufferA, bufferB);
    }

    /**
     * Clean up sensitive data from memory
     */
    clearSensitiveData(): void {
        // Clear token store
        this.tokenStore.clear();

        // In production, you might want to:
        // 1. Overwrite memory locations
        // 2. Force garbage collection
        // 3. Clear any cached keys

        logger.info('Sensitive data cleared from memory');
    }
}

// Specialized encryption for different data types
export class PaymentDataEncryption {
    private encryption = EncryptionService.getInstance();

    /**
     * Encrypt bank account information
     */
    encryptBankAccount(accountNumber: string, routingNumber: string): EncryptedData {
        const bankData = JSON.stringify({
            account: accountNumber,
            routing: routingNumber,
            type: 'bank',
            timestamp: Date.now(),
        });

        return this.encryption.encrypt(bankData, true);
    }

    /**
     * Decrypt bank account information
     */
    decryptBankAccount(encryptedData: EncryptedData): { account: string; routing: string } {
        const decrypted = this.encryption.decrypt(encryptedData);
        const bankData = JSON.parse(decrypted);

        if (bankData.type !== 'bank') {
            throw new SecurityError(
                'Invalid bank data type',
                'INVALID_DATA_TYPE',
                'Data corruption detected'
            );
        }

        return {
            account: bankData.account,
            routing: bankData.routing,
        };
    }

    /**
     * Tokenize cryptocurrency wallet address
     */
    tokenizeCryptoWallet(address: string, currency: string): TokenizedData {
        const walletData = JSON.stringify({
            address,
            currency,
            type: 'crypto',
            timestamp: Date.now(),
        });

        return this.encryption.tokenize(walletData, { currency, type: 'crypto' });
    }

    /**
     * Detokenize cryptocurrency wallet address
     */
    detokenizeCryptoWallet(token: string): { address: string; currency: string } {
        const decrypted = this.encryption.detokenize(token);
        const walletData = JSON.parse(decrypted);

        if (walletData.type !== 'crypto') {
            throw new SecurityError(
                'Invalid crypto data type',
                'INVALID_DATA_TYPE',
                'Data corruption detected'
            );
        }

        return {
            address: walletData.address,
            currency: walletData.currency,
        };
    }

    /**
     * Create a masked version of sensitive data for display
     */
    maskSensitiveData(data: string, type: 'bank' | 'crypto' | 'email'): string {
        switch (type) {
            case 'bank':
                // Show only last 4 digits
                return `****${data.slice(-4)}`;
            case 'crypto':
                // Show first 6 and last 4 characters
                if (data.length <= 10) return '***';
                return `${data.slice(0, 6)}...${data.slice(-4)}`;
            case 'email':
                const [local, domain] = data.split('@');
                return `${local.slice(0, 2)}***@${domain}`;
            default:
                return '***';
        }
    }
}

// Export singleton instances
export const encryptionService = EncryptionService.getInstance();
export const paymentDataEncryption = new PaymentDataEncryption();