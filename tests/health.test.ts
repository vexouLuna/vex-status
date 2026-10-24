import { describe, expect, it } from 'vitest'
import type { CheckResult, EndpointStatus } from '../src/lib/gatus'
import { announcementTone, failureOf, groupsOf, healthOf, gridOf, gridStart, incidentsOf, outagesOf, overallOf, percent, span, ticksOf, yearUptimeOf } from '../src/lib/health'

const ok = (t = '2026-09-28T12:00:00Z'): CheckResult => ({ status: 200, duration: 21e6, success: true, timestamp: t })
const bad = (extra: Partial<CheckResult> = {}): CheckResult => ({ status: 502, duration: 5e6, success: false, timestamp: '2026-09-28T12:01:00Z', ...extra })
const ep = (key: string, results: CheckResult[], group?: string): EndpointStatus => ({ key, name: key, group, results })

describe('healthOf', () => {
  it('is off with no checks', () => expect(healthOf([])).toBe('off'))
  it('is down when the latest check failed', () => expect(healthOf([ok(), bad()])).toBe('down'))
  it('is unstable when an earlier check failed', () => expect(healthOf([bad(), ok()])).toBe('warn'))
  it('is up when every check passed', () => expect(healthOf([ok(), ok()])).toBe('ok'))
})

describe('overallOf', () => {
  it('ignores services with no data', () => expect(overallOf([ep('a', [])])).toEqual({ health: 'off', title: 'No checks yet' }))
  it('counts the down ones', () => expect(overallOf([ep('a', [bad()]), ep('b', [ok()]), ep('c', [ok()])]).title).toBe('1 of 3 services down'))
  it('says when everything is down', () => expect(overallOf([ep('a', [bad()])]).title).toBe('Everything is down'))
  it('mentions recent failures', () => expect(overallOf([ep('a', [bad(), ok()]), ep('b', [ok()])]).health).toBe('warn'))
  it('is all up', () => expect(overallOf([ep('a', [ok()])])).toEqual({ health: 'ok', title: 'All services up' }))
})

describe('groupsOf', () => {
  const at = (key: string, group: string | undefined, hostname?: string): EndpointStatus => ({
    key,
    name: key,
    group,
    results: hostname ? [{ ...ok(), hostname }] : [],
  })
  it('orders groups websites, API, infrastructure, then others alphabetically, then ungrouped', () => {
    const g = groupsOf([at('x', undefined), at('n', 'infrastructure'), at('z', 'zeta'), at('a', 'API'), at('w', 'websites'), at('b', 'beta')])
    expect(g.map((x) => x.name)).toEqual(['websites', 'API', 'infrastructure', 'beta', 'zeta', ''])
  })
  it('orders a group by the host of its first check in SITES, then by name; other hosts last', () => {
    const g = groupsOf([
      at('status', 'websites', 'status.vexoul.net'),
      at('b-other', 'websites', 'ntfy.vexoul.net'),
      at('dtp', 'websites', 'dtp.vexoul.net'),
      at('a-other', 'websites'),
      at('root', 'websites', 'vexoul.net'),
      at('vods', 'websites', 'vods.vexoul.net'),
      at('keekivods', 'websites', 'keekivods.vexoul.net'),
    ])
    expect(g[0]!.endpoints.map((e) => e.key)).toEqual(['root', 'vods', 'dtp', 'status', 'keekivods', 'a-other', 'b-other'])
  })
})

describe('outagesOf', () => {
  const t = (m: number) => new Date(Date.UTC(2026, 8, 28, 12, m)).toISOString()
  it('pairs UNHEALTHY with the HEALTHY after it; an open one runs to now', () => {
    const o = outagesOf([
      { type: 'START', timestamp: t(0) },
      { type: 'HEALTHY', timestamp: t(0) },
      { type: 'UNHEALTHY', timestamp: t(5) },
      { type: 'HEALTHY', timestamp: t(8) },
      { type: 'UNHEALTHY', timestamp: t(20) },
    ], Date.parse(t(30)))
    expect(o.since).toBe(Date.parse(t(0)))
    expect(o.down).toEqual([[Date.parse(t(5)), Date.parse(t(8))], [Date.parse(t(20)), Date.parse(t(30))]])
  })
  it('reads the state before dropped events as the opposite of the first one left', () => {
    const o = outagesOf([{ type: 'HEALTHY', timestamp: t(8) }], Date.parse(t(30)))
    expect(o.since).toBe(-Infinity)
    expect(o.down).toEqual([[-Infinity, Date.parse(t(8))]])
  })
})

describe('gridOf', () => {
  // Local time, since cells and columns sit on the local calendar. Mon 28 Sep 2026, 12:37:30.
  const now = new Date(2026, 8, 28, 12, 37, 30).getTime()
  const at = (d: number, h: number, m = 0, s = 0) => new Date(2026, 8, d, h, m, s).toISOString()
  const flat = (cols: ReturnType<typeof gridOf>) => cols.flat().filter((c) => c.status !== 'none')
  it('has every cell of the range, in calendar columns with a partial first and last', () => {
    const shape = (r: Parameters<typeof gridOf>[2]) => {
      const g = gridOf([], [], r, now)
      return [g.length, g[0]!.length, flat(g).length]
    }
    expect(shape('1h')).toEqual([13, 5, 60]) // 11:38..12:37: columns 11:35..12:35
    expect(shape('24h')).toEqual([25, 4, 96]) // yesterday 12:45..12:30 today
    expect(shape('7d')).toEqual([29, 6, 168])
    expect(shape('30d')).toEqual([31, 4, 120])
    const year = gridOf([], [], '1y', now)
    expect(year[0]!.length).toBe(7)
    expect(flat(year)).toHaveLength(365)
    expect(year.at(-1)!.findIndex((c) => c.status === 'none')).toBe(2) // today is a Monday: Tue–Sat still to come
  })
  it('weeks start on Sunday', () => {
    const year = gridOf([], [{ type: 'START', timestamp: at(1, 0) }], '1y', now)
    const last = year.at(-1)!
    expect(last[0]!.label).toMatch(/Sep 27/) // Sunday
    expect(last[1]!.label).toMatch(/Sep 28/)
    expect(gridStart('1y', now)).toMatch(/Sep 29|Sept 29/) // in 2025, 364 days back
  })
  it('colours a cell by how much of it an outage took', () => {
    const events = [
      { type: 'START' as const, timestamp: at(28, 6) },
      { type: 'HEALTHY' as const, timestamp: at(28, 6) },
      { type: 'UNHEALTHY' as const, timestamp: at(28, 9, 0) },
      { type: 'HEALTHY' as const, timestamp: at(28, 9, 5) }, // 5 of 09:00–09:15
      { type: 'UNHEALTHY' as const, timestamp: at(28, 9, 15) },
      { type: 'HEALTHY' as const, timestamp: at(28, 9, 26) }, // 11 of 09:15–09:30: over two thirds
      { type: 'UNHEALTHY' as const, timestamp: at(28, 9, 30) },
      { type: 'HEALTHY' as const, timestamp: at(28, 9, 45) }, // all of 09:30–09:45
    ]
    const results = [{ ...bad(), timestamp: at(28, 12, 20, 5) }, { ...ok(), timestamp: at(28, 12, 36, 5) }]
    const g = gridOf(results, events, '24h', now)
    const col = (h: number) => g.at(-1 - (12 - h))!
    expect(col(9).map((c) => c.status)).toEqual(['partial', 'caution', 'down', 'ok'])
    expect(col(9)[0]!.label).toMatch(/down 5 min \(33%\)$/)
    expect(col(9)[2]!.label).toMatch(/down 15 min$/)
    expect(col(5)[3]!.status).toBe('off') // 05:45–06:00: before checks began
    expect(col(12).map((c) => c.status)).toEqual(['ok', 'warn', 'ok', 'none'])
  })
  it("shows no record, not an outage, before the oldest event Gatus kept", () => {
    const g = gridOf([], [{ type: 'HEALTHY', timestamp: at(28, 8) }], '24h', now)
    expect(g.at(-6)![3]!.label).toMatch(/no record$/) // 07:45
    expect(g.at(-6)![3]!.status).toBe('off')
    expect(flat(g).some((c) => c.status === 'down' || c.status === 'caution' || c.status === 'partial')).toBe(false)
  })
})

describe('yearUptimeOf', () => {
  it('is the share of the record not in an outage', () => {
    const now = Date.UTC(2026, 8, 28, 12)
    const events = [
      { type: 'START' as const, timestamp: new Date(now - 10 * 3_600_000).toISOString() },
      { type: 'UNHEALTHY' as const, timestamp: new Date(now - 2 * 3_600_000).toISOString() },
      { type: 'HEALTHY' as const, timestamp: new Date(now - 3_600_000).toISOString() },
    ]
    expect(yearUptimeOf(events, now)).toBeCloseTo(0.9)
    expect(yearUptimeOf(undefined, now)).toBeNull()
  })
})

describe('percent', () => {
  it('never rounds a miss up to 100', () => expect(percent(0.99999)).toBe('99.99%'))
  it('floors to two decimals', () => expect(percent(0.99931)).toBe('99.93%'))
  it('trims zeros', () => expect(percent(0.5)).toBe('50%'))
  it('is 100 when perfect', () => expect(percent(1)).toBe('100%'))
  it('is a dash with no number', () => expect(percent(null)).toBe('—'))
})

describe('failureOf', () => {
  it('lists failed conditions', () =>
    expect(failureOf(bad({ conditionResults: [{ condition: '[STATUS] == 200', success: false }, { condition: '[RESPONSE_TIME] < 500', success: true }] }))).toBe(
      '[STATUS] == 200',
    ))
  it('falls back to the error', () => expect(failureOf(bad({ errors: ['timeout'] }))).toBe('timeout'))
  it('then the status', () => expect(failureOf(bad())).toBe('HTTP 502'))
  it('then nothing answered', () => expect(failureOf(bad({ status: 0 }))).toBe('no answer'))
})

describe('ticksOf', () => {
  it('marks failures down and labels them with why', () => {
    const [a, b] = ticksOf([ok(), bad()])
    expect(a!.status).toBe('ok')
    expect(a!.label).toMatch(/200 · 21 ms$/)
    expect(b!).toMatchObject({ status: 'down' })
    expect(b!.label).toMatch(/HTTP 502$/)
  })
})

describe('span', () => {
  it('minutes', () => expect(span(3 * 60000)).toBe('3 min'))
  it('at least a minute', () => expect(span(1000)).toBe('1 min'))
  it('hours', () => expect(span(125 * 60000)).toBe('2 h 5 min'))
  it('days', () => expect(span(28 * 3600000)).toBe('1 d 4 h'))
})

describe('incidentsOf', () => {
  const t = (m: number) => new Date(Date.UTC(2026, 8, 28, 12, m)).toISOString()
  it('pairs each outage with its recovery, newest first', () => {
    const out = incidentsOf([
      { type: 'START', timestamp: t(0) },
      { type: 'UNHEALTHY', timestamp: t(1) },
      { type: 'HEALTHY', timestamp: t(4) },
      { type: 'UNHEALTHY', timestamp: t(10) },
    ], Date.parse(t(15)))
    expect(out).toEqual([
      { start: t(10), end: null, length: '5 min' },
      { start: t(1), end: t(4), length: '3 min' },
    ])
  })
  it('is empty without events', () => expect(incidentsOf(undefined)).toEqual([]))
})

describe('announcementTone', () => {
  it('maps Gatus types', () => {
    expect(announcementTone({ timestamp: '', message: '', type: 'outage' })).toBe('error')
    expect(announcementTone({ timestamp: '', message: '', type: 'warning' })).toBe('warn')
    expect(announcementTone({ timestamp: '', message: '', type: 'operational' })).toBe('ok')
    expect(announcementTone({ timestamp: '', message: '' })).toBe('info')
  })
})
