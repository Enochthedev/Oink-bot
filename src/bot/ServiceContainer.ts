
// import { PaymentCommandHandler } from '../handlers/payment/';
// import { RequestCommandHandler } from '../handlers/requests/RequestCommandHandler';
// import { TransactionCommandHandler } from '../handlers/transactions/';
// import { PaymentConfigCommandHandler } from '../handlers/config/PaymentConfigCommandHandler';
// import { SetupFlowOrchestrator } from '../handlers/setup/SetupFlowOrchestrator';
// import { ActivityCommandHandler } from '../handlers/ActivityCommandHandler';
// import { ProfileCommandHandler } from '../handlers/ProfileCommandHandler';
// import { PaymentRequestScheduler, PaymentRequestSchedulerImpl } from '../services/PaymentRequestScheduler';
// import { PaymentRequestServiceImpl } from '../services/PaymentRequestService';
// import { PaymentServiceImpl } from '../services/PaymentService';
// import { UserAccountServiceImpl } from '../services/UserAccountService';
// import { NotificationServiceImpl } from '../services/NotificationService';
// import { ServerConfigServiceImpl } from '../services/ServerConfigService';
import { ErrorHandler } from './ErrorHandler';

export class ServiceContainer {
    private static instance: ServiceContainer;
    
    // Core services - temporarily commented out
    // private _notificationService!: NotificationServiceImpl;
    // private _serverConfigService!: ServerConfigServiceImpl;
    // private _paymentService!: PaymentServiceImpl;
    // private _userAccountService!: UserAccountServiceImpl;
    // private _paymentRequestService!: PaymentRequestServiceImpl;
    // private _paymentRequestScheduler!: PaymentRequestScheduler;
    
    // Handlers - temporarily commented out
    // private _paymentHandler!: PaymentCommandHandler;
    // private _requestHandler!: RequestCommandHandler;
    // private _transactionHandler!: TransactionCommandHandler;
    // private _paymentConfigHandler!: PaymentConfigCommandHandler;
    // private _setupFlowOrchestrator!: SetupFlowOrchestrator;
    // private _activityHandler!: ActivityCommandHandler;
    // private _profileHandler!: ProfileCommandHandler;
    // private _testHandler!: any; // Test command handler
    
    // Bot utilities
    private _errorHandler!: ErrorHandler;

    private constructor() {
        this.initializeServices();
    }

    public static getInstance(): ServiceContainer {
        if (!ServiceContainer.instance) {
            ServiceContainer.instance = new ServiceContainer();
        }
        return ServiceContainer.instance;
    }

    private initializeServices(): void {
        // Initialize core services - temporarily commented out
        // this._notificationService = new NotificationServiceImpl();
        // this._serverConfigService = new ServerConfigServiceImpl();
        // this._paymentService = new PaymentServiceImpl(undefined, undefined, this._serverConfigService);
        // this._userAccountService = new UserAccountServiceImpl();
        // this._paymentRequestService = new PaymentRequestServiceImpl(this._paymentService, this._userAccountService);
        // this._paymentRequestScheduler = new PaymentRequestSchedulerImpl(this._paymentRequestService);

        // Initialize handlers - temporarily commented out
        // this._paymentHandler = new PaymentCommandHandler();
        // this._requestHandler = new RequestCommandHandler(
        //     this._paymentRequestService,
        //     this._paymentService,
        //     this._userAccountService,
        //     this._notificationService
        // );
        // this._transactionHandler = new TransactionCommandHandler(this._paymentService, this._userAccountService);
        // this._paymentConfigHandler = new PaymentConfigCommandHandler(this._serverConfigService);
        // this._setupFlowOrchestrator = new SetupFlowOrchestrator(this._userAccountService);
        // this._activityHandler = new ActivityCommandHandler(this._userAccountService, this._paymentService);
        // this._profileHandler = new ProfileCommandHandler(this._userAccountService, this._paymentService);
        
        // Initialize test handler
        // const { TestCommandHandler } = require('@handlers/TestCommandHandler');
        // this._testHandler = new TestCommandHandler();

        // Initialize utilities
        this._errorHandler = new ErrorHandler();
    }

    public setDiscordClient(client: any): void {
        // this._notificationService.setClient(client);
    }

    // Getters for services - temporarily commented out
    // public get notificationService(): NotificationServiceImpl {
    //     return this._notificationService;
    // }

    // public get serverConfigService(): ServerConfigServiceImpl {
    //     return this._serverConfigService;
    // }

    // public get paymentService(): PaymentServiceImpl {
    //     return this._paymentService;
    // }

    // public get userAccountService(): UserAccountServiceImpl {
    //     return this._userAccountService;
    // }

    // public get paymentRequestService(): PaymentRequestServiceImpl {
    //     return this._paymentRequestService;
    // }

    // public get paymentRequestScheduler(): PaymentRequestScheduler {
    //     return this._paymentRequestScheduler;
    // }

    // Getters for handlers - temporarily commented out
    // public get paymentHandler(): PaymentCommandHandler {
    //     return this._paymentHandler;
    // }

    // public get requestHandler(): RequestCommandHandler {
    //     return this._requestHandler;
    // }

    // public get transactionHandler(): TransactionCommandHandler {
    //     return this._transactionHandler;
    // }

    // public get paymentConfigHandler(): PaymentConfigCommandHandler {
    //     return this._paymentConfigHandler;
    // }

    // public get setupFlowOrchestrator(): SetupFlowOrchestrator {
    //     return this._setupFlowOrchestrator;
    // }

    // public get activityHandler(): ActivityCommandHandler {
    //     return this._activityHandler;
    // }

    // public get profileHandler(): ProfileCommandHandler {
    //     return this._profileHandler;
    // }

    public get errorHandler(): ErrorHandler {
        return this._errorHandler;
    }

    // public get paymentFlowOrchestrator(): any {
    //     return this._paymentRequestScheduler;
    // }

    public startScheduler(): void {
        // this._paymentRequestScheduler.start();
    }

    public stopScheduler(): void {
        // this._paymentRequestScheduler.stop();
    }
}
