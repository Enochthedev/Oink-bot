#!/bin/bash

echo "🐷 Quick Bot Test"
echo "================"

echo "1️⃣ Testing Discord token..."
node scripts/test-discord-token.js

if [ $? -eq 0 ]; then
    echo ""
    echo "2️⃣ Starting bot..."
    npm run dev
else
    echo ""
    echo "❌ Fix the Discord token first, then run:"
    echo "   npm run dev"
fi