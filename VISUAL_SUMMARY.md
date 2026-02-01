# 🎯 PAYWALL SYSTEM - VISUAL SUMMARY

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     RESUME ROCKET - PAYWALL SYSTEM              │
└─────────────────────────────────────────────────────────────────┘

                         FRONTEND (React)
                    ┌──────────────────────┐
                    │   localhost:5173     │
                    │                      │
        ┌───────────┼──────────────────────┼──────────┐
        │           │                      │          │
    ┌───▼──┐   ┌───▼──────────┐   ┌──────▼──┐  ┌───▼──────┐
    │Login │   │ Upload Form  │   │ PayWall │  │ Profile  │
    │Button│   │   w/ Usage   │   │ Modal   │  │ Dropdown │
    └──────┘   └──────────────┘   └─────────┘  └──────────┘
        │            │                  │           │
        └────────────┼──────────────────┼───────────┘
                     │                  │
         ┌───────────▼──────┬───────────▼───────────┐
         │                  │                       │
    ┌────▼─────────────┐    │    ┌─────────────┐   │
    │ AuthContext      │    │    │  useAuth()  │   │
    │ - Global State   │    │    │  Hook       │   │
    │ - loginGoogle()  │    │    └─────────────┘   │
    │ - localStorage   │    │                      │
    └──────────────────┘    │    ┌─────────────┐   │
                            │    │   Stripe    │   │
                            │    │  Checkout   │   │
                            │    └─────────────┘   │
        ┌───────────────────┼────────────────────────┤
        │                   │                        │
        │          AXIOS HTTP REQUESTS               │
        │                   │                        │
        ▼                   ▼                        ▼
┌──────────────────────────────────────────────────────────────┐
│                  BACKEND (Node.js + Express)                 │
│                   localhost:5000                              │
│                                                                │
│  Routes:                                                       │
│  ├─ /api/auth/google    → Google OAuth verification          │
│  ├─ /api/auth/me        → Get current user + usage           │
│  ├─ /api/upload         → Parse resume (with tier check)     │
│  ├─ /api/tailor         → Tailor resume (with limits)        │
│  ├─ /api/checkout       → Create Stripe session              │
│  └─ /api/webhook/stripe → Handle payment webhooks            │
│                                                                │
│  Middleware:                                                   │
│  ├─ optionalAuthMiddleware  → Check JWT token if present     │
│  └─ authMiddleware          → Require JWT token              │
│                                                                │
│  Libraries:                                                    │
│  ├─ Google Auth Library    (verify OAuth tokens)              │
│  ├─ Stripe SDK             (payment processing)               │
│  └─ Sequelize ORM          (database queries)                 │
│                                                                │
└──────────────────────────────────────────────────────────────┘
        │                   │                        │
        │        DATABASE QUERIES                    │
        │                   │                        │
        ▼                   ▼                        ▼
┌──────────────────────────────────────────────────────────────┐
│              POSTGRESQL DATABASE                              │
│            (Auto-created on first run)                        │
│                                                                │
│  Tables:                                                       │
│  ├─ users                → Google OAuth accounts              │
│  │  ├─ id, email                                              │
│  │  ├─ googleId, name, picture                                │
│  │  ├─ tier (free, auth-free, monthly, one-time)             │
│  │  └─ timestamps                                             │
│  │                                                             │
│  ├─ subscriptions       → Stripe subscription tracking        │
│  │  ├─ id, userId                                             │
│  │  ├─ stripeCustomerId, stripeSubscriptionId                │
│  │  ├─ tier, status                                           │
│  │  ├─ currentPeriodStart, currentPeriodEnd                   │
│  │  └─ timestamps                                             │
│  │                                                             │
│  ├─ usage_metrics       → Generation & job limits             │
│  │  ├─ id, userId                                             │
│  │  ├─ generationsUsed, generationsLimit                      │
│  │  ├─ currentJobCount, maxJobCount                           │
│  │  ├─ resetDate                                              │
│  │  └─ timestamps                                             │
│  │                                                             │
│  ├─ resumes             → Parsed resume history               │
│  ├─ tailorings          → Tailored resume history             │
│  └─ (all with FK to users)                                    │
│                                                                │
└──────────────────────────────────────────────────────────────┘
        │                   │                        │
        │     EXTERNAL API CALLS                     │
        │                   │                        │
        ▼                   ▼                        ▼
┌──────────────────────────────────────────────────────────────┐
│           EXTERNAL SERVICES                                   │
│                                                                │
│  Google OAuth                  Stripe                          │
│  ├─ Verify ID tokens          ├─ Create checkout sessions    │
│  └─ Get user profile           ├─ Process payments            │
│                                 ├─ Send webhooks              │
│                                 └─ Manage subscriptions       │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

## User Journey Map

```
┌─────────────────────────────────────────────────────────────────┐
│                      FIRST TIME USER                            │
└─────────────────────────────────────────────────────────────────┘

1. VISIT APP
   └─→ http://localhost:5173
       └─→ See upload form + "Sign in with Google" button

2. TRY WITHOUT LOGIN (Free Tier)
   ├─ Upload resume
   ├─ Add job description
   ├─ Tailor resume (x3)
   └─ After 3rd generation → ⚠️ PAYWALL APPEARS
       ├─ "Generation limit reached"
       ├─ Two options:
       │  ├─ Monthly Plan: $7.99/month (200 gens)
       │  └─ One-Time: $5 for 5 days (50 gens)
       └─ Button: "Upgrade Now" → Stripe Checkout

3. LOGIN WITH GOOGLE (Auth-Free Tier)
   ├─ Click "Sign in with Google"
   ├─ Authorize with Google
   └─ Logged in! Profile shows:
       ├─ User avatar + name
       ├─ Tier: "Auth Free"
       ├─ Usage: "0 / 6 generations"
       └─ Can now generate 6 resumes

4. HIT LIMIT & UPGRADE (Paid Tier)
   ├─ After 6 generations → PaywallModal again
   ├─ Click "Monthly Plan" ($7.99)
   ├─ Redirected to Stripe Checkout
   ├─ Enter test card: 4242 4242 4242 4242
   ├─ Complete payment
   └─ Auto-redirected to success page
       ├─ Subscription activated
       ├─ Profile shows "Monthly Subscriber"
       ├─ New limit: 200 gens/month
       └─ Can tailor freely until month ends
```

## Tier Limits Visual

```
┌─────────────────┬──────────────┬──────────────┬─────────────┬──────────────┐
│ Feature         │ FREE         │ AUTH-FREE    │ MONTHLY     │ ONE-TIME     │
├─────────────────┼──────────────┼──────────────┼─────────────┼──────────────┤
│ Price           │ 🆓 Free      │ 🆓 Free      │ 💰 $7.99/mo │ 💰 $5 once   │
│ Generations     │ 3 ⚠️ LOW     │ 6 ✓ OK       │ 200 ✅ HIGH │ 50 ✅ OK     │
│ Jobs at Once    │ 1            │ 2            │ 10          │ 5            │
│ Login Required  │ ❌ No        │ ✅ Yes       │ ✅ Yes      │ ✅ Yes       │
│ Auto Renew      │ N/A          │ N/A          │ ✅ Monthly  │ ❌ No (5d)   │
│ Data Persisted  │ ❌ No        │ ✅ Yes       │ ✅ Yes      │ ✅ Yes       │
├─────────────────┼──────────────┼──────────────┼─────────────┼──────────────┤
│ Use Case        │ Try first    │ Regular use  │ Power user  │ Quick test   │
└─────────────────┴──────────────┴──────────────┴─────────────┴──────────────┘

Legend:
🆓  = Free
💰  = Paid
❌  = No/Not applicable
✅  = Yes
⚠️  = Low/Limited
```

## Authentication Flow Diagram

```
                            USER
                              │
                    Click "Sign in with Google"
                              │
                              ▼
                    ┌─────────────────────┐
                    │   Google OAuth      │
                    │   Dialog Opens      │
                    └─────────────────────┘
                              │
                    User authorizes with Google
                              │
                              ▼
                    Google returns ID token
                              │
                              ▼
                    ┌─────────────────────────────┐
                    │ POST /api/auth/google       │
                    │ Body: { token: ... }        │
                    └─────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────────────┐
                    │ Backend:                    │
                    │ 1. Verify Google token     │
                    │ 2. Extract email, name     │
                    │ 3. Find or create user     │
                    │ 4. Create UsageMetrics     │
                    │ 5. Create Subscription     │
                    │ 6. Generate JWT token      │
                    └─────────────────────────────┘
                              │
                              ▼
                    Return JWT token to Frontend
                              │
                              ▼
                    ┌─────────────────────────────┐
                    │ Frontend:                   │
                    │ 1. Store JWT in localStorage
                    │ 2. Update user state       │
                    │ 3. Show user profile       │
                    │ 4. Hide "Sign in" button   │
                    └─────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────────────┐
                    │ Subsequent Requests:        │
                    │ Authorization: Bearer {JWT} │
                    │ Server validates JWT       │
                    │ User authenticated ✓        │
                    └─────────────────────────────┘
```

## Payment Flow Diagram

```
USER HITS GENERATION LIMIT
        │
        ▼
┌──────────────────────┐
│  PaywallModal        │
│  Shows two plans:    │
│  1. Monthly $7.99    │
│  2. One-time $5      │
│                      │
│  Button: "Upgrade"   │
└──────────────────────┘
        │
    User selects plan
        │
        ▼
POST /api/checkout
├─ planType: "monthly" | "one-time"
├─ JWT token in Authorization header
└─ Backend creates Stripe session
        │
        ▼
Frontend receives sessionId
        │
        ▼
Redirect to Stripe Checkout
        │
        ▼
┌──────────────────────────┐
│  Stripe Payment Form     │
│  ├─ Card: 4242...       │
│  ├─ Expiry: 12/25       │
│  ├─ CVC: 123            │
│  └─ Billing info        │
│                         │
│  Button: "Pay $7.99"    │
└──────────────────────────┘
        │
    User enters payment info
        │
        ▼
Stripe processes payment
        │
        ├─ Payment successful ✓
        │
        ▼
┌──────────────────────────────────┐
│ POST /api/webhook/stripe         │
│ ├─ Event: checkout.session.completed
│ ├─ Signature verified            │
│ └─ Database updated:             │
│    ├─ users.tier = "monthly"     │
│    ├─ subscriptions created      │
│    └─ usage_metrics updated      │
└──────────────────────────────────┘
        │
        ▼
Frontend redirected to /checkout/success
        │
        ▼
┌──────────────────────────┐
│  Success Page ✓          │
│  ├─ "Payment Successful" │
│  ├─ Plan activated       │
│  └─ Redirect home (3s)   │
└──────────────────────────┘
        │
        ▼
User can now generate 200 resumes/month!
```

## Usage Tracking Flow

```
USER UPLOADS RESUME
        │
        ▼
┌─────────────────────────────────────┐
│ POST /api/upload                    │
│ + Authorization: Bearer {JWT}       │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ Backend Tier Check:                 │
│ 1. Get user tier from JWT           │
│ 2. Query UsageMetrics               │
│ 3. Calculate: generationsLimit -    │
│    generationsUsed                  │
└─────────────────────────────────────┘
        │
        ├─ Remaining > 0? ✓ YES
        │       │
        │       ▼
        │   ┌──────────────────┐
        │   │ Process Request: │
        │   │ 1. Parse resume  │
        │   │ 2. Store data    │
        │   │ 3. Tailor resume │
        │   └──────────────────┘
        │       │
        │       ▼
        │   ┌──────────────────────────────┐
        │   │ Increment Usage Counter:     │
        │   │ generationsUsed += 1         │
        │   │ Save to database             │
        │   └──────────────────────────────┘
        │       │
        │       ▼
        │   ┌──────────────────────────────┐
        │   │ Return 200 Success           │
        │   │ ├─ parsed resume data        │
        │   │ └─ usage stats:              │
        │   │    ├─ used: 2                │
        │   │    ├─ limit: 6               │
        │   │    └─ remaining: 4           │
        │   └──────────────────────────────┘
        │
        └─ Remaining = 0? ✗ NO
                │
                ▼
        ┌──────────────────────────┐
        │ Return 402 Payment       │
        │ Required:                │
        │ ├─ error message         │
        │ ├─ tier: "free"          │
        │ ├─ remaining: 0          │
        │ └─ limit: 3              │
        └──────────────────────────┘
                │
                ▼
        Frontend shows PaywallModal
        User prompted to upgrade
```

## File Structure

```
Resume Rocket/
├── 📄 README_PAYWALL.md              ← START HERE
├── 📄 QUICK_START.md                 ← Setup guide
├── 📄 PAYWALL_IMPLEMENTATION.md       ← Technical docs
├── 📄 IMPLEMENTATION_SUMMARY.md       ← Feature list
├── 🧪 test-setup.sh                  ← Testing checklist
│
├── server/                           ← Backend
│   ├── 📄 index.js                   (main + API routes)
│   ├── 🔐 auth.js                    (JWT utilities)
│   ├── 🔐 authRoutes.js              (Google OAuth)
│   ├── 🗄️  database.js                (Sequelize models)
│   ├── 💰 stripeRoutes.js            (Payment routes)
│   ├── 📊 tiers.js                   (Tier config)
│   ├── .env                          (Config ✓)
│   └── package.json                  (Dependencies ✓)
│
├── client/                           ← Frontend
│   ├── src/
│   │   ├── main.jsx                  (App entry + routing)
│   │   ├── App.jsx                   (Core app)
│   │   │
│   │   ├── context/
│   │   │   └── 🔐 AuthContext.jsx    (Global auth state)
│   │   │
│   │   ├── components/
│   │   │   ├── UserProfile.jsx       (Login + profile)
│   │   │   ├── PaywallModal.jsx      (Upgrade modal)
│   │   │   ├── BugReport.jsx         (Bug reporting)
│   │   │   └── AdUnit.jsx            (Ad placement)
│   │   │
│   │   ├── pages/
│   │   │   ├── Home.jsx              (Main page)
│   │   │   ├── CheckoutSuccess.jsx   (Payment success)
│   │   │   ├── CheckoutCancel.jsx    (Payment cancel)
│   │   │   └── (About, Privacy, Terms, FAQ)
│   │   │
│   │   └── styles/
│   │       ├── UserProfile.css       (Profile styling)
│   │       ├── PaywallModal.css      (Modal styling)
│   │       ├── CheckoutPages.css     (Checkout styling)
│   │       └── (Other styles)
│   │
│   ├── .env.local                    (Config ✓)
│   └── package.json                  (Dependencies ✓)
│
└── 🗄️  PostgreSQL Database
    ├── users (Google OAuth accounts)
    ├── subscriptions (Stripe tracking)
    ├── usage_metrics (Limits & counters)
    ├── resumes (Parsed data)
    └── tailorings (Tailored versions)
```

## Key Technologies

```
┌─────────────────────────────────────────────────────────────┐
│                    TECH STACK                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Backend:                                                    │
│  ├─ Node.js + Express (Server)                             │
│  ├─ Sequelize + PostgreSQL (Database)                      │
│  ├─ Google Auth Library (OAuth)                            │
│  ├─ Stripe SDK (Payments)                                  │
│  ├─ JWT (Sessions)                                         │
│  └─ Nodemailer (Email)                                     │
│                                                              │
│  Frontend:                                                   │
│  ├─ React 19 (UI)                                          │
│  ├─ Vite (Build)                                           │
│  ├─ React Router (Navigation)                              │
│  ├─ @react-oauth/google (Google SignIn)                    │
│  ├─ @stripe/react-stripe-js (Payments)                     │
│  └─ Axios (HTTP)                                           │
│                                                              │
│  Database:                                                   │
│  └─ PostgreSQL (Relational DB)                             │
│                                                              │
│  External Services:                                          │
│  ├─ Google OAuth 2.0                                       │
│  ├─ Stripe Payments                                        │
│  ├─ Gemini AI (resume parsing)                             │
│  └─ Gmail SMTP (emails)                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

**Status**: ✅ Complete  
**Last Updated**: January 13, 2026  
**Ready for**: Development & Production
