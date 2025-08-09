import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
}

export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    category: string;
    message: string;
    metadata?: Record<string, unknown>;
    error?: Error;
    userId?: string;
    transactionId?: string;
    serverId?: string;
}

export interface LoggerConfig {
    level: LogLevel;
    enableConsole: boolean;
    enableFile: boolean;
    logDirectory: string;
    maxFileSize: number; // in bytes
    maxFiles: number;
}

export class Logger {
    private static instance: Logger;
    private config: LoggerConfig;
    private currentLogFile: string;
    private currentFileSize: number = 0;

    private constructor(config?: Partial<LoggerConfig>) {
        this.config = {
            level: LogLevel.INFO,
            enableConsole: true,
            enableFile: true,
            logDirectory: './logs',
            maxFileSize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            ...config,
        };

        this.ensureLogDirectory();
        this.currentLogFile = this.generateLogFileName();
    }

    public static getInstance(config?: Partial<LoggerConfig>): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger(config);
        }
        return Logger.instance;
    }

    public error(message: string, metadata?: Record<string, unknown>, error?: Error): void {
        this.log(LogLevel.ERROR, 'GENERAL', message, metadata, error);
    }

    public warn(message: string, metadata?: Record<string, unknown>): void {
        this.log(LogLevel.WARN, 'GENERAL', message, metadata);
    }

    public info(message: string, metadata?: Record<string, unknown>): void {
        this.log(LogLevel.INFO, 'GENERAL', message, metadata);
    }

    public debug(message: string, metadata?: Record<string, unknown>): void {
        this.log(LogLevel.DEBUG, 'GENERAL', message, metadata);
    }

    // Specialized logging methods for different categories
    public logTransaction(
        level: LogLevel,
        message: string,
        transactionId: string,
        userId?: string,
        metadata?: Record<string, unknown>
    ): void {
        this.log(level, 'TRANSACTION', message, { ...metadata, transactionId, userId });
    }

    public logPaymentProcessor(
        level: LogLevel,
        message: string,
        processorType: string,
        metadata?: Record<string, unknown>,
        error?: Error
    ): void {
        this.log(level, 'PAYMENT_PROCESSOR', message, { ...metadata, processorType }, error);
    }

    public logDiscordAPI(
        level: LogLevel,
        message: string,
        serverId?: string,
        userId?: string,
        metadata?: Record<string, unknown>,
        error?: Error
    ): void {
        this.log(level, 'DISCORD_API', message, { ...metadata, serverId, userId }, error);
    }

    public logEscrow(
        level: LogLevel,
        message: string,
        transactionId: string,
        metadata?: Record<string, unknown>,
        error?: Error
    ): void {
        this.log(level, 'ESCROW', message, { ...metadata, transactionId }, error);
    }

    public logSecurity(
        level: LogLevel,
        message: string,
        userId?: string,
        serverId?: string,
        metadata?: Record<string, unknown>
    ): void {
        this.log(level, 'SECURITY', message, { ...metadata, userId, serverId });
    }

    private log(
        level: LogLevel,
        category: string,
        message: string,
        metadata?: Record<string, unknown>,
        error?: Error
    ): void {
        if (level > this.config.level) {
            return;
        }

        const logEntry: LogEntry = {
            timestamp: new Date(),
            level,
            category,
            message,
            metadata,
            error,
        };

        if (this.config.enableConsole) {
            this.logToConsole(logEntry);
        }

        if (this.config.enableFile) {
            this.logToFile(logEntry);
        }
    }

    private logToConsole(entry: LogEntry): void {
        const timestamp = entry.timestamp.toISOString();
        const levelName = LogLevel[entry.level];
        const prefix = `[${timestamp}] [${levelName}] [${entry.category}]`;

        let output = `${prefix} ${entry.message}`;

        if (entry.metadata && Object.keys(entry.metadata).length > 0) {
            output += ` | Metadata: ${JSON.stringify(entry.metadata)}`;
        }

        if (entry.error) {
            output += ` | Error: ${entry.error.message}`;
            if (entry.error.stack) {
                output += `\nStack: ${entry.error.stack}`;
            }
        }

        switch (entry.level) {
            case LogLevel.ERROR:
                console.error(output);
                break;
            case LogLevel.WARN:
                console.warn(output);
                break;
            case LogLevel.INFO:
                console.info(output);
                break;
            case LogLevel.DEBUG:
                console.debug(output);
                break;
        }
    }

    private logToFile(entry: LogEntry): void {
        const logLine = JSON.stringify({
            timestamp: entry.timestamp.toISOString(),
            level: LogLevel[entry.level],
            category: entry.category,
            message: entry.message,
            metadata: entry.metadata,
            error: entry.error ? {
                message: entry.error.message,
                stack: entry.error.stack,
                name: entry.error.name,
            } : undefined,
        }) + '\n';

        try {
            // Check if we need to rotate the log file
            if (this.currentFileSize + Buffer.byteLength(logLine) > this.config.maxFileSize) {
                this.rotateLogFile();
            }

            appendFileSync(this.currentLogFile, logLine);
            this.currentFileSize += Buffer.byteLength(logLine);
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    private ensureLogDirectory(): void {
        if (!existsSync(this.config.logDirectory)) {
            mkdirSync(this.config.logDirectory, { recursive: true });
        }
    }

    private generateLogFileName(): string {
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        return join(this.config.logDirectory, `app-${timestamp}.log`);
    }

    private rotateLogFile(): void {
        // Find existing log files and rotate them
        const timestamp = new Date().toISOString().split('T')[0];
        const baseFileName = join(this.config.logDirectory, `app-${timestamp}`);

        // Find the next available file number
        let fileNumber = 1;
        while (existsSync(`${baseFileName}-${fileNumber}.log`) && fileNumber < this.config.maxFiles) {
            fileNumber++;
        }

        if (fileNumber >= this.config.maxFiles) {
            // Remove the oldest file
            const oldestFile = `${baseFileName}-${this.config.maxFiles}.log`;
            if (existsSync(oldestFile)) {
                try {
                    require('fs').unlinkSync(oldestFile);
                } catch (error) {
                    console.error('Failed to remove old log file:', error);
                }
            }
            fileNumber = this.config.maxFiles;
        }

        this.currentLogFile = `${baseFileName}-${fileNumber}.log`;
        this.currentFileSize = 0;
    }

    // Method to change log level at runtime
    public setLogLevel(level: LogLevel): void {
        this.config.level = level;
    }

    // Method to get current configuration
    public getConfig(): LoggerConfig {
        return { ...this.config };
    }
}

// Export a default logger instance
export const logger = Logger.getInstance({
    level: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
});