// What the checks mean: a service's health, the whole network's, and the words and numbers the pages show.
// Pure functions of Gatus's answers, so they are tested without a browser.
import { SITES, type Health, type Tone, type UptimeTick } from '@vex/ui'
import type { Announcement, CheckResult, EndpointEvent, EndpointStatus, Period } from './gatus'

export const ms = (r: CheckResult) => r.duration / 1e6

/** A service is down when its latest check failed, unstable when an earlier one in view did, up otherwise. */
export function healthOf(results: CheckResult[]): Health {
  const last = results.at(-1)
  if (!last) return 'off'
  if (!last.success) return 'down'
  return results.some((r) => !r.success) ? 'warn' : 'ok'
}

export const HEALTH_WORD: Record<Health, string> = { ok: 'Up', warn: 'Unstable', down: 'Down', off: 'No data' }

export interface Overall {
  health: Health
  title: string
}

/** The banner: one line for everything. */
export function overallOf(endpoints: EndpointStatus[]): Overall {
  const h = endpoints.map((e) => healthOf(e.results)).filter((x) => x !== 'off')
  const down = h.filter((x) => x === 'down').length
  if (!h.length) return { health: 'off', title: 'No checks yet' }
  if (down === h.length) return { health: 'down', title: 'Everything is down' }
  if (down) return { health: 'down', title: `${down} of ${h.length} ${h.length === 1 ? 'service' : 'services'} down` }
  if (h.includes('warn')) return { health: 'warn', title: 'Up, with recent failures' }
  return { health: 'ok', title: 'All services up' }
}

export interface Group {
  name: string
  endpoints: EndpointStatus[]
}

/** Groups in this order; any other group after them, alphabetically, and ungrouped ones last. */
export const GROUP_ORDER = ['websites', 'API', 'infrastructure']

const groupRank = (g: string) => {
  const i = GROUP_ORDER.indexOf(g)
  return i >= 0 ? i : g ? GROUP_ORDER.length : GROUP_ORDER.length + 1
}
/** Where a service's host sits in the network's list of sites; hosts that aren't a site go after all of them. */
const siteRank = (e: EndpointStatus) => {
  const host = e.results[0]?.hostname
  const i = SITES.findIndex((s) => s.host === host)
  return i >= 0 ? i : SITES.length
}

/**
 * Endpoints by group. Gatus lists them by key, not in its config's order, so the order is set here: groups as
 * GROUP_ORDER says, and within a group by the checked host's place in SITES (by hostname, since names are display
 * text), then by name.
 */
export function groupsOf(endpoints: EndpointStatus[]): Group[] {
  const map = new Map<string, EndpointStatus[]>()
  for (const e of endpoints) {
    const g = e.group ?? ''
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(e)
  }
  const byName = (a: string, b: string) => a.localeCompare(b)
  return [...map]
    .sort(([a], [b]) => groupRank(a) - groupRank(b) || byName(a, b))
    .map(([name, list]) => ({ name, endpoints: list.sort((a, b) => siteRank(a) - siteRank(b) || byName(a.name, b.name)) }))
}

export const clock = (at: string | number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** 1 → "100%", 0.99931 → "99.93%", never rounding a miss up to 100. */
export function percent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—'
  if (ratio >= 1) return '100%'
  const floored = Math.floor(ratio * 10000) / 100
  return `${floored.toFixed(2).replace(/\.?0+$/, '')}%`
}

export const millis = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${Math.round(n)} ms`)

/** Why a check failed, in one line: the failed conditions, else the error, else the status code. */
export function failureOf(r: CheckResult): string {
  const failed = (r.conditionResults ?? []).filter((c) => !c.success).map((c) => c.condition)
  if (failed.length) return failed.join(', ')
  if (r.errors?.length) return r.errors[0]!
  return r.status ? `HTTP ${r.status}` : 'no answer'
}

/** One tick per check, labelled with its time and either its response or why it failed. */
export const ticksOf = (results: CheckResult[]): UptimeTick[] =>
  results.map((r) => ({
    status: r.success ? 'ok' : 'down',
    label: r.success
      ? `${clock(r.timestamp)} · ${r.status ? `${r.status} · ` : ''}${Math.round(ms(r))} ms`
      : `${clock(r.timestamp)} · ${failureOf(r)}`,
  }))

export const averageMs = (results: CheckResult[]) => (results.length ? results.reduce((s, r) => s + ms(r), 0) / results.length : null)

/** "3 min", "2 h 5 min", "1 d 4 h". */
export function span(msSpan: number): string {
  const m = Math.max(1, Math.round(msSpan / 60000))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`
}

export interface Incident {
  start: string
  /** null while still down. */
  end: string | null
  /** How long it lasted (so far). */
  length: string
}

/** Outages from Gatus's events: each UNHEALTHY up to the HEALTHY after it. Newest first. */
export function incidentsOf(events: EndpointEvent[] = [], now = Date.now()): Incident[] {
  const out: Incident[] = []
  let open: string | null = null
  for (const e of events) {
    if (e.type === 'UNHEALTHY' && !open) open = e.timestamp
    else if (e.type === 'HEALTHY' && open) {
      out.push({ start: open, end: e.timestamp, length: span(Date.parse(e.timestamp) - Date.parse(open)) })
      open = null
    }
  }
  if (open) out.push({ start: open, end: null, length: span(now - Date.parse(open)) })
  return out.reverse()
}

/** Gatus's announcement types as callout tones. */
export const announcementTone = (a: Announcement): Tone =>
  a.type === 'outage' ? 'error' : a.type === 'warning' ? 'warn' : a.type === 'operational' ? 'ok' : 'info'

/** The history bar for each period: how many slots, and how long each one is. */
export const HISTORY: Record<Period, { slots: number; size: number }> = {
  '1h': { slots: 60, size: 60_000 },
  '24h': { slots: 48, size: 30 * 60_000 },
  '7d': { slots: 42, size: 4 * 3_600_000 },
  '30d': { slots: 30, size: 86_400_000 },
}

/** How long a service's uptime and average response over a period stay fresh: a minute's checks barely move a long
 * period's numbers, so the longer the period, the less often they're fetched again. */
export const NUMBERS_TTL: Record<Period, number> = {
  '1h': 5 * 60_000,
  '24h': 15 * 60_000,
  '7d': 3_600_000,
  '30d': 6 * 3_600_000,
}

const dayShort = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })
/** A slot's time as a label: "14:05", "14:00–14:30", "Sep 27, 08:00–12:00", "Sep 27". */
function slotLabel(start: number, size: number): string {
  if (size <= 60_000) return clock(start)
  if (size >= 86_400_000) return dayShort(start)
  const range = `${clock(start)}–${clock(start + size)}`
  return size > 3_600_000 ? `${dayShort(start)}, ${range}` : range
}
/** Where the history bar for a period starts, for the axis under it. */
export const historyStart = (period: Period, now: number) => {
  const first = slotStarts(period, now)[0]!
  return HISTORY[period].size >= 3_600_000 ? dayShort(first) : clock(first)
}

/** Slot starts, lined up on local midnight so they read as round times, the last one holding `now`. */
function slotStarts(period: Period, now: number): number[] {
  const { slots, size } = HISTORY[period]
  const midnight = new Date(now).setHours(0, 0, 0, 0)
  const last = midnight + Math.floor((now - midnight) / size) * size
  return Array.from({ length: slots }, (_, i) => last - (slots - 1 - i) * size)
}

/**
 * Outage stretches from Gatus's events (oldest first), and when checking began. Gatus only records a change of
 * state, so between events the state holds. When the oldest events have been dropped, the state before the first
 * one left is the opposite of it.
 */
export function outagesOf(events: EndpointEvent[] = [], now = Date.now()): { since: number; down: [number, number][] } {
  const start = events.find((e) => e.type === 'START')
  const since = start ? Date.parse(start.timestamp) : -Infinity
  const changes = events.filter((e) => e.type !== 'START')
  const down: [number, number][] = []
  let from: number | null = !start && changes[0]?.type === 'HEALTHY' ? -Infinity : null
  for (const e of changes) {
    const t = Date.parse(e.timestamp)
    if (e.type === 'UNHEALTHY' && from === null) from = t
    else if (e.type === 'HEALTHY' && from !== null) {
      down.push([from, t])
      from = null
    }
  }
  if (from !== null) down.push([from, now])
  return { since, down }
}

/**
 * A service's history over a period as bar ticks, oldest first. A slot is down when an outage (Gatus's
 * UNHEALTHY to HEALTHY) overlaps it, unstable when a check in it failed without making an outage, no data when
 * it's from before checking began, and up otherwise. Checks are only known for the latest hundred minutes or so;
 * outages for as far back as Gatus keeps its events.
 */
export function historyOf(results: CheckResult[], events: EndpointEvent[] | undefined, period: Period, now = Date.now()): UptimeTick[] {
  const { size } = HISTORY[period]
  // Without events (they failed to load), checking began no later than the oldest check shown.
  const { since, down } = events
    ? outagesOf(events, now)
    : { since: results[0] ? Date.parse(results[0].timestamp) : now, down: [] as [number, number][] }
  return slotStarts(period, now).map((start) => {
    const end = Math.min(start + size, now)
    const when = slotLabel(start, size)
    if (end <= since) return { status: 'off', label: `${when} · not checked yet` }
    const from = Math.max(start, since)
    const downMs = down.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, end) - Math.max(a, from)), 0)
    const inSlot = results.filter((r) => {
      const t = Date.parse(r.timestamp)
      return t >= start && t < start + size
    })
    const failed = inSlot.filter((r) => !r.success).length
    if (downMs > 0) return { status: 'down', label: `${when} · down ${span(downMs)}` }
    if (failed) return { status: 'warn', label: `${when} · ${failed} failed ${failed === 1 ? 'check' : 'checks'}` }
    if (inSlot.length === 1 && size <= 60_000) return { status: 'ok', label: ticksOf(inSlot)[0]!.label }
    return { status: 'ok', label: `${when} · up` }
  })
}
