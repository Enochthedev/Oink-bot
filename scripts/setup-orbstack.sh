#!/bin/bash

echo "🐷 Oink Bot Setup for OrbStack"
echo "=============================="

# Start PostgreSQL
echo "🚀 Starting PostgreSQL..."
docker-compose -f docker-compose.simple.yml up -d

# Wait for PostgreSQL
echo "⏳ Waiting for PostgreSQL..."
sleep 10

# Get container IP (OrbStack networking fix)
CONTAINER_IP=$(docker inspect oink-bot-db | grep '"IPAddress"' | tail -1 | cut -d'"' -f4)
echo "🔗 Container IP: $CONTAINER_IP"

# Create database
echo "📊 Creating database..."
docker exec oink-bot-db psql -U postgres -c "CREATE DATABASE oink_bot;" 2>/dev/null || true

# Fix authentication for external connections
echo "🔧 Configuring authentication..."
docker exec oink-bot-db sed -i 's/host all all all scram-sha-256/host all all all trust/' /var/lib/postgresql/data/pg_hba.conf
docker exec oink-bot-db psql -U postgres -c "SELECT pg_reload_conf();"

# Update environment with container IP
echo "⚙️  Updating configuration..."
sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:password@$CONTAINER_IP:5432/oink_bot|" .env

# Setup database
echo "🔧 Generating Prisma client..."
npm run db:generate

echo "📊 Running migrations..."
npm run db:migrate

echo "🌱 Seeding database..."
npm run db:seed

echo ""
echo "✅ OrbStack setup complete!"
echo "📊 Database: PostgreSQL (Docker via OrbStack)"
echo "🔗 Connection: postgresql://postgres:password@$CONTAINER_IP:5432/oink_bot"
echo ""
echo "💡 Note: OrbStack uses container IPs instead of localhost for external connections"