// TransactionDataHandler handles data operations for transactions
import { PaymentService } from '../../services/PaymentService';
import { UserAccountService } from '../../services/UserAccountService';

export class TransactionDataHandler {
    private paymentService: PaymentService;
    private userAccountService: UserAccountService;

    constructor(paymentService: PaymentService, userAccountService: UserAccountService) {
        this.paymentService = paymentService;
        this.userAccountService = userAccountService;
    }

    /**
     * Get transaction history for a user
     */
    public async getTransactionHistory(userId: string, limit: number = 10): Promise<any[]> {
        try {
            return await this.paymentService.getTransactionHistory(userId, limit);
        } catch (error) {
            console.error('Error getting transaction history:', error);
            throw error;
        }
    }

    /**
     * Get a specific transaction
     */
    public async getTransaction(transactionId: string): Promise<any | null> {
        try {
            return await this.paymentService.getTransaction(transactionId);
        } catch (error) {
            console.error('Error getting transaction:', error);
            throw error;
        }
    }

    /**
     * Get filtered transactions
     */
    public async getFilteredTransactions(userId: string, filterType: string): Promise<any[]> {
        try {
            const allTransactions = await this.paymentService.getTransactionHistory(userId, 1000);
            return this.applyFilter(allTransactions, filterType);
        } catch (error) {
            console.error('Error getting filtered transactions:', error);
            throw error;
        }
    }

    /**
     * Export transactions to CSV
     */
    public async exportTransactionsToCSV(userId: string): Promise<string> {
        try {
            const transactions = await this.paymentService.getTransactionHistory(userId, 1000);
            return this.createCSVContent(transactions);
        } catch (error) {
            console.error('Error exporting transactions:', error);
            throw error;
        }
    }

    /**
     * Validate user account
     */
    public async validateUserAccount(userId: string): Promise<boolean> {
        try {
            const account = await this.userAccountService.getAccount(userId);
            return account !== null;
        } catch (error) {
            console.error('Error validating user account:', error);
            return false;
        }
    }

    /**
     * Apply filter to transactions
     */
    private applyFilter(transactions: any[], filterType: string): any[] {
        switch (filterType) {
            case 'completed':
                return transactions.filter(t => t.status === 'COMPLETED');
            case 'pending':
                return transactions.filter(t => t.status === 'PENDING');
            case 'failed':
                return transactions.filter(t => t.status === 'FAILED');
            case 'incoming':
                return transactions.filter(t => t.amount > 0);
            case 'outgoing':
                return transactions.filter(t => t.amount < 0);
            default:
                return transactions;
        }
    }

    /**
     * Create CSV content from transactions
     */
    private createCSVContent(transactions: any[]): string {
        const headers = ['ID', 'Description', 'Amount', 'Status', 'Created At', 'Updated At'];
        const rows = transactions.map(t => [
            t.id,
            t.description || '',
            t.amount,
            t.status,
            t.createdAt.toISOString(),
            t.updatedAt.toISOString()
        ]);

        return [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
    }
}
