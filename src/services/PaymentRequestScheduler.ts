// Payment request scheduler for handling expiration cleanup
import { PaymentRequestService } from './PaymentRequestService';

export interface PaymentRequestScheduler {
    start(): void;
    stop(): void;
    expireOldRequests(): Promise<number>;
}

export class PaymentRequestSchedulerImpl implements PaymentRequestScheduler {
    private intervalId: NodeJS.Timeout | null = null;
    private readonly intervalMs: number;

    constructor(
        private readonly paymentRequestService: PaymentRequestService,
        intervalMinutes: number = 5 // Check every 5 minutes by default
    ) {
        this.intervalMs = intervalMinutes * 60 * 1000;
    }

    start(): void {
        if (this.intervalId) {
            console.warn('⚠️ Oink... payment request scheduler is already running 🐷');
            return;
        }

        console.log('🐷 Oink! Starting payment request scheduler... 🐽');

        // Run immediately on start
        this.expireOldRequests().catch(error => {
            console.error('❌ Oink... error in initial payment request expiration check:', error);
        });

        // Then run on interval
        this.intervalId = setInterval(async () => {
            try {
                await this.expireOldRequests();
            } catch (error) {
                console.error('❌ Oink... error in scheduled payment request expiration check:', error);
            }
        }, this.intervalMs);

        console.log(`🐷 Oink! Payment request scheduler started with ${this.intervalMs / 1000}s interval 🐽✨`);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('🐷 Oink! Payment request scheduler stopped 🐽');
        }
    }

    async expireOldRequests(): Promise<number> {
        try {
            const expiredCount = await this.paymentRequestService.expireOldRequests();

            if (expiredCount > 0) {
                console.log(`🐷 Oink! Expired ${expiredCount} old payment requests 🐽`);
            }

            return expiredCount;
        } catch (error) {
            console.error('❌ Oink... error expiring old payment requests:', error);
            return 0;
        }
    }
}