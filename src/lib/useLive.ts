// Loads a page's data, then again every minute (Gatus checks once a minute) while the tab is visible, and right
// away when it becomes visible again (the library's usePoll). A failed refresh keeps the last answer and sets
// `error` to its message, so the page can say it's stale instead of going blank. Reloads from scratch when
// `source` changes (a route param).
import { usePoll } from '@vex/ui/utils'
import { computed, type WatchSource } from 'vue'
import { errorMessage } from './gatus'

export const REFRESH_MS = 60_000

export function useLive<T>(load: () => Promise<T>, source?: WatchSource) {
  const live = usePoll(load, REFRESH_MS, { source })
  const error = computed(() => (live.error.value == null ? null : errorMessage(live.error.value)))
  return { ...live, error }
}
