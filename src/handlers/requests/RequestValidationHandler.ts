import { CommandInteraction, User } from 'discord.js';
import { UserAccountService } from '../../services/UserAccountService';

export interface ValidationResult {
    isValid: boolean;
    errorMessage?: string;
}

export class RequestValidationHandler {
    /**
     * Validate a payment request
     */
    public async validateRequest(
        interaction: CommandInteraction,
        requesterId: string,
        payerId: string,
        payer: User,
        amount: number
    ): Promise<ValidationResult> {
        // Check if user is trying to request from themselves
        if (requesterId === payerId) {
            return {
                isValid: false,
                errorMessage: '❌ You cannot request payment from yourself.'
            };
        }

        // Check if amount is valid
        if (amount <= 0) {
            return {
                isValid: false,
                errorMessage: '❌ Amount must be greater than $0.'
            };
        }

        // Check if amount is reasonable (max $10,000)
        if (amount > 10000) {
            return {
                isValid: false,
                errorMessage: '❌ Amount cannot exceed $10,000.'
            };
        }

        // Check if payer is a bot
        if (payer.bot) {
            return {
                isValid: false,
                errorMessage: '❌ Cannot request payment from a bot.'
            };
        }

        return { isValid: true };
    }

    /**
     * Validate user permissions for creating requests
     */
    public validateUserPermissions(interaction: CommandInteraction): ValidationResult {
        // Check if user has permission to create payment requests
        if (!interaction.memberPermissions?.has('SendMessages')) {
            return {
                isValid: false,
                errorMessage: '❌ You do not have permission to create payment requests.'
            };
        }

        return { isValid: true };
    }
}
