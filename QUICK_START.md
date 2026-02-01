# Quick Start Guide - Paywall System

## What's New

The Resume Rocket app now has a complete paywall system with:
✅ Google OAuth authentication  
✅ Multi-tier pricing (free → auth-free → monthly/one-time)  
✅ Stripe payment processing  
✅ PostgreSQL database persistence  
✅ Usage tracking and limits  
✅ User profiles and subscription management  

## Step 1: Database Setup ✓ DONE

Your `.env` already has:
```
DATABASE_URL=postgresql://postgres:Theholypanther77@localhost:5432/resume_rush
```

The database will auto-create tables when the server starts.

## Step 2: Environment Variables ✓ DONE

**Server** (.env) - Already configured with:
- ✅ STRIPE_SECRET_KEY (live key)
- ✅ STRIPE_PUBLIC_KEY (live key)
- ✅ GOOGLE_CLIENT_ID & SECRET
- ✅ DATABASE_URL
- ✅ JWT_SECRET & STRIPE_WEBHOOK_SECRET (placeholder)

**Frontend** (.env.local) - Already configured with:
- ✅ VITE_API_URL=http://localhost:5000
- ✅ VITE_STRIPE_PUBLIC_KEY
- ✅ VITE_GOOGLE_CLIENT_ID

## Step 3: Run the Server

```bash
cd server
npm run dev
```

You should see:
```
✓ Database connected
✓ Database models synchronized
✓ Gemini API configured
✓ Database connected
✓ Ready to parse resumes
🚀 Resume Rocket server running on http://localhost:5000
```

## Step 4: Run the Frontend

```bash
cd client
npm run dev
```

Open http://localhost:5173 in your browser.

## Step 5: Test the System

### Test 1: Upload Without Login (Free Tier)
1. Upload a resume
2. Add a job description
3. Click "Tailor Resume"
4. After 3 uploads → See paywall modal
5. Click "Upgrade Now" to see payment options

### Test 2: Login & Paid Plan
1. Click "Sign in with Google" (new button on top right)
2. Select your Google account
3. Profile shows "Auth Free" tier (6 generations)
4. Click "Upgrade" in paywall
5. Choose "Monthly Plan" ($7.99)
6. Use test card: **4242 4242 4242 4242**
7. Complete payment
8. Profile should show active subscription

### Test 3: Check Usage Tracking
1. After login, hover over your profile
2. See "Generations Used: X / Y"
3. Progress bar shows remaining
4. When you hit limit → Paywall appears

## Important Notes

### Stripe Test Mode
- You're using **LIVE keys** (not test keys)
- For testing, use the test card: `4242 4242 4242 4242`
- With live keys, real payments will be processed
- **Be careful in production**

### Google OAuth
- Configured with `resumerush.io` and `localhost:5173`
- To add more domains: Update Google Cloud Console

### Webhook Testing (Local Development)
To receive Stripe events locally:

```bash
# Install Stripe CLI (one time)
# https://stripe.com/docs/stripe-cli

# Start listening to webhook
stripe listen --forward-to localhost:5000/api/webhook/stripe

# Copy the webhook secret shown and update .env:
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx
```

## File Structure

New files created:
```
server/
  ├── database.js              (Sequelize models & initialization)
  ├── auth.js                  (JWT & auth middleware)
  ├── tiers.js                 (Tier config & enforcement)
  ├── authRoutes.js            (Google OAuth endpoints)
  └── stripeRoutes.js          (Payment endpoints)

client/src/
  ├── context/
  │   └── AuthContext.jsx      (Global auth state)
  ├── components/
  │   ├── UserProfile.jsx      (Profile dropdown & login)
  │   └── PaywallModal.jsx     (Upgrade modal)
  ├── pages/
  │   ├── CheckoutSuccess.jsx
  │   └── CheckoutCancel.jsx
  └── styles/
      ├── UserProfile.css
      ├── PaywallModal.css
      └── CheckoutPages.css
```

## Database Tables

Auto-created on first run:
- `users` - User accounts from Google login
- `subscriptions` - Stripe subscription status
- `usage_metrics` - Generation & job count tracking
- `resumes` - Parsed resume history
- `tailorings` - Tailored resume history

## Tier Limits

| Feature | Free | Auth Free | Monthly ($7.99) | One-Time ($5) |
|---------|------|-----------|-----------------|---------------|
| Generations/month | 3 | 6 | 200 | 50 (5 days) |
| Jobs at once | 1 | 2 | 10 | 5 |
| Login Required | No | Yes | Yes | Yes |
| Auto-renew | N/A | N/A | Yes | No |

## What's Happening Behind the Scenes

1. **Upload endpoint** (`/api/upload`):
   - Checks user's tier and remaining generations
   - Returns 402 if limit reached (triggers paywall)
   - Increments usage counter after success

2. **Tailor endpoint** (`/api/tailor`):
   - Checks both generation AND job limit
   - Increments both counters
   - Returns usage info in response

3. **Google Auth** (`/api/auth/google`):
   - Verifies Google token
   - Creates user if new
   - Sets tier to "auth-free" on first login
   - Creates usage metrics (6 gens, 2 jobs)

4. **Stripe Payment** (`/api/checkout`):
   - Creates Stripe session
   - Links to user via metadata
   - Frontend redirects to Stripe Checkout

5. **Webhooks** (`/api/webhook/stripe`):
   - Receives payment confirmation
   - Updates subscription tier
   - Can auto-downgrade on cancellation

## Common Tasks

### Add a New User Manually (for testing)
```javascript
// In your Node.js console
const { User, UsageMetrics } = require('./database');

const user = await User.create({
  email: 'test@example.com',
  tier: 'monthly'
});

await UsageMetrics.create({
  userId: user.id,
  generationsLimit: 200,
  maxJobCount: 10
});
```

### Check Database State
```bash
# Connect to PostgreSQL
psql -U postgres -d resume_rush

# View users
SELECT id, email, tier, "createdAt" FROM users;

# View subscriptions
SELECT * FROM subscriptions;

# View usage
SELECT * FROM usage_metrics;
```

### Reset User's Usage (for testing)
```sql
UPDATE usage_metrics 
SET "generationsUsed" = 0, "currentJobCount" = 0 
WHERE "userId" = 'user-id-here';
```

## Troubleshooting

### "Database connection failed"
→ Ensure PostgreSQL is running and DATABASE_URL is correct

### "Google login not working"
→ Check VITE_GOOGLE_CLIENT_ID in client/.env.local

### "Stripe checkout returns error"
→ Ensure VITE_STRIPE_PUBLIC_KEY is correct (pk_live_...)

### "Webhook not firing"
→ Run Stripe CLI with correct secret in .env

### "Bearer token error"
→ Clear localStorage and log in again

## Next Steps

1. **Test the full payment flow** with test Stripe card
2. **Verify webhook** with Stripe CLI
3. **Check logs** to ensure tier enforcement is working
4. **Try all tiers** (free → free tier limit → upgrade → paid)
5. **Test cancellation** to verify downgrade works

## Production Checklist

- [ ] Update `FRONTEND_URL` in .env to production domain
- [ ] Update `DATABASE_URL` to production PostgreSQL
- [ ] Use production Stripe keys (already configured)
- [ ] Set strong `JWT_SECRET` in .env
- [ ] Configure Stripe webhook to production endpoint
- [ ] Add production domain to Google OAuth
- [ ] Enable HTTPS everywhere
- [ ] Set up database backups
- [ ] Monitor webhook delivery in Stripe dashboard
- [ ] Test payment flow end-to-end

---

**Questions?** Check the detailed docs in `PAYWALL_IMPLEMENTATION.md`
