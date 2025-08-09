# 🐷 Oink Bot

A Discord bot that facilitates secure payments between users using multiple payment methods. Oink oink! 🐽

## ✨ Features

- **Secure Payments**: Send and request payments between Discord users
- **Multiple Payment Methods**: Support for cryptocurrency and ACH transfers
- **Escrow System**: Secure payment holding until completion
- **User Profiles**: Manage payment preferences and settings
- **Activity Tracking**: Monitor payment history and statistics
- **Slash Commands**: Modern Discord slash command interface
- **Text Commands**: Support for both `oink` and `@oink` command prefixes

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL 15+
- Redis 7+
- Discord Bot Token

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd oink-bot
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.template .env
# Edit .env with your Discord bot credentials
```

4. Set up the database:
```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

5. Start the bot:
```bash
npm run dev
```

## 🎮 Commands

### Slash Commands
- `/pay @user <amount> [description]` - Send payment to another user
- `/request @user <amount> [description]` - Request payment from another user
- `/balance` - Check your current balance
- `/profile` - View and edit your profile
- `/help` - Get help with commands

### Text Commands
- `oink pay @user <amount> [description]` - Send payment (alternative to slash command)
- `@oink pay @user <amount> [description]` - Send payment using bot mention
- `oink balance` - Check balance
- `oink profile` - View profile

## 🐳 Docker Deployment

```bash
# Build and run with Docker Compose
make docker-build
make docker-run

# Or use Docker Compose directly
docker-compose up -d
```

## ☸️ Kubernetes Deployment

```bash
# Deploy to Kubernetes
make deploy-k8s

# Or manually
kubectl apply -f k8s/
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

## 📚 Documentation

- [Architecture Overview](src/bot/ARCHITECTURE_OVERVIEW.md)
- [Developer Guide](src/bot/DEVELOPER_GUIDE.md)
- [Deployment Guide](DEPLOYMENT.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

🐷 **Oink oink!** Happy coding! 🐽✨