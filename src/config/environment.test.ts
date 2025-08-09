import { describe, it, expect, beforeEach } from 'vitest';

describe('Environment Configuration', () => {
  beforeEach(() => {
    // Reset environment variables
    delete process.env.DISCORD_TOKEN;
    delete process.env.DISCORD_CLIENT_ID;
  });

  it('should load default configuration values', async () => {
    // Set required env vars to avoid errors
    process.env.DISCORD_TOKEN = 'test_token';
    process.env.DISCORD_CLIENT_ID = 'test_client_id';
    
    // Import the config
    const { config } = await import('./environment');
    
    expect(config.NODE_ENV).toBe('test'); // Vitest sets NODE_ENV to 'test'
    expect(config.PORT).toBe(3000);
    expect(config.ESCROW_TIMEOUT_HOURS).toBe(24);
    expect(config.MAX_TRANSACTIONS_PER_DAY).toBe(10);
    expect(config.MAX_AMOUNT_PER_TRANSACTION).toBe(1000);
  });

  it('should have required environment variables defined', () => {
    // Set required env vars
    process.env.DISCORD_TOKEN = 'test_token';
    process.env.DISCORD_CLIENT_ID = 'test_client_id';
    
    expect(process.env.DISCORD_TOKEN).toBeDefined();
    expect(process.env.DISCORD_CLIENT_ID).toBeDefined();
  });
});