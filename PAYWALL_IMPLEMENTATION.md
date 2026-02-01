# Resume Rocket - Paywall System Implementation

## Overview

The Resume Rush application now includes a complete multi-tier paywall system with user authentication via Google OAuth 2.0, Stripe payment processing, and PostgreSQL database persistence.

## Architecture

### Backend Stack
- **Express.js** - API server
- **Sequelize** - ORM for PostgreSQL
- **PostgreSQL** - Database
- **Google Auth Library** - OAuth token verification
- **Stripe SDK** - Payment processing
- **JWT** - User session management
- **Nodemailer** - Email notifications

### Frontend Stack
- **React 19** - UI framework
- **Vite** - Build tool
- **React Router** - Navigation
- **@react-oauth/google** - Google Sign-In
- **@stripe/react-stripe-js** - Stripe integration
- **Axios** - HTTP client

## Tier Configuration

```javascript
FREE: 3 generations, 1 job at a time (no account required)
AUTH-FREE: 6 generations, 2 jobs at a time (Google login)
MONTHLY: $7.99/month → 200 generations, 10 jobs at a time
ONE-TIME: $5 one-time → 50 generations for 5 days, 5 jobs at a time
```

## Database Schema

### Users Table
```sql
- id (UUID, primary key)
- email (unique)
- googleId (unique)
- name
- picture
- tier (free, auth-free, monthly, one-time)
- createdAt, updatedAt
```

### Subscriptions Table
```sql
- id (UUID, primary key)
- userId (foreign key)
- stripeCustomerId
- stripeSubscriptionId
- tier
- status (active, paused, canceled, expired)
- currentPeriodStart, currentPeriodEnd
- createdAt, updatedAt
```

### UsageMetrics Table
```sql
- id (UUID, primary key)
- userId (foreign key)
- generationsUsed (counter)
- generationsLimit (based on tier)
- currentJobCount (counter)
- maxJobCount (based on tier)
- resetDate
- createdAt, updatedAt
```

### Resumes & Tailorings Tables
- Store user's resume parsing and tailoring history
- Link to userId for authenticated users

## Authentication Flow

1. **Frontend**: User clicks "Sign in with Google"
2. **Google OAuth**: User authenticates with Google
3. **Frontend**: Sends Google ID token to backend `/api/auth/google`
4. **Backend**: 
   - Verifies token with Google
   - Creates/updates user in database
   - Creates default UsageMetrics and Subscription
   - Returns JWT token
5. **Frontend**: Stores JWT in localStorage
6. **Subsequent Requests**: Include `Authorization: Bearer {JWT}` header

## API Endpoints

### Authentication
```
POST /api/auth/google
  Body: { token: googleIdToken }
  Returns: { token: jwtToken, user: {...} }

GET /api/auth/me
  Headers: Authorization: Bearer {token}
  Returns: { user, usage, subscription }

POST /api/auth/logout
  Headers: Authorization: Bearer {token}
```

### Resume Processing (Updated with tier enforcement)
```
POST /api/upload
  - Requires tier check
  - Returns usage info: { used, limit, remaining }
  - Returns 402 if limit reached

POST /api/tailor
  - Requires tier check for both generations and job count
  - Returns usage info with job count tracking
  - Returns 402 if limit reached
```

### Stripe Checkout
```
POST /api/checkout
  Body: { planType: 'monthly' | 'one-time' }
  Headers: Authorization: Bearer {token}
  Returns: { sessionId, clientSecret }

POST /api/webhook/stripe
  - Handles: checkout.session.completed
  - Handles: customer.subscription.* events
  - Updates user tier and subscription status
```

## Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://user:password@localhost:5432/resume_rush
JWT_SECRET=your-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_MONTHLY_PRICE_ID=price_...
STRIPE_ONE_TIME_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=http://localhost:5173
```

### Frontend (.env.local)
```
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_STRIPE_PUBLIC_KEY=pk_live_...
```

## Key Components

### AuthContext (client/src/context/AuthContext.jsx)
- Manages global authentication state
- Handles Google login/logout
- Provides useAuth hook for components
- Auto-login on app startup from localStorage

### UserProfile Component (client/src/components/UserProfile.jsx)
- Displays user info and tier
- Shows usage metrics progress bar
- Google Sign-In button for unauthenticated users
- Dropdown menu with subscription details

### PaywallModal Component (client/src/components/PaywallModal.jsx)
- Shows when user reaches generation limit
- Displays two upgrade options (monthly vs one-time)
- Integrates with Stripe Checkout
- Handles payment processing

### Checkout Pages
- `CheckoutSuccess.jsx` - Confirmation after payment
- `CheckoutCancel.jsx` - Canceled payment handling

## Usage Tracking

### On Upload Request
1. Check user's tier and remaining generations
2. If no remaining → return 402 with paywall info
3. Parse and tail resume
4. Increment `generationsUsed` counter
5. Return updated usage in response

### On Tailor Request
1. Check generations remaining
2. Check job count limit (current vs max for tier)
3. Process tailoring
4. Increment both `generationsUsed` and `currentJobCount`
5. Return updated usage metrics

## Payment Processing

### Checkout Flow
1. User selects plan (monthly or one-time)
2. Frontend requests session via `/api/checkout`
3. Backend creates Stripe session with metadata
4. Frontend redirects to Stripe Checkout
5. User completes payment

### Webhook Flow
1. Stripe sends event to `/api/webhook/stripe`
2. Backend verifies webhook signature
3. Updates user's subscription tier and status
4. On cancellation → revert user to free tier

## Tier Enforcement

### Free Tier
- Anonymous (no login required)
- 3 generations per session
- 1 job at a time
- No stored data

### Auth-Free Tier
- Requires Google login
- Automatic on first login
- 6 generations
- 2 jobs at a time
- Data persisted to database

### Paid Tiers
- Monthly: $7.99/month, 200 gens, 10 jobs
- One-Time: $5, 50 gens for 5 days, 5 jobs
- Reset monthly for monthly plan
- Auto-downgrade on subscription cancellation

## Testing Locally

### Prerequisites
```bash
# Ensure PostgreSQL is running
psql -U postgres -d resume_rush

# Install backend dependencies
cd server && npm install

# Install frontend dependencies
cd client && npm install
```

### Run Development
```bash
# Terminal 1: Backend
cd server
npm run dev

# Terminal 2: Frontend
cd client
npm run dev
```

### Test Payment Flow
1. **Stripe CLI** (for webhook testing locally):
   ```bash
   stripe listen --forward-to localhost:5000/api/webhook/stripe
   ```
   Copy the webhook secret and add to `.env`

2. **Test Card**: 4242 4242 4242 4242 (Stripe test card)

3. **Flow**:
   - Open app at localhost:5173
   - Sign in with Google
   - Upload resume
   - Add job description
   - Reach generation limit
   - Click "Upgrade" in paywall modal
   - Complete Stripe payment with test card
   - Verify subscription in user profile

## Production Deployment

### Railway (or Render/Heroku)
1. Set environment variables in deployment dashboard
2. Ensure PostgreSQL is provisioned
3. Deploy backend and frontend
4. Update `FRONTEND_URL` and `DATABASE_URL`
5. Configure Stripe webhook to production endpoint
6. Use live Stripe keys (already configured)

### Post-Deployment Checklist
- [ ] Test Google OAuth with production domain
- [ ] Configure Stripe webhooks for production
- [ ] Test payment flow end-to-end
- [ ] Monitor webhook logs in Stripe dashboard
- [ ] Set up database backups
- [ ] Enable HTTPS for all endpoints
- [ ] Update CORS origins for production domain

## Error Handling

### 402 Payment Required
Returned when:
- User reaches generation limit
- User reaches job-at-once limit
- Subscription expired

### Response Format
```json
{
  "error": "Generation limit reached. Please upgrade your plan.",
  "tier": "free",
  "remaining": 0,
  "limit": 3
}
```

Frontend detects 402 status and shows PaywallModal automatically.

## Future Enhancements

- [ ] Monthly usage reset scheduled job
- [ ] Usage analytics dashboard
- [ ] Admin panel for tier management
- [ ] Referral/discount codes
- [ ] Family/team plans
- [ ] Custom tier pricing
- [ ] Usage overage handling
- [ ] Account settings page
- [ ] Payment history/invoices

## Support & Debugging

### Common Issues

**"psql is not recognized"**
- Add PostgreSQL bin directory to PATH
- Or use pgAdmin for database management

**Webhook not firing**
- Ensure STRIPE_WEBHOOK_SECRET matches Stripe CLI output
- Check Railway/server logs for errors
- Verify webhook endpoint is publicly accessible

**Users stuck at free tier**
- Check AuthContext is properly initialized
- Verify JWT token is being stored/sent
- Clear localStorage and re-login

---

**Implemented**: January 2026  
**Status**: Production Ready  
**Last Updated**: 2026-01-13
