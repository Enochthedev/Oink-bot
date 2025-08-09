// Environment configuration
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Discord Configuration
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
  
  // Bot Configuration
  BOT_PREFIX: process.env.BOT_PREFIX || 'oink',
  
  // Database Configuration
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  
  // Payment Processor Configuration
  CRYPTO_API_KEY: process.env.CRYPTO_API_KEY || '',
  CRYPTO_API_URL: process.env.CRYPTO_API_URL || '',
  
  ACH_API_KEY: process.env.ACH_API_KEY || '',
  ACH_API_URL: process.env.ACH_API_URL || '',
  
  // Security Configuration
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  
  // Application Configuration
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000'),
  
  // Escrow Configuration
  ESCROW_TIMEOUT_HOURS: parseInt(process.env.ESCROW_TIMEOUT_HOURS || '24'),
  
  // Rate Limiting
  MAX_TRANSACTIONS_PER_DAY: parseInt(process.env.MAX_TRANSACTIONS_PER_DAY || '10'),
  MAX_AMOUNT_PER_TRANSACTION: parseFloat(process.env.MAX_AMOUNT_PER_TRANSACTION || '1000'),
};

// Validate required environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];

for (const envVar of requiredEnvVars) {
  if (!config[envVar as keyof typeof config]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}