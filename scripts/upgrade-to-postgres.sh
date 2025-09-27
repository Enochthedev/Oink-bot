#!/bin/bash

echo "🐘 Upgrading to PostgreSQL"
echo "=========================="

# Stop any existing containers
docker-compose -f docker-compose.simple.yml down -v 2>/dev/null || true

# Start PostgreSQL
echo "🚀 Starting PostgreSQL..."
docker-compose -f docker-compose.simple.yml up -d

# Wait for PostgreSQL
echo "⏳ Waiting for PostgreSQL..."
sleep 10

# Create database
echo "📊 Creating database..."
docker exec oink-bot-db psql -U postgres -c "CREATE DATABASE oink_bot;" 2>/dev/null || true

# Fix authentication
echo "🔧 Configuring authentication..."
docker exec oink-bot-db sed -i 's/host all all all scram-sha-256/host all all all trust/' /var/lib/postgresql/data/pg_hba.conf
docker exec oink-bot-db psql -U postgres -c "SELECT pg_reload_conf();"

# Update environment
echo "⚙️  Updating configuration..."
sed -i.bak 's|provider = "sqlite"|provider = "postgresql"|' prisma/schema.prisma
sed -i.bak 's|DATABASE_URL=file:./dev.db|DATABASE_URL=postgresql://postgres:password@localhost:5432/oink_bot|' .env

# Regenerate and migrate
echo "🔄 Migrating to PostgreSQL..."
npm run db:generate
npm run db:migrate
npm run db:seed

echo ""
echo "✅ PostgreSQL upgrade complete!"
echo "📊 Database: PostgreSQL (Docker)"
echo "🔗 Connection: postgresql://postgres:password@localhost:5432/oink_bot"