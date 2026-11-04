// Gatus's API (/api/v1), served on this site's origin. Only the parts these pages read. Gatus is the backend and
// stays as it is: anything missing here is a Gatus setting, not something to work out in the browser.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** The text to show for a caught error. */
export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))

async function request(path: string): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, { credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, "Couldn't reach the status checker.")
  }
  if (!response.ok) throw new ApiError(response.status, `${response.status} ${response.statusText}`.trim())
  return response
}
const json = async <T>(path: string) => (await (await request(path)).json()) as T
/** The uptime and response-time endpoints answer with a bare number as text. */
const number = async (path: string) => {
  const text = (await (await request(path)).text()).trim()
  const n = text ? Number(text) : NaN // Number('') is 0, which would read as 0% / 0 ms
  if (!Number.isFinite(n)) throw new ApiError(0, 'Not a number')
  return n
}

export interface ConditionResult {
  condition: string
  success: boolean
}
export interface CheckResult {
  /** HTTP status; 0 or missing when nothing answered. */
  status?: number
  hostname?: string
  /** Nanoseconds. */
  duration: number
  conditionResults?: ConditionResult[]
  errors?: string[]
  success: boolean
  timestamp: string
}
export interface EndpointEvent {
  type: 'START' | 'HEALTHY' | 'UNHEALTHY'
  timestamp: string
}
export interface EndpointStatus {
  name: string
  group?: string
  key: string
  /** Oldest first. */
  results: CheckResult[]
  /** Only on a single endpoint's statuses. */
  events?: EndpointEvent[]
}
export interface Announcement {
  timestamp: string
  type?: 'outage' | 'warning' | 'information' | 'operational' | 'none'
  message: string
}

export const PERIODS = ['1h', '24h', '7d', '30d'] as const
export type Period = (typeof PERIODS)[number]

/** How many checks Gatus keeps per endpoint (its default `maximum-number-of-results`). */
export const MAX_RESULTS = 100

const key = (k: string) => encodeURIComponent(k)

export const gatus = {
  statuses: (pageSize = 50) => json<EndpointStatus[]>(`/endpoints/statuses?page=1&pageSize=${pageSize}`),
  endpoint: (k: string, pageSize = MAX_RESULTS) => json<EndpointStatus>(`/endpoints/${key(k)}/statuses?page=1&pageSize=${pageSize}`),
  /** 0..1 */
  uptime: (k: string, p: Period) => number(`/endpoints/${key(k)}/uptimes/${p}`),
  /** Average, in ms. */
  responseTime: (k: string, p: Period) => number(`/endpoints/${key(k)}/response-times/${p}`),
  config: () => json<{ announcements?: Announcement[] }>('/config'),
}
