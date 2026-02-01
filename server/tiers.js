// Tier limits and pricing
const TIER_CONFIG = {
  free: {
    generationsLimit: 3,
    jobsPerSession: 1,
    resetPeriod: 'daily', // Resets every 24 hours
    monthlyGenerations: null,
    price: 0,
    requiresAuth: false,
  },
  'auth-free': {
    generationsLimit: 6,
    jobsPerSession: 2,
    resetPeriod: 'monthly', // Resets every month
    monthlyGenerations: 6,
    price: 0,
    requiresAuth: true,
  },
  monthly: {
    generationsLimit: 200,
    jobsPerSession: 10,
    resetPeriod: 'monthly',
    monthlyGenerations: 200,
    price: 799, // $7.99 in cents
    requiresAuth: true,
  },
  'one-time': {
    generationsLimit: 50,
    jobsPerSession: 5,
    resetPeriod: null,
    monthlyGenerations: null,
    durationDays: 5,
    price: 500, // $5.00 in cents
    requiresAuth: true,
  },
};

// Get remaining generations for user
async function getRemainingGenerations(user, usageMetrics) {
  if (!user || !usageMetrics) {
    return TIER_CONFIG.free.generationsLimit;
  }

  const tier = user.tier;
  const config = TIER_CONFIG[tier];

  if (!config) {
    return TIER_CONFIG.free.generationsLimit;
  }

  return Math.max(0, config.generationsLimit - usageMetrics.generationsUsed);
}

// Get remaining job slots for user
async function getRemainingJobSlots(user, usageMetrics) {
  if (!user || !usageMetrics) {
    return TIER_CONFIG.free.jobsPerSession;
  }

  const tier = user.tier;
  const config = TIER_CONFIG[tier];

  if (!config) {
    return TIER_CONFIG.free.jobsPerSession;
  }

  return Math.max(0, config.jobsPerSession - usageMetrics.currentJobCount);
}

// Check if user can perform action
async function canPerformAction(user, usageMetrics, actionType = 'generation') {
  if (!user) {
    // Anonymous user - allow free tier limits
    if (actionType === 'generation') {
      return { allowed: true, remaining: TIER_CONFIG.free.generationsLimit };
    }
    return { allowed: true, remaining: TIER_CONFIG.free.jobsPerSession };
  }

  if (actionType === 'generation') {
    const remaining = await getRemainingGenerations(user, usageMetrics);
    return {
      allowed: remaining > 0,
      remaining,
      tier: user.tier,
      limit: TIER_CONFIG[user.tier]?.generationsLimit,
    };
  }

  if (actionType === 'job') {
    const remaining = await getRemainingJobSlots(user, usageMetrics);
    return {
      allowed: remaining > 0,
      remaining,
      tier: user.tier,
      limit: TIER_CONFIG[user.tier]?.jobsPerSession,
    };
  }

  return { allowed: true, remaining: 0 };
}

// Increment usage
async function incrementUsage(user, usageMetrics, actionType = 'generation', amount = 1) {
  if (!user || !usageMetrics) {
    return null;
  }

  if (actionType === 'generation') {
    usageMetrics.generationsUsed += amount;
  } else if (actionType === 'job') {
    usageMetrics.currentJobCount += amount;
  }

  await usageMetrics.save();
  return usageMetrics;
}

// Reset monthly usage (call this on subscription renewal or monthly interval)
async function resetMonthlyUsage(usageMetrics) {
  usageMetrics.generationsUsed = 0;
  usageMetrics.currentJobCount = 0;
  usageMetrics.resetDate = new Date();
  await usageMetrics.save();
  return usageMetrics;
}

module.exports = {
  TIER_CONFIG,
  getRemainingGenerations,
  getRemainingJobSlots,
  canPerformAction,
  incrementUsage,
  resetMonthlyUsage,
};
