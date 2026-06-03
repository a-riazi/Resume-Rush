const fs = require('fs');
const path = require('path');
const { TIER_CONFIG, resetMonthlyUsage } = require('./tiers');

const DAY_MS = 24 * 60 * 60 * 1000;
const CLIENT_ENV_PATH = path.join(__dirname, '..', 'client', '.env.local');

let cachedOffsetDays = null;

function parseOffsetDays(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readClientOffsetDays() {
  if (process.env.NODE_ENV === 'production') {
    return 0;
  }

  if (!fs.existsSync(CLIENT_ENV_PATH)) {
    return 0;
  }

  try {
    const contents = fs.readFileSync(CLIENT_ENV_PATH, 'utf8');
    const match = contents.match(/^VITE_TIME_OFFSET_DAYS\s*=\s*(.+)$/m);
    return match ? parseOffsetDays(match[1].trim()) : 0;
  } catch (error) {
    console.error('[time] Failed to read client env offset:', error.message);
    return 0;
  }
}

function getTimeTravelOffsetDays() {
  if (cachedOffsetDays !== null) {
    return cachedOffsetDays;
  }

  cachedOffsetDays = parseOffsetDays(
    process.env.TIME_OFFSET_DAYS ||
    process.env.VITE_TIME_OFFSET_DAYS ||
    readClientOffsetDays()
  );

  return cachedOffsetDays;
}

function getTimeTravelOffsetFromRequest(req) {
  const headerValue = req?.headers?.['x-resumerush-time-offset-days'];
  if (headerValue !== undefined) {
    const parsed = parseOffsetDays(Array.isArray(headerValue) ? headerValue[0] : headerValue);
    return parsed;
  }

  return getTimeTravelOffsetDays();
}

function getAppNow(req = null) {
  return new Date(Date.now() + (getTimeTravelOffsetFromRequest(req) * DAY_MS));
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

async function advanceMonthlySubscriptionIfNeeded(subscription, usageMetrics, now = getAppNow()) {
  if (!subscription || subscription.tier !== 'monthly' || subscription.status !== 'active' || !subscription.currentPeriodEnd) {
    return false;
  }

  const currentPeriodEnd = new Date(subscription.currentPeriodEnd);
  if (Number.isNaN(currentPeriodEnd.getTime()) || currentPeriodEnd > now) {
    return false;
  }

  let advanced = false;
  let nextPeriodEnd = currentPeriodEnd;
  let nextPeriodStart = subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart) : currentPeriodEnd;

  while (nextPeriodEnd <= now) {
    nextPeriodStart = nextPeriodEnd;
    nextPeriodEnd = addMonths(nextPeriodEnd, 1);
    advanced = true;
  }

  if (!advanced) {
    return false;
  }

  subscription.currentPeriodStart = nextPeriodStart;
  subscription.currentPeriodEnd = nextPeriodEnd;
  subscription.status = 'active';

  if (usageMetrics) {
    await resetMonthlyUsage(usageMetrics);
    usageMetrics.generationsLimit = TIER_CONFIG.monthly.generationsLimit;
    usageMetrics.maxJobCount = TIER_CONFIG.monthly.jobsPerSession;
    await usageMetrics.save();
  }

  await subscription.save();
  return true;
}

/**
 * Check if monthly subscription has expired and mark as expired if so.
 * This is the authoritative expiry check: if currentPeriodEnd <= now, subscription is expired.
 * On expiry:
 * - Sets subscription.status = 'expired'
 * - Downgrades usageMetrics to auth-free tier (6 generations, 1 job)
 * - Returns true if expired, false otherwise
 */
async function checkAndExpireMonthlyIfNeeded(subscription, usageMetrics, now = getAppNow()) {
  // Only applies to monthly tier
  if (!subscription || subscription.tier !== 'monthly') {
    return false;
  }

  // If already explicitly expired, no need to check again
  if (subscription.status === 'expired') {
    return false;
  }

  // If no period end, consider it not yet expired
  if (!subscription.currentPeriodEnd) {
    return false;
  }

  const periodEnd = new Date(subscription.currentPeriodEnd);
  
  // If period end is in the future, subscription is still active or canceled-but-not-yet-expired
  if (periodEnd > now) {
    return false;
  }

  // Subscription has expired
  subscription.status = 'expired';
  await subscription.save();

  // Downgrade usage metrics to auth-free tier
  if (usageMetrics) {
    usageMetrics.generationsUsed = usageMetrics.generationsUsed || 0;
    usageMetrics.generationsLimit = TIER_CONFIG['auth-free'].generationsLimit; // 6
    usageMetrics.maxJobCount = TIER_CONFIG['auth-free'].jobsPerSession; // 1
    usageMetrics.bonusGenerations = 0; // Clear any one-time bonus on monthly expiry
    usageMetrics.bonusExpiresAt = null;
    await usageMetrics.save();
  }

  return true;
}

/**
 * Check if one-time pass has expired (by time OR by usage) and mark as expired.
 * Two cases:
 *   1. Add-on to monthly (user.tier === 'monthly'): clear bonus fields, restore monthly limits
 *   2. Standalone (user.tier === 'one-time'): downgrade user to auth-free tier
 * Returns true if expired and acted on, false otherwise.
 */
async function checkAndExpireOneTimeIfNeeded(subscription, usageMetrics, user, now = getAppNow()) {
  if (!subscription || subscription.tier !== 'one-time') {
    return false;
  }

  if (subscription.status === 'expired') {
    return false;
  }

  if (!subscription.currentPeriodEnd) {
    return false;
  }

  const periodEnd = new Date(subscription.currentPeriodEnd);
  const isMonthlyUser = user?.tier === 'monthly';

  const remaining = isMonthlyUser
    ? Math.max(0, Math.min(50, usageMetrics?.bonusGenerations || 0))
    : Math.max(0, (usageMetrics?.generationsLimit || 0) - (usageMetrics?.generationsUsed || 0));

  if (periodEnd > now && remaining > 0) {
    return false;
  }

  subscription.status = 'expired';
  await subscription.save();

  if (isMonthlyUser) {
    if (usageMetrics) {
      usageMetrics.bonusGenerations = 0;
      usageMetrics.bonusExpiresAt = null;
      usageMetrics.generationsLimit = TIER_CONFIG.monthly.generationsLimit;
      usageMetrics.maxJobCount = TIER_CONFIG.monthly.jobsPerSession;
      await usageMetrics.save();
    }
    console.log(`[Subscription] User ${user?.id} one-time add-on expired. Bonus cleared.`);
  } else {
    if (user) {
      user.tier = 'auth-free';
      await user.save();
    }
    if (usageMetrics) {
      usageMetrics.generationsUsed = 0;
      usageMetrics.generationsLimit = TIER_CONFIG['auth-free'].generationsLimit;
      usageMetrics.currentJobCount = 0;
      usageMetrics.maxJobCount = TIER_CONFIG['auth-free'].jobsPerSession;
      usageMetrics.resetDate = now;
      usageMetrics.bonusGenerations = 0;
      usageMetrics.bonusExpiresAt = null;
      await usageMetrics.save();
    }
    console.log(`[Subscription] User ${user?.id} one-time pass expired. Downgraded to auth-free.`);
  }

  return true;
}

module.exports = {
  getAppNow,
  getTimeTravelOffsetDays,
  getTimeTravelOffsetFromRequest,
  advanceMonthlySubscriptionIfNeeded,
  checkAndExpireMonthlyIfNeeded,
  checkAndExpireOneTimeIfNeeded,
};