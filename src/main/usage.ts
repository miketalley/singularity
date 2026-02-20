import { getClient } from './anthropic'
import { log } from './logger'

interface UsageData {
  usedPercent: number | null
  resetAt: string | null
  lastChecked: string | null
}

let cachedUsage: UsageData = {
  usedPercent: null,
  resetAt: null,
  lastChecked: null
}

let pollInterval: ReturnType<typeof setInterval> | null = null

export async function fetchUsageData(): Promise<UsageData> {
  try {
    const client = getClient()

    // Make a lightweight countTokens call to read rate-limit headers
    const { response: raw } = await client.messages
      .countTokens({
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'hi' }]
      })
      .withResponse()

    const limitTokens = raw.headers.get('x-ratelimit-limit-tokens')
    const remainingTokens = raw.headers.get('x-ratelimit-remaining-tokens')
    const resetAt = raw.headers.get('x-ratelimit-reset-tokens')

    if (limitTokens && remainingTokens) {
      const limit = parseInt(limitTokens, 10)
      const remaining = parseInt(remainingTokens, 10)
      const usedPercent = Math.round(((limit - remaining) / limit) * 100)

      cachedUsage = {
        usedPercent,
        resetAt: resetAt || null,
        lastChecked: new Date().toISOString()
      }
    } else {
      // Headers not present — keep last known value, update timestamp
      cachedUsage = {
        ...cachedUsage,
        lastChecked: new Date().toISOString()
      }
    }

    log('usage', 'Fetched usage data', cachedUsage)
  } catch (err) {
    log('usage', 'Failed to fetch usage data', { error: String(err) })
    // Keep last known values, don't overwrite with nulls
  }

  return cachedUsage
}

export function getCachedUsage(): UsageData {
  return cachedUsage
}

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export function startUsagePolling(): void {
  // Fetch immediately on start
  fetchUsageData()

  // Then poll every 5 minutes
  pollInterval = setInterval(() => {
    fetchUsageData()
  }, POLL_INTERVAL_MS)
}

export function stopUsagePolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}
