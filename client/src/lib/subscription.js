import { getSimulatedDate } from './devTime'

export function getAppNow() {
  return getSimulatedDate()
}

export function formatSubscriptionEndLabel(subscription) {
  if (!subscription?.currentPeriodEnd) {
    return 'Unavailable'
  }

  const endDate = new Date(subscription.currentPeriodEnd)
  if (Number.isNaN(endDate.getTime())) {
    return 'Unavailable'
  }

  const now = getAppNow()
  const oneTimeRemaining = Number.isFinite(subscription?.remainingGenerations)
    ? subscription.remainingGenerations
    : null
  const expired = subscription.tier === 'one-time'
    ? (endDate < now || oneTimeRemaining === 0)
    : (endDate < now || subscription.status === 'expired')
  const endingSoon = subscription.status === 'canceled' || subscription.tier === 'one-time'

  const formattedDate = endDate.toLocaleDateString()
  if (expired) {
    return `Expired on ${formattedDate}`
  }

  return endingSoon ? `Expires on ${formattedDate}` : `Renews on ${formattedDate}`
}

export function isSubscriptionExpired(subscription) {
  if (!subscription?.currentPeriodEnd) {
    return false
  }

  const endDate = new Date(subscription.currentPeriodEnd)
  if (Number.isNaN(endDate.getTime())) {
    return false
  }

  const oneTimeRemaining = Number.isFinite(subscription?.remainingGenerations)
    ? subscription.remainingGenerations
    : null
  if (subscription.tier === 'one-time') {
    return endDate < getAppNow() || oneTimeRemaining === 0
  }

  return endDate < getAppNow() || subscription.status === 'expired'
}

export function getMonthlyRemaining(monthlySubscription, usage) {
  if (!monthlySubscription) return 0
  const limit = Number.isFinite(usage?.limit) ? usage.limit : 0
  const used = Number.isFinite(usage?.used) ? usage.used : 0
  const remaining = Math.max(0, limit - used)
  return isSubscriptionExpired(monthlySubscription) ? 0 : remaining
}

export function getOneTimeRemaining(oneTimeSubscription, usage, monthlySubscription = null) {
  if (Number.isFinite(oneTimeSubscription?.remainingGenerations)) {
    return Math.max(0, oneTimeSubscription.remainingGenerations)
  }

  const hasMonthlyAndOneTime = Boolean(monthlySubscription && oneTimeSubscription)
  const rawRemaining = hasMonthlyAndOneTime
    ? (Number.isFinite(usage?.bonusGenerations) ? usage.bonusGenerations : 0)
    : Math.max(0, (Number.isFinite(usage?.limit) ? usage.limit : 0) - (Number.isFinite(usage?.used) ? usage.used : 0))

  return isSubscriptionExpired(oneTimeSubscription) ? 0 : rawRemaining
}

export function isOneTimeSubscriptionActive(oneTimeSubscription, usage, monthlySubscription = null) {
  if (!oneTimeSubscription) {
    return false
  }

  const endDate = oneTimeSubscription.currentPeriodEnd ? new Date(oneTimeSubscription.currentPeriodEnd) : null
  const hasValidEndDate = Boolean(endDate && !Number.isNaN(endDate.getTime()) && endDate > getAppNow())
  const remaining = getOneTimeRemaining(oneTimeSubscription, usage, monthlySubscription)

  return hasValidEndDate && remaining > 0
}

export function isMonthlyActive(monthlySubscription) {
  if (!monthlySubscription || monthlySubscription.tier !== 'monthly') {
    return false
  }

  // Status is 'expired' -> not active
  if (monthlySubscription.status === 'expired') {
    return false
  }

  // Status is 'canceled' -> still active until period end
  // Status is 'active' -> active until period end
  const endDate = monthlySubscription.currentPeriodEnd ? new Date(monthlySubscription.currentPeriodEnd) : null
  if (!endDate || Number.isNaN(endDate.getTime())) {
    return false
  }

  return endDate > getAppNow()
}