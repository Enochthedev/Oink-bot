# Discord Bot Setup Guide

## 🤖 Setting Up Your Discord Bot

### Step 1: Discord Developer Portal Setup

1. **Go to Discord Developer Portal**
   - Visit: https://discord.com/developers/applications
   - Log in with your Discord account

2. **Create or Select Application**
   - If creating new: Click "New Application"
   - If existing: Select your application (ID: 1403141925569171587)

3. **Bot Configuration**
   - Go to "Bot" section in left sidebar
   - Click "Reset Token" (if token exists) or "Add Bot"
   - Copy the new bot token
   - **Important**: Keep this token secret!

4. **Bot Permissions**
   Enable these permissions:
   - ✅ Send Messages
   - ✅ Use Slash Commands
   - ✅ Read Message History
   - ✅ Embed Links
   - ✅ Attach Files
   - ✅ Use External Emojis

5. **OAuth2 Scopes**
   - Go to "OAuth2" → "URL Generator"
   - Select scopes: `bot` and `applications.commands`
   - Select the permissions from step 4
   - Copy the generated URL

### Step 2: Update Environment Variables

Replace the token in your `.env` file:

```bash
# Discord Configuration
DISCORD_TOKEN=YOUR_NEW_BOT_TOKEN_HERE
DISCORD_CLIENT_ID=1403141925569171587
```

### Step 3: Invite Bot to Server

1. Use the OAuth2 URL from Step 1.5
2. Select a server where you have "Manage Server" permission
3. Authorize the bot

### Step 4: Test the Bot

```bash
npm run dev
```

You should see:
```
🐷 Oink! Started refreshing X application (/) commands. 🐽
✅ Successfully registered X slash commands
🐷 Oink Bot is ready! Logged in as YourBot#1234
```

## 🔧 Troubleshooting

### 401 Unauthorized
- Token is invalid/expired → Reset token in Developer Portal
- Client ID mismatch → Verify DISCORD_CLIENT_ID matches your app

### 403 Forbidden  
- Missing permissions → Check bot permissions in server
- Bot not in server → Use OAuth2 URL to invite bot

### Commands not appearing
- Missing `applications.commands` scope → Regenerate OAuth2 URL
- Bot lacks slash command permissions → Check server settings

## 🎯 Quick Commands to Test

Once the bot is running, try these commands in Discord:

- `/setup` - Set up payment methods
- `/balance` - Check your balance  
- `/pay @user 10` - Send a payment
- `/status` - Check bot status

## 🔒 Security Notes

- Never commit your bot token to git
- Regenerate token if accidentally exposed
- Use environment variables for all secrets
- Restrict bot permissions to minimum needed