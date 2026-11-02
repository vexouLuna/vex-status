// What the checks mean: a service's health, the whole network's, and the words and numbers the pages show.
// Pure functions of Gatus's answers, so they are tested without a browser.
import { SITES, type Health, type Tone, type UptimeTick } from '@vex/ui'
import { PERIODS, type Announcement, type CheckResult, type EndpointEvent, type EndpointStatus, type Period } from './gatus'

export const ms = (r: CheckResult) => r.duration / 1e6

/** The states a service's checks can put it in (Health also has `caution`, which only outages' share sets). */
export type CheckHealth = Extract<Health, 'ok' | 'warn' | 'down' | 'off'>

/** A service is down when its latest check failed, unstable when an earlier one in view did, up otherwise. */
export function healthOf(results: CheckResult[]): CheckHealth {
  const last = results.at(-1)
  if (!last) return 'off'
  if (!last.success) return 'down'
  return results.some((r) => !r.success) ? 'warn' : 'ok'
}

export const HEALTH_WORD: Record<CheckHealth, string> = { ok: 'Up', warn: 'Unstable', down: 'Down', off: 'No data' }

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

/** Groups in this order (VITE_STATUS_GROUPS, for another Gatus's groups); any other group after them,
 * alphabetically, and ungrouped ones last. */
const groupsEnv = (import.meta.env.VITE_STATUS_GROUPS ?? '').split(',').map((g) => g.trim()).filter(Boolean)
export const GROUP_ORDER = groupsEnv.length ? groupsEnv : ['Websites', 'API', 'Infrastructure']

const groupRank = (g: string) => {
  const i = GROUP_ORDER.findIndex((o) => o.toLowerCase() === g.toLowerCase())
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
 * GROUP_ORDER says (case-insensitive, so it holds across a Gatus rename), and within a group by the checked host's place in SITES (by hostname, since names are display
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

export const clock = (at: string | number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export const dateTime = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
/** A check's own time, to the second and with its zone: the one place seconds help. */
export const dateTimeFull = (iso: string) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' })
/** The viewer's time zone as a short name ("GMT+1", "PST"), said once above or below the times it applies to. */
export const zone = () => new Intl.DateTimeFormat([], { timeZoneName: 'short' }).formatToParts(0).find((p) => p.type === 'timeZoneName')?.value ?? ''

/** "just now", "5 min ago", "3 h ago", "2 d ago": the absolute time goes in a `title`. */
export function relative(at: string | number, now = Date.now()): string {
  const m = Math.floor((now - new Date(at).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  return m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`
}

/** 1 → "100%", 0.99931 → "99.93%", never rounding a miss up to 100. */
export function percent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—'
  if (ratio >= 1) return '100%'
  const floored = Math.floor(ratio * 10000) / 100
  return `${floored.toFixed(2).replace(/\.?0+$/, '')}%`
}

/** A period's uptime as a status: ok from 99.9%, then the grid's shares: over two thirds down caution, all of it down. */
export function uptimeHealth(ratio: number | null | undefined): Health {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return 'off'
  const down = 1 - ratio
  return down < 0.001 ? 'ok' : down >= 1 ? 'down' : down > 2 / 3 ? 'caution' : 'warn'
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

/** An outage shorter than this is one failed check (checks run once a minute), not an outage. */
export const BLIP_MS = 2 * 60_000

/** Outages from Gatus's events: each UNHEALTHY up to the HEALTHY after it, without single failed checks. Newest first. */
export function incidentsOf(events: EndpointEvent[] = [], now = Date.now()): Incident[] {
  const out: Incident[] = []
  let open: string | null = null
  for (const e of events) {
    if (e.type === 'UNHEALTHY' && !open) open = e.timestamp
    else if (e.type === 'HEALTHY' && open) {
      const took = Date.parse(e.timestamp) - Date.parse(open)
      if (took >= BLIP_MS) out.push({ start: open, end: e.timestamp, length: span(took) })
      open = null
    }
  }
  if (open) out.push({ start: open, end: null, length: span(now - Date.parse(open)) })
  return out.reverse()
}

/** Gatus's announcement types as callout tones. */
export const announcementTone = (a: Announcement): Tone =>
  a.type === 'outage' ? 'error' : a.type === 'warning' ? 'warn' : a.type === 'operational' ? 'ok' : 'info'

/** How long a service's uptime and average response over a period stay fresh: a minute's checks barely move a long
 * period's numbers, so the longer the period, the less often they're fetched again. */
export const NUMBERS_TTL: Record<Period, number> = {
  '1h': 5 * 60_000,
  '24h': 15 * 60_000,
  '7d': 3_600_000,
  '30d': 6 * 3_600_000,
}

/** The front page's ranges: Gatus's uptime periods, and a year, which Gatus has no uptime for (see yearUptimeOf). */
export const RANGES = [...PERIODS, '1y'] as const
export type Range = (typeof RANGES)[number]

/** A length of calendar time in local time: n minutes, n hours, a day or a week (from Sunday). */
interface Step {
  unit: 'min' | 'hour' | 'day' | 'week'
  n: number
}
const MIN = (n: number): Step => ({ unit: 'min', n })
const HOUR = (n: number): Step => ({ unit: 'hour', n })
const DAY: Step = { unit: 'day', n: 1 }
const WEEK: Step = { unit: 'week', n: 1 }

/** The start of the step holding `t`: 14:37 floors to 14:35 in 5-minute steps, any day to its Sunday in weeks. */
function floorTo(t: number, { unit, n }: Step): number {
  const d = new Date(t)
  if (unit === 'min') d.setMinutes(Math.floor(d.getMinutes() / n) * n, 0, 0)
  else if (unit === 'hour') d.setHours(Math.floor(d.getHours() / n) * n, 0, 0, 0)
  else {
    d.setHours(0, 0, 0, 0)
    if (unit === 'week') d.setDate(d.getDate() - d.getDay())
  }
  return d.getTime()
}
/** `t` moved by k steps, on the calendar (a day is a date, not 24 h, across a clock change). */
function add(t: number, { unit, n }: Step, k: number): number {
  const d = new Date(t)
  if (unit === 'min') d.setMinutes(d.getMinutes() + n * k)
  else if (unit === 'hour') d.setHours(d.getHours() + n * k)
  else d.setDate(d.getDate() + (unit === 'week' ? 7 : 1) * n * k)
  return d.getTime()
}

/**
 * Each range's grid: `cells` cells of `cell` time ending with the one that holds now, stacked `rows` to a column of
 * `column` time. Columns sit on the calendar like GitHub's weeks from Sunday, so the first and last are partial.
 */
export const GRID: Record<Range, { cells: number; cell: Step; column: Step; rows: number }> = {
  '1h': { cells: 60, cell: MIN(1), column: MIN(5), rows: 5 },
  '24h': { cells: 96, cell: MIN(15), column: HOUR(1), rows: 4 },
  '7d': { cells: 168, cell: HOUR(1), column: HOUR(6), rows: 6 },
  '30d': { cells: 120, cell: HOUR(6), column: DAY, rows: 4 },
  '1y': { cells: 365, cell: DAY, column: WEEK, rows: 7 },
}

/** Where a cell's share of downtime changes its colour: under OK_SHARE it stays green, up to PARTIAL_SHARE it's
 * `partial`, up to two thirds `warn`, above that `caution`, all of it `down`. */
export const OK_SHARE = 0.05
export const PARTIAL_SHARE = 1 / 3

/**
 * A cell's state: Health, plus how much of it was down: `partial` from 5% to a third, `warn` to two thirds,
 * `caution` above that, `down` all of it. `none` is a place in a partial column outside the range (before it, or still to come).
 */
export type CellStatus = Health | 'partial' | 'caution' | 'none'
export interface GridCell {
  status: CellStatus
  label?: string
}

const dayShort = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })
const dayLong = (t: number) => new Date(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
/** A cell's time as a label: "14:05", "14:00–14:15", "Sep 27, 08:00–09:00", "Sun, Sep 27, 2026". */
function cellLabel(start: number, end: number, { unit, n }: Step): string {
  if (unit === 'min' && n === 1) return clock(start)
  if (unit === 'day' || unit === 'week') return dayLong(start)
  const range = `${clock(start)}–${clock(end)}`
  return unit === 'hour' ? `${dayShort(start)}, ${range}` : range
}

/** Where the grid for a range starts, for the axis under it. */
export function gridStart(range: Range, now: number): string {
  const { cells, cell } = GRID[range]
  const first = add(floorTo(now, cell), cell, 1 - cells)
  if (cell.unit === 'min') return clock(first)
  return range === '1y' ? new Date(first).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : dayShort(first)
}

/**
 * Outage stretches from Gatus's events (oldest first), and when checking began. Gatus only records a change of
 * state, so between events the state holds. When the oldest events have been dropped, the state before the first
 * one left is the opposite of it.
 */
export function outagesOf(events: EndpointEvent[] = [], now = Date.now()): { since: number; down: [number, number][]; blips: [number, number][] } {
  const start = events.find((e) => e.type === 'START')
  const since = start ? Date.parse(start.timestamp) : -Infinity
  const changes = events.filter((e) => e.type !== 'START')
  const down: [number, number][] = []
  // Stretches shorter than BLIP_MS: a single failed check, not an outage.
  const blips: [number, number][] = []
  let from: number | null = !start && changes[0]?.type === 'HEALTHY' ? -Infinity : null
  for (const e of changes) {
    const t = Date.parse(e.timestamp)
    if (e.type === 'UNHEALTHY' && from === null) from = t
    else if (e.type === 'HEALTHY' && from !== null) {
      ;(t - from < BLIP_MS ? blips : down).push([from, t])
      from = null
    }
  }
  if (from !== null) down.push([from, now])
  return { since, down, blips }
}

/** A moment when most services failed a check within the same minute: the checker lost contact, not the services. */
export interface LostContact {
  at: number
  length: string
}
const LOST_WINDOW = 60_000

/** Single failed checks that most services share within a minute, newest first. Needs 3+ services with events. */
export function lostContactOf(endpoints: EndpointStatus[], now = Date.now()): LostContact[] {
  const per = endpoints.filter((e) => e.events).map((e) => outagesOf(e.events, now).blips)
  if (per.length < 3) return []
  const all = per.flatMap((blips, i) => blips.map(([a, b]) => ({ a, b, i }))).sort((x, y) => x.a - y.a)
  const out: LostContact[] = []
  for (let k = 0; k < all.length; ) {
    const group = all.filter((x) => x.a >= all[k]!.a && x.a < all[k]!.a + LOST_WINDOW)
    if (new Set(group.map((x) => x.i)).size > per.length / 2) out.push({ at: all[k]!.a, length: span(Math.max(...group.map((x) => x.b - x.a))) })
    k += group.length
  }
  return out.reverse()
}
const isLost = (t: number, lost: LostContact[]) => lost.some((l) => t >= l.at && t < l.at + LOST_WINDOW)

/**
 * What's known of a service's outages: from when (checking began, or the oldest event Gatus still keeps), and the
 * outage stretches. Before `known` there's no record: when Gatus has dropped the oldest events, how long the
 * state before them lasted is lost, so it isn't drawn as an outage running back forever. Without events (they
 * failed to load), only the checks shown are known.
 */
function recordOf(results: CheckResult[], events: EndpointEvent[] | undefined, now: number) {
  if (!events) return { known: results[0] ? Date.parse(results[0].timestamp) : now, started: true, down: [] as [number, number][] }
  const { since, down } = outagesOf(events, now)
  const started = since > -Infinity
  return { known: started ? since : events[0] ? Date.parse(events[0].timestamp) : now, started, down }
}
const downIn = (down: [number, number][], from: number, end: number) =>
  down.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, end) - Math.max(a, from)), 0)

/**
 * A service's history over a range as grid columns, oldest first, each `rows` cells from the top. A cell is down,
 * caution or partial by how much of it an outage (Gatus's UNHEALTHY to HEALTHY) took, unstable when a check in it
 * failed without making an outage, no data before the record begins, and up otherwise. Checks are only known
 * for the latest hundred minutes or so; outages for as far back as Gatus keeps its events.
 */
export function gridOf(
  results: CheckResult[],
  events: EndpointEvent[] | undefined,
  range: Range,
  now = Date.now(),
  lost: LostContact[] = [],
): GridCell[][] {
  const { cells, cell, column, rows } = GRID[range]
  const last = floorTo(now, cell)
  const first = add(last, cell, 1 - cells)
  const { known, started, down } = recordOf(results, events, now)
  const blips = events ? outagesOf(events, now).blips.map(([a]) => a).filter((a) => !isLost(a, lost)) : []
  const columns: GridCell[][] = []
  for (let col = floorTo(first, column); col <= last; col = add(col, column, 1)) {
    const next = add(col, column, 1)
    // shortcut: a column the clock change makes one cell longer drops that cell; fine twice a year.
    columns.push(
      Array.from({ length: rows }, (_, row): GridCell => {
        const start = add(col, cell, row)
        if (start < first || start > last || start >= next) return { status: 'none' }
        const stop = add(start, cell, 1)
        const end = Math.min(stop, now)
        const when = cellLabel(start, stop, cell)
        if (end <= known) return { status: 'off', label: `${when} · ${started ? 'not checked yet' : 'no record'}` }
        const from = Math.max(start, known)
        const outageMs = downIn(down, from, end)
        const inCell = results.filter((r) => {
          const t = Date.parse(r.timestamp)
          return t >= start && t < stop
        })
        // A failed check counts as the minute it stands for; checks and events see the same ones, so the larger count wins.
        const failed = Math.max(
          inCell.filter((r) => !r.success && !isLost(Date.parse(r.timestamp), lost)).length,
          blips.filter((a) => a >= start && a < stop).length,
        )
        if (!outageMs && !failed) {
          if (inCell.length === 1 && cell.unit === 'min' && cell.n === 1) return { status: 'ok', label: ticksOf(inCell)[0]!.label }
          return { status: 'ok', label: `${when} · up` }
        }
        const ratio = Math.min(1, (outageMs + failed * 60_000) / (end - from))
        let status: CellStatus = ratio < OK_SHARE ? 'ok' : ratio <= PARTIAL_SHARE ? 'partial' : ratio <= 2 / 3 ? 'warn' : ratio < 1 ? 'caution' : 'down'
        // Failed checks alone are no outage: at most yellow.
        if (!outageMs && (status === 'caution' || status === 'down')) status = 'warn'
        const parts = [
          outageMs && `down ${span(outageMs)}${status === 'down' ? '' : ` (${Math.max(1, Math.round((outageMs / (end - from)) * 100))}%)`}`,
          failed && `${failed} failed ${failed === 1 ? 'check' : 'checks'}`,
        ].filter(Boolean)
        return { status, label: `${when} · ${parts.join(', ')}` }
      }),
    )
  }
  return columns
}

/** Uptime over the year's grid, from outages alone: Gatus keeps no uptime past 30 days. null with no record. */
export function yearUptimeOf(events: EndpointEvent[] | undefined, now = Date.now()): number | null {
  if (!events?.length) return null
  const { cells, cell } = GRID['1y']
  const { known, down } = recordOf([], events, now)
  const from = Math.max(add(floorTo(now, cell), cell, 1 - cells), known)
  return now > from ? 1 - downIn(down, from, now) / (now - from) : null
}
