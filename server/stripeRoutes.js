const express = require('express');
const Stripe = require('stripe');
const { User, Subscription } = require('./database');
const { authMiddleware } = require('./auth');
const { TIER_CONFIG } = require('./tiers');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

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
      clientSecret: session.client_secret,
    });
  } catch (error) {
    console.error('❌ Checkout session creation failed:', error.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
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
    
    // Update user tier and subscription
    user.tier = planType;
    await user.save();

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
    user.tier = planType;
    await user.save();

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + TIER_CONFIG[planType].durationDays);

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
    subscription.status = stripeSubscription.status;
    subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
    subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
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

module.exports = router;
