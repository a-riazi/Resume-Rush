const express = require('express');
const Stripe = require('stripe');
const { OAuth2Client } = require('google-auth-library');
const { User, UsageMetrics, Subscription } = require('./database');
const { generateToken, authMiddleware } = require('./auth');
const { TIER_CONFIG } = require('./tiers');

const router = express.Router();
const oauth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const allowedGoogleClientIds = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_ID_WEB,
  process.env.GOOGLE_CLIENT_ID_DEV,
  // Frontend fallback client ID used in development
  '773935745374-e7tne0elj25une1e1gugkskdpj8t91ku.apps.googleusercontent.com',
].filter(Boolean);

async function extractStripePeriodBounds(stripeSub) {
  if (!stripeSub) return { periodStart: null, periodEnd: null };

  // Newer Stripe payloads may omit top-level current_period_* and provide them on the item.
  const item = stripeSub.items?.data?.[0] || null;
  let periodStart = stripeSub.current_period_start || item?.current_period_start || null;
  let periodEnd = stripeSub.current_period_end || item?.current_period_end || null;

  // Final fallback: derive from latest invoice periods if needed.
  if ((!periodStart || !periodEnd) && stripe && stripeSub.latest_invoice) {
    try {
      const invoice = await stripe.invoices.retrieve(stripeSub.latest_invoice);
      periodStart = periodStart || invoice.period_start || invoice.lines?.data?.[0]?.period?.start || null;
      periodEnd = periodEnd || invoice.period_end || invoice.lines?.data?.[0]?.period?.end || null;
    } catch (error) {
      console.error('[/api/auth/me] Failed invoice period fallback:', error.message);
    }
  }

  return { periodStart, periodEnd };
}

async function syncStripeSubscriptionForUser(user) {
  if (!stripe || !user?.email) return null;

  const customers = await stripe.customers.list({
    email: user.email,
    limit: 1,
  });

  if (!customers.data.length) return null;

  const customer = customers.data[0];
  const subscriptions = await stripe.subscriptions.list({
    customer: customer.id,
    status: 'all',
    limit: 10,
  });

  if (!subscriptions.data.length) return null;

  const latest = subscriptions.data.sort((a, b) => b.created - a.created)[0];
  if (!latest) return null;

  const detailed = await stripe.subscriptions.retrieve(latest.id);
  const stripeSub = detailed || latest;
  const { periodStart, periodEnd } = await extractStripePeriodBounds(stripeSub);

  const shouldCancel = stripeSub.cancel_at_period_end === true || stripeSub.status === 'canceled';
  const mappedStatus = shouldCancel ? 'canceled' : 'active';

  const [record] = await Subscription.findOrCreate({
    where: { stripeSubscriptionId: stripeSub.id },
    defaults: {
      userId: user.id,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: stripeSub.id,
      tier: 'monthly',
      status: mappedStatus,
      currentPeriodStart: periodStart ? new Date(periodStart * 1000) : null,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    },
  });

  if (record) {
    record.userId = user.id;
    record.stripeCustomerId = customer.id;
    record.tier = 'monthly';
    record.status = mappedStatus;
    record.currentPeriodStart = periodStart ? new Date(periodStart * 1000) : record.currentPeriodStart;
    record.currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : record.currentPeriodEnd;
    await record.save();
    return record;
  }

  return null;
}

async function refreshLocalSubscriptionFromStripe(subscription) {
  if (!stripe || !subscription?.stripeSubscriptionId) return subscription;

  try {
    const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
    const { periodStart, periodEnd } = await extractStripePeriodBounds(stripeSub);
    const shouldCancel = stripeSub.cancel_at_period_end === true || stripeSub.status === 'canceled';

    subscription.status = shouldCancel ? 'canceled' : 'active';
    subscription.currentPeriodStart = periodStart
      ? new Date(periodStart * 1000)
      : subscription.currentPeriodStart;
    subscription.currentPeriodEnd = periodEnd
      ? new Date(periodEnd * 1000)
      : subscription.currentPeriodEnd;
    await subscription.save();
  } catch (error) {
    console.error(`[/api/auth/me] Stripe refresh failed for ${subscription.stripeSubscriptionId}:`, error.message);
  }

  return subscription;
}

// POST /api/auth/google - Verify Google token and authenticate user
router.post('/auth/google', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'No token provided' });
    }

    // Verify the token with Google
    const ticket = await oauth2Client.verifyIdToken({
      idToken: token,
      audience: allowedGoogleClientIds,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Find or create user (link existing same-email users to Google ID)
    let user = await User.findOne({ where: { googleId } });

    if (!user && email) {
      user = await User.findOne({ where: { email } });
      if (user) {
        user.googleId = googleId;
        if (name && user.name !== name) user.name = name;
        if (picture && user.picture !== picture) user.picture = picture;
        await user.save();
      }
    }

    if (!user) {
      // New user - create with auth-free tier
      user = await User.create({
        googleId,
        email,
        name,
        picture,
        tier: 'auth-free',
      });

      // Create usage metrics for new user
      await UsageMetrics.create({
        userId: user.id,
        generationsUsed: 0,
        generationsLimit: TIER_CONFIG['auth-free'].generationsLimit,
        currentJobCount: 0,
        maxJobCount: TIER_CONFIG['auth-free'].jobsPerSession,
        resetDate: new Date(),
      });

      // Create subscription record
      await Subscription.create({
        userId: user.id,
        tier: 'auth-free',
        status: 'active',
      });

      console.log(`✓ New user created: ${email}`);
    } else {
      // Update user info if changed
      if (user.name !== name || user.picture !== picture) {
        user.name = name;
        user.picture = picture;
        await user.save();
      }
    }

    // Generate JWT token
    const jwtToken = generateToken(user.id);

    res.json({
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        tier: user.tier,
      },
    });
  } catch (error) {
    console.error('❌ Google auth failed:', error.message);
    res.status(401).json({ error: 'Authentication failed', details: error.message });
  }
});

// GET /api/auth/me - Get current user info
router.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    console.log('[/api/auth/me] Fetching user:', req.userId);
    console.log('[/api/auth/me] User model available:', !!User);
    console.log('[/api/auth/me] UsageMetrics model available:', !!UsageMetrics);
    console.log('[/api/auth/me] Subscription model available:', !!Subscription);

    const user = await User.findByPk(req.userId);
    console.log('[/api/auth/me] User found:', !!user);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get usage metrics separately (create if missing)
    let usageMetrics = await UsageMetrics.findOne({
      where: { userId: req.userId },
      order: [['createdAt', 'DESC']],
    });

    if (!usageMetrics) {
      const tierConfig = TIER_CONFIG[user.tier] || TIER_CONFIG['auth-free'] || TIER_CONFIG.free;
      usageMetrics = await UsageMetrics.create({
        userId: user.id,
        generationsUsed: 0,
        generationsLimit: tierConfig.generationsLimit,
        currentJobCount: 0,
        maxJobCount: tierConfig.jobsPerSession,
        resetDate: new Date(),
      });
    }

    console.log('[/api/auth/me] UsageMetrics found:', !!usageMetrics);

    // Get subscription separately
    let subscriptions = await Subscription.findAll({
      where: { userId: req.userId },
      order: [['createdAt', 'DESC']],
    });

    if (!subscriptions.length && user.tier === 'monthly') {
      const synced = await syncStripeSubscriptionForUser(user);
      if (synced) {
        subscriptions = [synced];
      }
    }

    let subscription = subscriptions.find((item) => item.tier === 'monthly')
      || subscriptions.find((item) => item.tier === 'one-time')
      || subscriptions[0]
      || null;

    if (subscription && subscription.tier === 'monthly' && !subscription.currentPeriodEnd) {
      const synced = await syncStripeSubscriptionForUser(user);
      if (synced) {
        subscription = synced;
      }
    }

    if (subscription && subscription.tier === 'monthly' && subscription.stripeSubscriptionId) {
      subscription = await refreshLocalSubscriptionFromStripe(subscription);
    }

    console.log('[/api/auth/me] Subscription found:', !!subscription);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        tier: user.tier,
      },
      usage: usageMetrics ? {
        used: usageMetrics.generationsUsed,
        limit: usageMetrics.generationsLimit,
        generationsUsed: usageMetrics.generationsUsed,
        generationsLimit: usageMetrics.generationsLimit,
        currentJobCount: usageMetrics.currentJobCount,
        maxJobCount: usageMetrics.maxJobCount,
        bonusGenerations: Math.min(50, usageMetrics.bonusGenerations || 0),
        bonusExpiresAt: usageMetrics.bonusExpiresAt || null,
        bonusDaysLeft: usageMetrics.bonusExpiresAt
          ? Math.max(0, Math.min(5, Math.ceil((new Date(usageMetrics.bonusExpiresAt) - new Date()) / (1000 * 60 * 60 * 24))))
          : null,
      } : null,
      subscription: subscription ? {
        tier: subscription.tier,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      } : null,
    });
  } catch (error) {
    console.error('❌ Failed to fetch user:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to fetch user', details: error.message });
  }
});

// POST /api/auth/logout - Logout (optional, for frontend to clear token)
router.post('/auth/logout', authMiddleware, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
