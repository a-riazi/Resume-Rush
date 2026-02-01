#!/bin/bash

# Resume Rocket Paywall System - Testing Script
# This script helps test the complete paywall system

echo "🚀 Resume Rocket Paywall Testing Suite"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check Prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"
echo ""

# Check PostgreSQL
if command -v psql &> /dev/null; then
    echo -e "${GREEN}✓${NC} PostgreSQL CLI found"
else
    echo -e "${RED}✗${NC} PostgreSQL CLI not found"
    echo "  Install: https://www.postgresql.org/"
fi

# Check Node.js
if command -v node &> /dev/null; then
    echo -e "${GREEN}✓${NC} Node.js $(node -v) found"
else
    echo -e "${RED}✗${NC} Node.js not found"
    echo "  Install: https://nodejs.org/"
fi

# Check npm
if command -v npm &> /dev/null; then
    echo -e "${GREEN}✓${NC} npm $(npm -v) found"
else
    echo -e "${RED}✗${NC} npm not found"
fi

echo ""
echo -e "${BLUE}Environment Setup${NC}"
echo "======================================"
echo ""

# Test environment variables
echo "Checking .env files..."

if [ -f "server/.env" ]; then
    echo -e "${GREEN}✓${NC} server/.env exists"
    
    # Check required vars
    if grep -q "DATABASE_URL" server/.env; then
        echo -e "${GREEN}  ✓${NC} DATABASE_URL set"
    else
        echo -e "${RED}  ✗${NC} DATABASE_URL missing"
    fi
    
    if grep -q "JWT_SECRET" server/.env; then
        echo -e "${GREEN}  ✓${NC} JWT_SECRET set"
    else
        echo -e "${RED}  ✗${NC} JWT_SECRET missing"
    fi
    
    if grep -q "STRIPE_SECRET_KEY" server/.env; then
        echo -e "${GREEN}  ✓${NC} STRIPE_SECRET_KEY set"
    else
        echo -e "${RED}  ✗${NC} STRIPE_SECRET_KEY missing"
    fi
    
    if grep -q "GOOGLE_CLIENT_ID" server/.env; then
        echo -e "${GREEN}  ✓${NC} GOOGLE_CLIENT_ID set"
    else
        echo -e "${RED}  ✗${NC} GOOGLE_CLIENT_ID missing"
    fi
else
    echo -e "${RED}✗${NC} server/.env not found"
fi

if [ -f "client/.env.local" ]; then
    echo -e "${GREEN}✓${NC} client/.env.local exists"
    
    if grep -q "VITE_STRIPE_PUBLIC_KEY" client/.env.local; then
        echo -e "${GREEN}  ✓${NC} VITE_STRIPE_PUBLIC_KEY set"
    else
        echo -e "${RED}  ✗${NC} VITE_STRIPE_PUBLIC_KEY missing"
    fi
    
    if grep -q "VITE_GOOGLE_CLIENT_ID" client/.env.local; then
        echo -e "${GREEN}  ✓${NC} VITE_GOOGLE_CLIENT_ID set"
    else
        echo -e "${RED}  ✗${NC} VITE_GOOGLE_CLIENT_ID missing"
    fi
else
    echo -e "${RED}✗${NC} client/.env.local not found"
fi

echo ""
echo -e "${BLUE}Database Connection Test${NC}"
echo "======================================"
echo ""

# Extract database URL and test connection
if [ -f "server/.env" ]; then
    DB_URL=$(grep "DATABASE_URL" server/.env | cut -d '=' -f 2)
    
    echo "Testing database connection..."
    echo "URL: $DB_URL"
    
    # Simple connection test
    if psql "$DB_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Database connection successful"
        
        # Check if tables exist
        if psql "$DB_URL" -c "SELECT 1 FROM users LIMIT 1;" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} users table exists"
        else
            echo -e "${YELLOW}ℹ${NC} users table will be created on first server start"
        fi
    else
        echo -e "${RED}✗${NC} Database connection failed"
        echo "  Make sure PostgreSQL is running and DATABASE_URL is correct"
    fi
fi

echo ""
echo -e "${BLUE}Installed Dependencies${NC}"
echo "======================================"
echo ""

if [ -d "server/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Backend dependencies installed"
    
    # Check key packages
    if [ -d "server/node_modules/sequelize" ]; then
        echo -e "${GREEN}  ✓${NC} sequelize"
    fi
    if [ -d "server/node_modules/pg" ]; then
        echo -e "${GREEN}  ✓${NC} pg"
    fi
    if [ -d "server/node_modules/stripe" ]; then
        echo -e "${GREEN}  ✓${NC} stripe"
    fi
    if [ -d "server/node_modules/jsonwebtoken" ]; then
        echo -e "${GREEN}  ✓${NC} jsonwebtoken"
    fi
else
    echo -e "${YELLOW}ℹ${NC} Backend dependencies not installed"
    echo "  Run: cd server && npm install"
fi

if [ -d "client/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Frontend dependencies installed"
    
    # Check key packages
    if [ -d "client/node_modules/@react-oauth/google" ]; then
        echo -e "${GREEN}  ✓${NC} @react-oauth/google"
    fi
    if [ -d "client/node_modules/@stripe/react-stripe-js" ]; then
        echo -e "${GREEN}  ✓${NC} @stripe/react-stripe-js"
    fi
else
    echo -e "${YELLOW}ℹ${NC} Frontend dependencies not installed"
    echo "  Run: cd client && npm install"
fi

echo ""
echo -e "${BLUE}Quick Start${NC}"
echo "======================================"
echo ""

echo "To start the development environment:"
echo ""
echo "Terminal 1 (Backend):"
echo -e "${YELLOW}cd server && npm run dev${NC}"
echo ""
echo "Terminal 2 (Frontend):"
echo -e "${YELLOW}cd client && npm run dev${NC}"
echo ""
echo "Then open: ${YELLOW}http://localhost:5173${NC}"
echo ""

echo -e "${BLUE}Testing Checklist${NC}"
echo "======================================"
echo ""
echo "After starting the servers, test:"
echo ""
echo "1. FREE TIER:"
echo "   [ ] Upload resume without login"
echo "   [ ] Tailor until 3 generations hit"
echo "   [ ] Paywall modal should appear"
echo ""
echo "2. AUTH-FREE TIER:"
echo "   [ ] Click 'Sign in with Google'"
echo "   [ ] Profile shows 'Auth Free' with 6 gens"
echo "   [ ] Can now generate 6 resumes"
echo ""
echo "3. PAID TIER:"
echo "   [ ] Hit generation limit"
echo "   [ ] Click 'Upgrade Now' in paywall"
echo "   [ ] Choose monthly or one-time plan"
echo "   [ ] Use test card: 4242 4242 4242 4242"
echo "   [ ] Complete payment"
echo "   [ ] Profile shows active subscription"
echo ""
echo "4. USAGE TRACKING:"
echo "   [ ] Hover over profile to see usage"
echo "   [ ] Progress bar shows remaining gens"
echo "   [ ] Counter updates after each tailor"
echo ""
echo "5. WEBHOOKS (Local Testing):"
echo "   [ ] Install Stripe CLI"
echo "   [ ] Run: stripe listen --forward-to localhost:5000/api/webhook/stripe"
echo "   [ ] Copy webhook secret to STRIPE_WEBHOOK_SECRET in .env"
echo "   [ ] Restart server"
echo "   [ ] Complete test payment"
echo "   [ ] Check Stripe logs for webhook delivery"
echo ""

echo -e "${BLUE}Database Commands${NC}"
echo "======================================"
echo ""
echo "View users:"
echo -e "${YELLOW}psql \$DATABASE_URL -c \"SELECT id, email, tier FROM users;\"${NC}"
echo ""
echo "View subscriptions:"
echo -e "${YELLOW}psql \$DATABASE_URL -c \"SELECT * FROM subscriptions;\"${NC}"
echo ""
echo "Reset usage for testing:"
echo -e "${YELLOW}psql \$DATABASE_URL -c \"UPDATE usage_metrics SET generationsUsed=0;\"${NC}"
echo ""

echo -e "${BLUE}Troubleshooting${NC}"
echo "======================================"
echo ""
echo "Database errors:"
echo "  → Ensure PostgreSQL is running"
echo "  → Check DATABASE_URL in .env"
echo "  → Try: createdb resume_rush"
echo ""
echo "Google OAuth errors:"
echo "  → Verify VITE_GOOGLE_CLIENT_ID in client/.env.local"
echo "  → Check Google Cloud Console settings"
echo "  → Ensure localhost:5173 is in authorized origins"
echo ""
echo "Stripe errors:"
echo "  → Verify API keys in .env files"
echo "  → Test with card: 4242 4242 4242 4242"
echo "  → Check webhook in Stripe dashboard"
echo ""
echo "Token errors:"
echo "  → Clear browser localStorage"
echo "  → Log out and log back in"
echo "  → Check JWT_SECRET in server/.env"
echo ""

echo ""
echo -e "${GREEN}Setup check complete!${NC}"
echo ""
echo "For detailed information, see:"
echo "  → PAYWALL_IMPLEMENTATION.md"
echo "  → QUICK_START.md"
echo ""
