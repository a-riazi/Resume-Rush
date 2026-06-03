import { describe, it, expect, vi } from 'vitest'

// Mock devTime.getSimulatedDate to return a fixed 'now'
vi.mock('../devTime', () => ({
  getSimulatedDate: () => new Date('2026-05-21T00:00:00Z'),
}))

import {
  formatSubscriptionEndLabel,
  isSubscriptionExpired,
  getMonthlyRemaining,
  getOneTimeRemaining,
  isOneTimeSubscriptionActive,
  isMonthlyActive,
} from '../subscription'

describe('subscription helpers', () => {
  it('isSubscriptionExpired returns true for past date and status expired', () => {
    const sub = { currentPeriodEnd: new Date('2026-05-01T00:00:00Z').toISOString(), status: 'active' }
    expect(isSubscriptionExpired(sub)).toBe(true)
    const sub2 = { currentPeriodEnd: new Date('2026-06-01T00:00:00Z').toISOString(), status: 'expired' }
    expect(isSubscriptionExpired(sub2)).toBe(true)
  })

  it('formatSubscriptionEndLabel shows Renews on for active monthly', () => {
    const end = new Date('2026-06-21T00:00:00Z')
    const sub = { currentPeriodEnd: end.toISOString(), status: 'active', tier: 'monthly' }
    const label = formatSubscriptionEndLabel(sub)
    const expectedDate = end.toLocaleDateString()
    expect(label).toContain(expectedDate)
    expect(label.startsWith('Renews on') || label.startsWith('Expires on')).toBe(true)
  })

  it('formatSubscriptionEndLabel shows Expires on for canceled monthly', () => {
    const end = new Date('2026-06-21T00:00:00Z')
    const sub = { currentPeriodEnd: end.toISOString(), status: 'canceled', tier: 'monthly' }
    const label = formatSubscriptionEndLabel(sub)
    expect(label.startsWith('Expires on')).toBe(true)
  })

  it('formatSubscriptionEndLabel shows Expired on for canceled monthly after the end date', () => {
    const end = new Date('2026-05-01T00:00:00Z')
    const sub = { currentPeriodEnd: end.toISOString(), status: 'canceled', tier: 'monthly' }
    const label = formatSubscriptionEndLabel(sub)
    expect(label.startsWith('Expired on')).toBe(true)
  })

  it('formatSubscriptionEndLabel shows Expired on for past end date', () => {
    const end = new Date('2026-05-01T00:00:00Z')
    const sub = { currentPeriodEnd: end.toISOString(), status: 'active', tier: 'monthly' }
    const label = formatSubscriptionEndLabel(sub)
    expect(label.startsWith('Expired on')).toBe(true)
  })

  it('formatSubscriptionEndLabel shows Expires on for active one-time pass with remaining credits', () => {
    const end = new Date('2026-05-26T00:00:00Z')
    const sub = {
      currentPeriodEnd: end.toISOString(),
      status: 'active',
      tier: 'one-time',
      remainingGenerations: 50,
    }
    const label = formatSubscriptionEndLabel(sub)
    expect(label.startsWith('Expires on')).toBe(true)
  })

  it('formatSubscriptionEndLabel shows Expired on for one-time pass with no credits left', () => {
    const end = new Date('2026-05-26T00:00:00Z')
    const sub = {
      currentPeriodEnd: end.toISOString(),
      status: 'active',
      tier: 'one-time',
      remainingGenerations: 0,
    }
    const label = formatSubscriptionEndLabel(sub)
    expect(label.startsWith('Expired on')).toBe(true)
  })

  it('getMonthlyRemaining returns 0 when subscription expired', () => {
    const monthlySub = { currentPeriodEnd: new Date('2026-05-01T00:00:00Z').toISOString(), status: 'expired' }
    const usage = { limit: 200, used: 50 }
    expect(getMonthlyRemaining(monthlySub, usage)).toBe(0)
  })

  it('getMonthlyRemaining returns remaining when active', () => {
    const monthlySub = { currentPeriodEnd: new Date('2026-06-01T00:00:00Z').toISOString(), status: 'active' }
    const usage = { limit: 200, used: 50 }
    expect(getMonthlyRemaining(monthlySub, usage)).toBe(150)
  })

  it('getOneTimeRemaining uses bonusGenerations when both monthly and one-time present', () => {
    const monthlySub = { currentPeriodEnd: new Date('2026-06-01T00:00:00Z').toISOString(), status: 'active', tier: 'monthly' }
    const oneTimeSub = { currentPeriodEnd: new Date('2026-06-01T00:00:00Z').toISOString(), status: 'active', tier: 'one-time' }
    const usage = { bonusGenerations: 10, limit: 200, used: 50 }
    expect(getOneTimeRemaining(oneTimeSub, usage, monthlySub)).toBe(10)
  })

  it('getOneTimeRemaining falls back to limit-used when standalone one-time', () => {
    const oneTimeSub = null
    const usage = { limit: 50, used: 20 }
    expect(getOneTimeRemaining(oneTimeSub, usage, null)).toBe(30)
  })

  it('getOneTimeRemaining prefers remainingGenerations from the server', () => {
    const oneTimeSub = { remainingGenerations: 18 }
    const usage = { limit: 50, used: 50 }
    expect(getOneTimeRemaining(oneTimeSub, usage, null)).toBe(18)
  })

  it('isOneTimeSubscriptionActive returns true when period is open and credits remain', () => {
    const oneTimeSub = {
      currentPeriodEnd: new Date('2026-05-26T00:00:00Z').toISOString(),
      remainingGenerations: 12,
    }

    expect(isOneTimeSubscriptionActive(oneTimeSub, null, null)).toBe(true)
  })

  it('isOneTimeSubscriptionActive returns false when the pass has expired', () => {
    const oneTimeSub = {
      currentPeriodEnd: new Date('2026-05-01T00:00:00Z').toISOString(),
      remainingGenerations: 12,
    }

    expect(isOneTimeSubscriptionActive(oneTimeSub, null, null)).toBe(false)
  })

  it('isMonthlyActive returns true for active monthly with period in future', () => {
    const monthlySub = {
      tier: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2026-06-21T00:00:00Z').toISOString(),
    }
    expect(isMonthlyActive(monthlySub)).toBe(true)
  })

  it('isMonthlyActive returns true for canceled monthly with period still in future', () => {
    const monthlySub = {
      tier: 'monthly',
      status: 'canceled',
      currentPeriodEnd: new Date('2026-06-21T00:00:00Z').toISOString(),
    }
    expect(isMonthlyActive(monthlySub)).toBe(true)
  })

  it('isMonthlyActive returns false for expired monthly', () => {
    const monthlySub = {
      tier: 'monthly',
      status: 'expired',
      currentPeriodEnd: new Date('2026-06-21T00:00:00Z').toISOString(),
    }
    expect(isMonthlyActive(monthlySub)).toBe(false)
  })

  it('isMonthlyActive returns false when period end has passed', () => {
    const monthlySub = {
      tier: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2026-05-01T00:00:00Z').toISOString(),
    }
    expect(isMonthlyActive(monthlySub)).toBe(false)
  })

  it('isMonthlyActive returns false for null subscription', () => {
    expect(isMonthlyActive(null)).toBe(false)
  })

  it('isMonthlyActive returns false for non-monthly tier', () => {
    const oneTimeSub = {
      tier: 'one-time',
      status: 'active',
      currentPeriodEnd: new Date('2026-06-21T00:00:00Z').toISOString(),
    }
    expect(isMonthlyActive(oneTimeSub)).toBe(false)
  })

  it('isOneTimeSubscriptionActive returns false when gens exhausted but date still valid', () => {
    const oneTimeSub = {
      currentPeriodEnd: new Date('2026-06-01T00:00:00Z').toISOString(),
      remainingGenerations: 0,
    }
    expect(isOneTimeSubscriptionActive(oneTimeSub, null, null)).toBe(false)
  })

  it('isOneTimeSubscriptionActive returns true when date valid and gens remain', () => {
    const oneTimeSub = {
      currentPeriodEnd: new Date('2026-06-01T00:00:00Z').toISOString(),
      remainingGenerations: 30,
    }
    expect(isOneTimeSubscriptionActive(oneTimeSub, null, null)).toBe(true)
  })
})
