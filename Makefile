# Oink Bot Makefile
# Usage: make [target]

.PHONY: help install build test lint clean docker-build docker-run docker-stop deploy-local deploy-docker deploy-k8s

# Default target
help:
	@echo "🐷 Oink Bot - Available Commands:"
	@echo ""
	@echo "Development:"
	@echo "  install      - Install dependencies"
	@echo "  build        - Build the project"
	@echo "  test         - Run tests"
	@echo "  lint         - Run ESLint"
	@echo "  lint:fix     - Fix ESLint issues"
	@echo "  clean        - Clean build artifacts"
	@echo "  dev          - Start development server"
	@echo ""
	@echo "Docker:"
	@echo "  docker-build - Build Docker image"
	@echo "  docker-run   - Run with Docker Compose"
	@echo "  docker-stop  - Stop Docker containers"
	@echo "  docker-clean - Clean Docker containers and images"
	@echo ""
	@echo "Deployment:"
	@echo "  deploy-local - Deploy locally with Docker Compose"
	@echo "  deploy-docker- Deploy with Docker containers"
	@echo "  deploy-k8s   - Deploy to Kubernetes"
	@echo "  deploy-staging- Deploy to staging environment"
	@echo "  deploy-prod  - Deploy to production environment"
	@echo ""
	@echo "Database:"
	@echo "  db-generate  - Generate Prisma client"
	@echo "  db-migrate   - Run database migrations"
	@echo "  db-seed      - Seed database with test data"
	@echo "  db-reset     - Reset database (WARNING: destructive)"
	@echo ""
	@echo "Utilities:"
	@echo "  logs         - Show application logs"
	@echo "  status       - Show deployment status"
	@echo "  health       - Check application health"

# Development commands
install:
	@echo "Installing dependencies..."
	npm ci

build:
	@echo "Building project..."
	npm run build

test:
	@echo "Running tests..."
	npm test

lint:
	@echo "Running ESLint..."
	npm run lint

lint:fix:
	@echo "Fixing ESLint issues..."
	npm run lint:fix

clean:
	@echo "Cleaning build artifacts..."
	rm -rf dist/
	rm -rf build/
	rm -rf coverage/
	rm -rf .nyc_output/

dev:
	@echo "Starting development server..."
	npm run dev

# Docker commands
docker-build:
	@echo "Building Docker image..."
	docker build -f Dockerfile -t oink-bot:latest .

docker-run:
	@echo "Starting services with Docker Compose..."
	docker-compose up -d

docker-stop:
	@echo "Stopping Docker containers..."
	docker-compose down

docker-clean:
	@echo "Cleaning Docker containers and images..."
	docker-compose down -v --rmi all
	docker system prune -f

# Deployment commands
deploy-local:
	@echo "Deploying locally..."
	./scripts/deploy.sh local deploy

deploy-docker:
	@echo "Deploying with Docker..."
	./scripts/deploy.sh docker deploy

deploy-k8s:
	@echo "Deploying to Kubernetes..."
	./scripts/deploy.sh k8s deploy

deploy-staging:
	@echo "Deploying to staging..."
	./scripts/deploy.sh staging deploy

deploy-prod:
	@echo "Deploying to production..."
	./scripts/deploy.sh production deploy

# Database commands
db-generate:
	@echo "Generating Prisma client..."
	npx prisma generate

db-migrate:
	@echo "Running database migrations..."
	npx prisma migrate deploy

db-seed:
	@echo "Seeding database..."
	npx prisma db seed

db-reset:
	@echo "WARNING: This will destroy all data!"
	@read -p "Are you sure? Type 'yes' to confirm: " confirm; \
	if [ "$$confirm" = "yes" ]; then \
		npx prisma migrate reset --force; \
	else \
		echo "Database reset cancelled"; \
	fi

# Utility commands
logs:
	@echo "Showing application logs..."
	docker-compose logs -f bot

status:
	@echo "Showing deployment status..."
	./scripts/deploy.sh local status

health:
	@echo "Checking application health..."
	@if docker ps | grep -q oink-bot; then \
		@echo "🐷 Oink Bot is running"; \
	else \
		@echo "❌ Oink Bot is not running"; \
	fi

	@if docker ps | grep -q oink-bot-db; then \
		@echo "🗄️  Oink Bot Database is running"; \
	else \
		@echo "❌ Oink Bot Database is not running"; \
	fi

	@if docker ps | grep -q oink-bot-redis; then \
		@echo "🔴 Oink Bot Redis is running"; \
	else \
		@echo "❌ Oink Bot Redis is not running"; \
	fi

# CI/CD commands
ci: install lint build test
	@echo "CI pipeline completed successfully!"

# Production build
prod-build: clean install build
	@echo "Production build completed!"

# Quick start for development
quickstart: install db-generate docker-run
	@echo "Quick start completed! Bot should be running."
	@echo "Check status with: make status"
	@echo "View logs with: make logs"
