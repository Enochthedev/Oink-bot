#!/bin/bash

echo "🐷 Oink Bot Quick Start"
echo "======================"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npm run db:generate

# Run migrations
echo "📊 Setting up database..."
npm run db:migrate

# Seed database
echo "🌱 Seeding database with test data..."
npm run db:seed

echo ""
echo "✅ Setup complete! Your bot is ready to go."
echo ""
echo "🚀 Available commands:"
echo "  npm run dev          - Start development server"
echo "  npm run build        - Build for production"
echo "  npm run test         - Run tests"
echo "  npm run db:studio    - Open database browser"
echo ""
echo "📊 Database: SQLite (dev.db)"
echo "🔧 Multi-server support: ✅ Configured"
echo "👥 Test users: 3 users with different payment methods"
echo "🏦 Test servers: 3 server configurations"