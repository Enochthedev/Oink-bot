# 🐷 Oink Bot Deployment Guide

This guide covers deploying the Oink Bot to various environments including local development, Docker containers, and Kubernetes clusters.

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development)
- PostgreSQL 15+ and Redis 7+ (for local development)
- Kubernetes cluster (for k8s deployment)
- kubectl configured (for k8s deployment)

### Local Development

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

4. Start the bot:
```bash
npm run dev
```

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

1. Build and start all services:
```bash
make docker-build
make docker-run
```

Or manually:
```bash
docker-compose up --build -d
```

2. Check service status:
```bash
make status
```

3. View logs:
```bash
make logs
```

4. Stop services:
```bash
make docker-stop
```

### Manual Docker Deployment

1. Build the image:
```bash
docker build -f Dockerfile -t oink-bot:latest .
```

2. Create a network:
```bash
docker network create oink-bot-network
```

3. Start PostgreSQL:
```bash
docker run -d \
  --name oink-bot-db \
  --network oink-bot-network \
  -e POSTGRES_DB=oink_bot \
  -e POSTGRES_USER=oink_bot \
  -e POSTGRES_PASSWORD=oink_bot_password \
  -p 5432:5432 \
  postgres:15-alpine
```

4. Start Redis:
```bash
docker run -d \
  --name oink-bot-redis \
  --network oink-bot-network \
  -p 6379:6379 \
  redis:7-alpine
```

5. Start the bot:
```bash
docker run -d \
  --name oink-bot \
  --network oink-bot-network \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://oink_bot:oink_bot_password@oink-bot-db:5432/oink_bot" \
  -e REDIS_URL="redis://oink-bot-redis:6379" \
  -e DISCORD_TOKEN="${DISCORD_TOKEN}" \
  -e DISCORD_CLIENT_ID="${DISCORD_CLIENT_ID}" \
  -e DISCORD_GUILD_ID="${DISCORD_GUILD_ID}" \
  oink-bot:latest
```

## ☸️ Kubernetes Deployment

### Prerequisites

- Kubernetes cluster running
- kubectl configured and connected to your cluster
- Helm installed (optional, for advanced deployments)

### Basic Deployment

1. Create namespace:
```bash
kubectl create namespace oink-bot
```

2. Apply database and Redis first:
```bash
kubectl apply -f k8s/postgres.yaml -n oink-bot
kubectl apply -f k8s/redis.yaml -n oink-bot
```

3. Wait for database to be ready:
```bash
kubectl wait --for=condition=ready pod -l app=oink-bot-postgres -n oink-bot --timeout=300s
```

4. Apply the main deployment:
```bash
kubectl apply -f k8s/deployment.yaml -n oink-bot
```

5. Wait for deployment to be ready:
```bash
kubectl wait --for=condition=available deployment/oink-bot -n oink-bot --timeout=300s
```

### Using the Deployment Script

The included deployment script automates the process:

```bash
# Deploy to Kubernetes
make deploy-k8s

# Or manually
./scripts/deploy.sh k8s deploy
```

### Scaling

Scale the deployment as needed:

```bash
kubectl scale deployment oink-bot --replicas=5 -n oink-bot
```

### Rolling Updates

Perform rolling updates:

```bash
kubectl set image deployment/oink-bot oink-bot=oink-bot:new-version -n oink-bot
kubectl rollout status deployment/oink-bot -n oink-bot
```

### Rollback

Rollback to previous version if needed:

```bash
kubectl rollout undo deployment/oink-bot -n oink-bot
```

## 🔧 Configuration

### Environment Variables

Key environment variables:

- `DISCORD_TOKEN`: Your Discord bot token
- `DISCORD_CLIENT_ID`: Your Discord application client ID
- `DISCORD_GUILD_ID`: Target Discord server ID
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `BOT_PREFIX`: Command prefix (default: "oink")
- `NODE_ENV`: Environment (development/production)

### Database Configuration

The bot uses PostgreSQL for persistent storage and Redis for caching:

- **PostgreSQL**: User accounts, transactions, payment configurations
- **Redis**: Session data, rate limiting, temporary data

### Security

- All sensitive data is encrypted
- Database connections use TLS in production
- Bot tokens are stored as Kubernetes secrets
- Network policies restrict inter-service communication

## 📊 Monitoring

### Health Checks

The bot includes health check endpoints:

- `/health`: Basic health status
- `/ready`: Readiness probe for Kubernetes

### Logging

Logs are available through:

```bash
# Docker
docker logs oink-bot

# Kubernetes
kubectl logs -f deployment/oink-bot -n oink-bot
```

### Metrics

Enable metrics collection by setting `ENABLE_METRICS=true` in the environment.

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check PostgreSQL is running
   - Verify connection string
   - Check network connectivity

2. **Bot Not Responding**
   - Verify Discord token is valid
   - Check bot has proper permissions
   - Ensure bot is in the target server

3. **Kubernetes Pods Not Starting**
   - Check resource limits
   - Verify secrets exist
   - Check pod events: `kubectl describe pod <pod-name> -n oink-bot`

### Debug Mode

Enable debug logging:

```bash
# Docker
docker run -e LOG_LEVEL=debug oink-bot:latest

# Kubernetes
kubectl set env deployment/oink-bot LOG_LEVEL=debug -n oink-bot
```

## 🔄 CI/CD

### GitHub Actions

The repository includes GitHub Actions workflows for:

- Automated testing
- Docker image building
- Kubernetes deployment
- Security scanning

### Manual Deployment

For manual deployments, use the provided scripts:

```bash
# Local development
make deploy-local

# Docker deployment
make deploy-docker

# Kubernetes deployment
make deploy-k8s
```

## 📚 Additional Resources

- [Architecture Overview](src/bot/ARCHITECTURE_OVERVIEW.md)
- [Developer Guide](src/bot/DEVELOPER_GUIDE.md)
- [API Documentation](docs/api.md)

---

🐷 **Oink oink!** Happy deploying! 🐽✨
