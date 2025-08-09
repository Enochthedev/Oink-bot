import { SecurityError } from './ErrorHandler';

// Input validation patterns
const PATTERNS = {
    DISCORD_ID: /^\d{17,19}$/,
    AMOUNT: /^\d+(\.\d{1,2})?$/,
    CURRENCY: /^[A-Z]{3}$/,
    ALPHANUMERIC: /^[a-zA-Z0-9\s\-_]+$/,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    WALLET_ADDRESS: /^[a-zA-Z0-9]{26,62}$/,
    BANK_ROUTING: /^\d{9}$/,
    BANK_ACCOUNT: /^\d{4,17}$/,
};

// Input length limits
const LIMITS = {
    DESCRIPTION_MAX: 500,
    USERNAME_MAX: 32,
    PAYMENT_METHOD_NAME_MAX: 50,
    TRANSACTION_ID_MAX: 64,
    MIN_AMOUNT: 0.01,
    MAX_AMOUNT: 10000,
};

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    sanitizedValue?: any;
}

export class InputValidator {
    /**
     * Sanitize string input by removing potentially dangerous characters
     */
    static sanitizeString(input: string): string {
        if (typeof input !== 'string') {
            throw new SecurityError('Input must be a string', 'INVALID_INPUT_TYPE');
        }

        return input
            .trim()
            .replace(/[<>'"&;|`$(){}[\]\\]/g, '') // Remove dangerous characters
            .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
            .replace(/--/g, '') // Remove SQL comment markers
            .replace(/\/\*/g, '') // Remove SQL comment start
            .replace(/\*\//g, '') // Remove SQL comment end
            .substring(0, 1000); // Limit length
    }

    /**
     * Validate Discord user ID
     */
    static validateDiscordId(id: string): ValidationResult {
        const errors: string[] = [];

        if (!id || typeof id !== 'string') {
            errors.push('Discord ID is required and must be a string');
        } else if (!PATTERNS.DISCORD_ID.test(id)) {
            errors.push('Invalid Discord ID format');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: errors.length === 0 ? id : undefined,
        };
    }

    /**
     * Validate and sanitize payment amount
     */
    static validateAmount(amount: number | string): ValidationResult {
        const errors: string[] = [];
        let numericAmount: number;

        if (typeof amount === 'string') {
            if (!PATTERNS.AMOUNT.test(amount)) {
                errors.push('Invalid amount format');
                return { isValid: false, errors };
            }
            numericAmount = parseFloat(amount);
        } else if (typeof amount === 'number') {
            numericAmount = amount;
        } else {
            errors.push('Amount must be a number or numeric string');
            return { isValid: false, errors };
        }

        if (isNaN(numericAmount) || !isFinite(numericAmount)) {
            errors.push('Amount must be a valid number');
        } else if (numericAmount < LIMITS.MIN_AMOUNT) {
            errors.push(`Amount must be at least ${LIMITS.MIN_AMOUNT}`);
        } else if (numericAmount > LIMITS.MAX_AMOUNT) {
            errors.push(`Amount cannot exceed ${LIMITS.MAX_AMOUNT}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: errors.length === 0 ? Math.round(numericAmount * 100) / 100 : undefined,
        };
    }

    /**
     * Validate currency code
     */
    static validateCurrency(currency: string): ValidationResult {
        const errors: string[] = [];

        if (!currency || typeof currency !== 'string') {
            errors.push('Currency is required and must be a string');
        } else {
            const upperCurrency = currency.toUpperCase();
            if (!PATTERNS.CURRENCY.test(upperCurrency)) {
                errors.push('Invalid currency format (must be 3-letter code)');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: errors.length === 0 ? currency.toUpperCase() : undefined,
        };
    }

    /**
     * Validate and sanitize description text
     */
    static validateDescription(description: string): ValidationResult {
        const errors: string[] = [];

        if (typeof description !== 'string') {
            errors.push('Description must be a string');
            return { isValid: false, errors };
        }

        const sanitized = this.sanitizeString(description);

        if (sanitized.length > LIMITS.DESCRIPTION_MAX) {
            errors.push(`Description cannot exceed ${LIMITS.DESCRIPTION_MAX} characters`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: errors.length === 0 ? sanitized : undefined,
        };
    }

    /**
     * Validate wallet address format
     */
    static validateWalletAddress(address: string): ValidationResult {
        const errors: string[] = [];

        if (!address || typeof address !== 'string') {
            errors.push('Wallet address is required and must be a string');
        } else if (!PATTERNS.WALLET_ADDRESS.test(address)) {
            errors.push('Invalid wallet address format');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: errors.length === 0 ? address : undefined,
        };
    }

    /**
     * Validate bank routing number
     */
    static validateBankRouting(routing: string): ValidationResult {
        const errors: string[] = [];

        if (!routing || typeof routing !== 'string') {
            errors.push('Bank routing number is required and must be a string');
        } else if (!PATTERNS.BANK_ROUTING.test(routing)) {
            errors.push('Invalid bank routing number format');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: errors.length === 0 ? routing : undefined,
        };
    }

    /**
     * Validate bank account number
     */
    static validateBankAccount(account: string): ValidationResult {
        const errors: string[] = [];

        if (!account || typeof account !== 'string') {
            errors.push('Bank account number is required and must be a string');
        } else if (!PATTERNS.BANK_ACCOUNT.test(account)) {
            errors.push('Invalid bank account number format');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: errors.length === 0 ? account : undefined,
        };
    }

    /**
     * Validate payment method name
     */
    static validatePaymentMethodName(name: string): ValidationResult {
        const errors: string[] = [];

        if (!name || typeof name !== 'string') {
            errors.push('Payment method name is required and must be a string');
            return { isValid: false, errors };
        }

        const sanitized = this.sanitizeString(name);

        if (sanitized.length === 0) {
            errors.push('Payment method name cannot be empty after sanitization');
        } else if (sanitized.length > LIMITS.PAYMENT_METHOD_NAME_MAX) {
            errors.push(`Payment method name cannot exceed ${LIMITS.PAYMENT_METHOD_NAME_MAX} characters`);
        } else if (!PATTERNS.ALPHANUMERIC.test(sanitized)) {
            errors.push('Payment method name contains invalid characters');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: errors.length === 0 ? sanitized : undefined,
        };
    }

    /**
     * Validate transaction ID
     */
    static validateTransactionId(id: string): ValidationResult {
        const errors: string[] = [];

        if (!id || typeof id !== 'string') {
            errors.push('Transaction ID is required and must be a string');
        } else if (id.length > LIMITS.TRANSACTION_ID_MAX) {
            errors.push(`Transaction ID cannot exceed ${LIMITS.TRANSACTION_ID_MAX} characters`);
        } else if (!PATTERNS.ALPHANUMERIC.test(id.replace(/[-_]/g, ''))) {
            errors.push('Transaction ID contains invalid characters');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: errors.length === 0 ? id : undefined,
        };
    }

    /**
     * Validate cryptocurrency address
     */
    static validateCryptoAddress(address: string, cryptoType: string): ValidationResult {
        const errors: string[] = [];

        if (!address || typeof address !== 'string') {
            errors.push('Cryptocurrency address is required');
            return { isValid: false, errors };
        }

        const sanitized = this.sanitizeString(address);

        // Basic validation for different crypto types
        switch (cryptoType.toUpperCase()) {
            case 'BTC':
                // Bitcoin address validation (simplified)
                if (!/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(sanitized) &&
                    !/^bc1[a-z0-9]{39,59}$/.test(sanitized)) {
                    errors.push('Invalid Bitcoin address format');
                }
                break;
            case 'ETH':
                // Ethereum address validation
                if (!/^0x[a-fA-F0-9]{40}$/.test(sanitized)) {
                    errors.push('Invalid Ethereum address format');
                }
                break;
            default:
                // Generic crypto address validation
                if (!/^[a-zA-Z0-9]{26,62}$/.test(sanitized)) {
                    errors.push('Invalid cryptocurrency address format');
                }
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: errors.length === 0 ? sanitized : undefined,
        };
    }

    /**
     * Validate routing number
     */
    static validateRoutingNumber(routing: string): ValidationResult {
        const errors: string[] = [];

        if (!routing || typeof routing !== 'string') {
            errors.push('Routing number is required');
            return { isValid: false, errors };
        }

        const sanitized = this.sanitizeString(routing);

        if (!PATTERNS.BANK_ROUTING.test(sanitized)) {
            errors.push('Routing number must be exactly 9 digits');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: errors.length === 0 ? sanitized : undefined,
        };
    }

    /**
     * Comprehensive validation for command parameters
     */
    static validateCommandParams(params: Record<string, any>): ValidationResult {
        const errors: string[] = [];
        const sanitizedParams: Record<string, any> = {};

        for (const [key, value] of Object.entries(params)) {
            if (value === null || value === undefined) {
                continue; // Skip null/undefined values
            }

            switch (key) {
                case 'userId':
                case 'recipientId':
                case 'senderId':
                    const idResult = this.validateDiscordId(value);
                    if (!idResult.isValid) {
                        errors.push(...idResult.errors.map(err => `${key}: ${err}`));
                    } else {
                        sanitizedParams[key] = idResult.sanitizedValue;
                    }
                    break;

                case 'amount':
                    const amountResult = this.validateAmount(value);
                    if (!amountResult.isValid) {
                        errors.push(...amountResult.errors.map(err => `${key}: ${err}`));
                    } else {
                        sanitizedParams[key] = amountResult.sanitizedValue;
                    }
                    break;

                case 'currency':
                    const currencyResult = this.validateCurrency(value);
                    if (!currencyResult.isValid) {
                        errors.push(...currencyResult.errors.map(err => `${key}: ${err}`));
                    } else {
                        sanitizedParams[key] = currencyResult.sanitizedValue;
                    }
                    break;

                case 'description':
                    const descResult = this.validateDescription(value);
                    if (!descResult.isValid) {
                        errors.push(...descResult.errors.map(err => `${key}: ${err}`));
                    } else {
                        sanitizedParams[key] = descResult.sanitizedValue;
                    }
                    break;

                case 'transactionId':
                    const txResult = this.validateTransactionId(value);
                    if (!txResult.isValid) {
                        errors.push(...txResult.errors.map(err => `${key}: ${err}`));
                    } else {
                        sanitizedParams[key] = txResult.sanitizedValue;
                    }
                    break;

                default:
                    // For unknown parameters, apply basic string sanitization
                    if (typeof value === 'string') {
                        sanitizedParams[key] = this.sanitizeString(value);
                    } else {
                        sanitizedParams[key] = value;
                    }
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: errors.length === 0 ? sanitizedParams : undefined,
        };
    }
}