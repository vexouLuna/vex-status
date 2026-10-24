// Uptime and average response per service and period, fetched per service and kept: `load` fetches only the ones
// older than the period's NUMBERS_TTL (or that failed), so a poll a minute doesn't fetch them all again, and
// `force` (the Refresh button) fetches them all. Shared by the front page and a service's page.
import { reactive } from 'vue'
import { gatus, type Period } from './gatus'
import { NUMBERS_TTL } from './health'

export interface Numbers {
  uptime: number | null
  responseTime: number | null
  /** When they were fetched (ms); 0 when either failed, so the next load tries again. */
  at: number
}

export function useNumbers() {
  const numbers = reactive(new Map<string, Numbers>())
  const pending = new Set<string>()
  const id = (k: string, p: Period) => `${p} ${k}`

  async function load(keys: string[], periods: readonly Period[], force = false) {
    await Promise.all(
      keys.flatMap((k) =>
        periods.map(async (p) => {
          const i = id(k, p)
          const had = numbers.get(i)
          if (pending.has(i) || (!force && had && Date.now() - had.at < NUMBERS_TTL[p])) return
          pending.add(i)
          try {
            const [uptime, responseTime] = await Promise.all([gatus.uptime(k, p).catch(() => null), gatus.responseTime(k, p).catch(() => null)])
            numbers.set(i, { uptime, responseTime, at: uptime === null || responseTime === null ? 0 : Date.now() })
          } finally {
            pending.delete(i)
          }
        }),
      ),
    )
  }
  return { get: (k: string, p: Period) => numbers.get(id(k, p)), load }
}
