const express = require('express');
const Stripe = require('stripe');
const { Op } = require('sequelize');
const { User, Subscription, UsageMetrics } = require('./database');
const { authMiddleware } = require('./auth');
const { TIER_CONFIG } = require('./tiers');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

function mapStripeStatus(stripeSubscription) {
  if (!stripeSubscription) return 'active';
  const shouldCancel = stripeSubscription.cancel_at_period_end === true || stripeSubscription.status === 'canceled';
  return shouldCancel ? 'canceled' : 'active';
}

async function extractStripePeriodBounds(stripeSubscription) {
  if (!stripeSubscription) {
    return { periodStart: null, periodEnd: null };
  }

  const firstItem = stripeSubscription.items?.data?.[0] || null;
  let periodStart = stripeSubscription.current_period_start || firstItem?.current_period_start || null;
  let periodEnd = stripeSubscription.current_period_end || firstItem?.current_period_end || null;

  if ((!periodStart || !periodEnd) && stripeSubscription.latest_invoice) {
    try {
      const invoice = await stripe.invoices.retrieve(stripeSubscription.latest_invoice);
      periodStart = periodStart || invoice.period_start || invoice.lines?.data?.[0]?.period?.start || null;
      periodEnd = periodEnd || invoice.period_end || invoice.lines?.data?.[0]?.period?.end || null;
    } catch (error) {
      console.error('❌ Failed to extract invoice period bounds:', error.message);
    }
  }

  return { periodStart, periodEnd };
}

// POST /api/checkout - Create Stripe checkout session
router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    const { planType } = req.body; // 'monthly' or 'one-time'
    const user = await User.findByPk(req.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!['monthly', 'one-time'].includes(planType)) {
      return res.status(400).json({ error: 'Invalid plan type' });
    }

    const priceId = planType === 'monthly' 
      ? process.env.STRIPE_MONTHLY_PRICE_ID
      : process.env.STRIPE_ONE_TIME_PRICE_ID;

    if (!priceId) {
      return res.status(500).json({ error: 'Price ID not configured' });
    }

    // Create or retrieve Stripe customer
    let stripeCustomerId = null;
    let subscription = await Subscription.findOne({
      where: { userId: user.id, status: 'active' },
      order: [['createdAt', 'DESC']],
    });

    if (subscription && subscription.stripeCustomerId) {
      stripeCustomerId = subscription.stripeCustomerId;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer_email: user.email,
      mode: planType === 'monthly' ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/checkout/cancel`,
      metadata: {
        userId: user.id,
        planType,
      },
    });

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('❌ Checkout session creation failed:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
});

// POST /api/webhook/stripe - Handle Stripe webhooks
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error('❌ Webhook signature verification failed:', error.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionEvent(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Webhook processing failed:', error.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Helper: Handle checkout session completed
async function handleCheckoutSessionCompleted(session) {
  const userId = session.metadata?.userId;
  if (!userId) return;

  const user = await User.findByPk(userId);
  if (!user) return;

  const planType = session.metadata?.planType;
  const isSubscription = session.mode === 'subscription';

  if (isSubscription) {
    // Get subscription details
    const subscription = await stripe.subscriptions.retrieve(session.subscription);

    const previousTier = user.tier;

        // Keep one-time add-ons active; monthly should coexist with one-time passes

    // Update user tier and subscription
    user.tier = planType;
    await user.save();

    const [usageMetrics] = await UsageMetrics.findOrCreate({
      where: { userId: user.id },
      defaults: {
        generationsUsed: 0,
        generationsLimit: TIER_CONFIG[planType]?.generationsLimit || 200,
        currentJobCount: 0,
        maxJobCount: TIER_CONFIG[planType]?.jobsPerSession || 10,
        resetDate: new Date(),
      },
    });

    const baseLimit = TIER_CONFIG[planType]?.generationsLimit || 200;
    let carryOver = 0;
    let carryOverExpiry = null;

    const oneTimeSubscription = await Subscription.findOne({
      where: { userId: user.id, status: 'active', tier: 'one-time' },
      order: [['createdAt', 'DESC']],
    });

    if (oneTimeSubscription && usageMetrics) {
      const now = new Date();
      const end = new Date(oneTimeSubscription.currentPeriodEnd);
      if (end > now) {
        carryOver = Math.max(0, usageMetrics.generationsLimit - usageMetrics.generationsUsed);
        carryOver = Math.min(50, carryOver);
        carryOverExpiry = oneTimeSubscription.currentPeriodEnd;
      }
    }

    const newBonus = carryOver;
    const newLimit = baseLimit;

    // Update usage metrics with new tier limits and reset counter
    usageMetrics.generationsUsed = 0;
    usageMetrics.generationsLimit = newLimit;
    usageMetrics.currentJobCount = 0;
    usageMetrics.maxJobCount = TIER_CONFIG[planType]?.jobsPerSession || 10;
    usageMetrics.resetDate = new Date();
      usageMetrics.bonusGenerations = newBonus;
      usageMetrics.bonusExpiresAt = newBonus > 0 ? carryOverExpiry : null;
    await usageMetrics.save();

    await Subscription.create({
      userId: user.id,
      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription,
      tier: planType,
      status: 'active',
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    });
  } else {
    // One-time payment
    const isMonthlyUser = user.tier === 'monthly';

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + TIER_CONFIG[planType].durationDays);

    const [usageMetrics] = await UsageMetrics.findOrCreate({
      where: { userId: user.id },
      defaults: {
        generationsUsed: 0,
        generationsLimit: TIER_CONFIG[planType]?.generationsLimit || 50,
        currentJobCount: 0,
        maxJobCount: TIER_CONFIG[planType]?.jobsPerSession || 5,
        resetDate: new Date(),
        bonusGenerations: 0,
        bonusExpiresAt: null,
      },
    });

    if (isMonthlyUser) {
      const bonusAmount = TIER_CONFIG[planType]?.generationsLimit || 50;
      usageMetrics.bonusGenerations = (usageMetrics.bonusGenerations || 0) + bonusAmount;
      usageMetrics.bonusExpiresAt = expiryDate;
      usageMetrics.generationsLimit = TIER_CONFIG.monthly.generationsLimit || 200;
      usageMetrics.currentJobCount = 0;
      usageMetrics.maxJobCount = TIER_CONFIG.monthly.jobsPerSession || 10;
      await usageMetrics.save();
    } else {
      // Standalone one-time pass
      user.tier = planType;
      await user.save();

      usageMetrics.generationsUsed = 0;
      usageMetrics.generationsLimit = TIER_CONFIG[planType]?.generationsLimit || 50;
      usageMetrics.currentJobCount = 0;
      usageMetrics.maxJobCount = TIER_CONFIG[planType]?.jobsPerSession || 5;
      usageMetrics.resetDate = new Date();
      usageMetrics.bonusGenerations = 0;
      usageMetrics.bonusExpiresAt = null;
      await usageMetrics.save();
    }

    await Subscription.create({
      userId: user.id,
      stripeCustomerId: session.customer,
      tier: planType,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: expiryDate,
    });
  }

  console.log(`✓ Payment completed for user ${userId} (${planType})`);
}

// Helper: Handle subscription event
async function handleSubscriptionEvent(stripeSubscription) {
  const userId = stripeSubscription.metadata?.userId;
  
  let subscription = await Subscription.findOne({
    where: { stripeSubscriptionId: stripeSubscription.id },
  });

  if (!subscription && userId) {
    subscription = await Subscription.findOne({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });
  }

  if (subscription) {
    const { periodStart, periodEnd } = await extractStripePeriodBounds(stripeSubscription);
    subscription.status = mapStripeStatus(stripeSubscription);
    subscription.currentPeriodStart = periodStart ? new Date(periodStart * 1000) : subscription.currentPeriodStart;
    subscription.currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : subscription.currentPeriodEnd;
    await subscription.save();

    console.log(`✓ Subscription updated: ${stripeSubscription.id}`);
  }
}

// Helper: Handle subscription canceled
async function handleSubscriptionCanceled(stripeSubscription) {
  const subscription = await Subscription.findOne({
    where: { stripeSubscriptionId: stripeSubscription.id },
  });

  if (subscription) {
    subscription.status = 'canceled';
    await subscription.save();

    // Reset user to free tier
    const user = await User.findByPk(subscription.userId);
    if (user) {
      user.tier = 'free';
      await user.save();
    }

    console.log(`✓ Subscription canceled: ${stripeSubscription.id}`);
  }
}

// Helper: Handle payment succeeded
async function handlePaymentSucceeded(invoice) {
  const subscription = await Subscription.findOne({
    where: { stripeSubscriptionId: invoice.subscription },
  });

  if (subscription) {
    subscription.status = 'active';
    await subscription.save();
    console.log(`✓ Payment succeeded for subscription: ${invoice.subscription}`);
  }
}

// POST /api/stripe/create-portal-session - Create Stripe billing portal session
const createPortalSessionHandler = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Allow portal for monthly subscriptions that are not expired
    let subscription = await Subscription.findOne({
      where: { userId: user.id, tier: 'monthly', status: { [Op.notIn]: ['expired'] } },
      order: [['createdAt', 'DESC']],
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(400).json({
        error: 'No active monthly subscription to manage',
      });
    }

    let stripeCustomerId = subscription?.stripeCustomerId || null;

    if (!stripeCustomerId) {
      // Try to find an existing customer by email
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        stripeCustomerId = customers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name || undefined,
        });
        stripeCustomerId = customer.id;
      }

      if (subscription) {
        subscription.stripeCustomerId = stripeCustomerId;
        await subscription.save();
      }
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/`,
    });

    res.json({
      url: session.url,
    });
  } catch (error) {
    console.error('❌ Billing portal session creation failed:', error);
    res.status(500).json({ error: error.message || 'Failed to create billing portal session' });
  }
};

router.post('/create-portal-session', authMiddleware, createPortalSessionHandler);
router.post('/stripe/create-portal-session', authMiddleware, createPortalSessionHandler);

// POST /api/stripe/sync-checkout-session - Sync user after successful checkout (dev fallback)
const syncCheckoutSessionHandler = async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const sessionUserId = session.metadata?.userId;
    const planType = session.metadata?.planType;

    if (!sessionUserId || sessionUserId !== req.userId) {
      return res.status(403).json({ error: 'Session does not match user' });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existing = await Subscription.findOne({
      where: { userId: user.id, status: 'active', tier: planType },
      order: [['createdAt', 'DESC']],
    });

    if (existing && existing.currentPeriodEnd && new Date(existing.currentPeriodEnd) > new Date()) {
      return res.json({ status: 'already-active' });
    }

    await handleCheckoutSessionCompleted(session);
    res.json({ status: 'synced' });
  } catch (error) {
    console.error('❌ Sync checkout session failed:', error);
    res.status(500).json({ error: error.message || 'Failed to sync checkout session' });
  }
};

router.post('/sync-checkout-session', authMiddleware, syncCheckoutSessionHandler);
router.post('/stripe/sync-checkout-session', authMiddleware, syncCheckoutSessionHandler);

// POST /api/stripe/cancel-subscription - Cancel at period end
router.post('/stripe/cancel-subscription', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subscription = await Subscription.findOne({
      where: { userId: user.id, tier: 'monthly', status: { [Op.notIn]: ['expired'] } },
      order: [['createdAt', 'DESC']],
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active monthly subscription to cancel' });
    }

    const stripeSub = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    const { periodEnd } = await extractStripePeriodBounds(stripeSub);

    subscription.status = mapStripeStatus(stripeSub);
    subscription.currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : subscription.currentPeriodEnd;
    await subscription.save();

    res.json({
      success: true,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  } catch (error) {
    console.error('❌ Cancel subscription failed:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
  }
});

// POST /api/stripe/reactivate-subscription - Reactivate if cancel at period end
router.post('/stripe/reactivate-subscription', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subscription = await Subscription.findOne({
      where: { userId: user.id, tier: 'monthly', status: { [Op.notIn]: ['expired'] } },
      order: [['createdAt', 'DESC']],
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No monthly subscription to reactivate' });
    }

    const stripeSub = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    const { periodStart, periodEnd } = await extractStripePeriodBounds(stripeSub);

    subscription.status = mapStripeStatus(stripeSub);
    subscription.currentPeriodEnd = periodEnd
      ? new Date(periodEnd * 1000)
      : subscription.currentPeriodEnd;
    subscription.currentPeriodStart = periodStart
      ? new Date(periodStart * 1000)
      : subscription.currentPeriodStart;
    await subscription.save();

    res.json({
      success: true,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  } catch (error) {
    console.error('❌ Reactivate subscription failed:', error);
    res.status(500).json({ error: error.message || 'Failed to reactivate subscription' });
  }
});

// POST /api/stripe/sync-checkout-session-public - Sync without auth (fallback)
router.post('/stripe/sync-checkout-session-public', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Session not paid' });
    }

    await handleCheckoutSessionCompleted(session);
    res.json({ status: 'synced' });
  } catch (error) {
    console.error('❌ Public sync checkout session failed:', error);
    res.status(500).json({ error: error.message || 'Failed to sync checkout session' });
  }
});

module.exports = router;
