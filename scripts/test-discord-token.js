const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

async function testDiscordToken() {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;

    console.log('🐷 Testing Discord Bot Token...\n');

    // Basic validation
    if (!token) {
        console.log('❌ DISCORD_TOKEN is not set in .env file');
        return;
    }

    if (!clientId) {
        console.log('❌ DISCORD_CLIENT_ID is not set in .env file');
        return;
    }

    console.log(`📋 Client ID: ${clientId}`);
    console.log(`🔑 Token format: ${token.substring(0, 20)}...${token.substring(token.length - 10)}`);
    console.log(`📏 Token length: ${token.length} characters\n`);

    // Token format validation
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
        console.log('❌ Invalid token format. Discord tokens have 3 parts separated by dots.');
        console.log('   Expected format: XXXXXXXXXX.XXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXX');
        return;
    }

    console.log('✅ Token format looks correct\n');

    // Try to connect
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.DirectMessages
        ]
    });

    try {
        console.log('🔄 Attempting to login...');

        client.once('ready', () => {
            console.log(`✅ Successfully logged in as ${client.user.tag}!`);
            console.log(`🤖 Bot ID: ${client.user.id}`);
            console.log(`🏠 In ${client.guilds.cache.size} server(s)`);

            if (client.user.id !== clientId) {
                console.log(`⚠️  WARNING: Bot ID (${client.user.id}) doesn't match CLIENT_ID (${clientId})`);
                console.log('   Update DISCORD_CLIENT_ID in your .env file');
            }

            client.destroy();
            process.exit(0);
        });

        await client.login(token);

    } catch (error) {
        console.log('❌ Login failed:', error.message);

        if (error.code === 'TokenInvalid') {
            console.log('\n🔧 How to fix:');
            console.log('1. Go to https://discord.com/developers/applications');
            console.log('2. Select your application');
            console.log('3. Go to "Bot" section');
            console.log('4. Click "Reset Token"');
            console.log('5. Copy the new token to your .env file');
        }

        process.exit(1);
    }
}

testDiscordToken();