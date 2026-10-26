<script setup lang="ts">
// Everything at once: one line for the whole network, Gatus's announcements, then every service by group with its
// history over the chosen range. The range and the filter live in the URL (?period=7d&show=trouble), so a link shows the same view.
import { VxButton, VxCallout, VxEmptyState, VxLoadState, VxPageHead, VxSegmented, VxStatusDot } from '@vex/ui'
import { useNow } from '@vex/ui/utils'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EndpointRow from '@/components/EndpointRow.vue'
import StatusShell from '@/components/StatusShell.vue'
import { gatus, type EndpointStatus } from '@/lib/gatus'
import { GRID, RANGES, announcementTone, dateTime, groupsOf, healthOf, overallOf, yearUptimeOf, type Range } from '@/lib/health'
import { useLive } from '@/lib/useLive'
import { useNumbers } from '@/lib/useNumbers'

const TITLE = __TITLE__
const route = useRoute()
const router = useRouter()

// The latest hour of checks for every service, and each one's events (its outages, as far back as Gatus keeps them):
// the grids are built from both. A service whose events don't load still shows its checks.
const live = useLive(async () => {
  const endpoints = await gatus.statuses(GRID['1h'].cells)
  const events = await Promise.all(endpoints.map((e) => gatus.endpoint(e.key, 1).then((d) => d.events, () => undefined)))
  return endpoints.map((e, i) => ({ ...e, events: events[i] }))
})
const config = useLive(() => gatus.config())
const now = useNow(5000)

const period = computed<Range>({
  get: () => (RANGES as readonly string[]).includes(String(route.query.period)) ? (route.query.period as Range) : '24h',
  set: (p) => router.replace({ query: { ...route.query, period: p === '24h' ? undefined : p } }),
})
type Show = 'all' | 'trouble'
const show = computed<Show>({
  get: () => (route.query.show === 'trouble' ? 'trouble' : 'all'),
  set: (s) => router.replace({ query: { ...route.query, show: s === 'all' ? undefined : s } }),
})

const endpoints = computed(() => live.data.value ?? [])
const overall = computed(() => overallOf(endpoints.value))
const visible = computed(() => (show.value === 'all' ? endpoints.value : endpoints.value.filter((e) => healthOf(e.results) !== 'ok')))
const groups = computed(() => groupsOf(visible.value))
const announcements = computed(() => config.data.value?.announcements ?? [])

// Uptime and average response per service, each period's fetched again only when due (useNumbers). Gatus has
// neither for a year, so its uptime comes from the outages the grid shows.
const numbers = useNumbers()
const loadNumbers = (force = false) => {
  const p = period.value
  if (p !== '1y') void numbers.load(endpoints.value.map((e) => e.key), [p], force)
}
watch([() => endpoints.value.map((e) => e.key).join(), period, live.updated], () => loadNumbers())
const numbersOf = (e: EndpointStatus) =>
  period.value === '1y' ? { uptime: yearUptimeOf(e.events, live.updated.value ?? undefined), responseTime: null } : numbers.get(e.key, period.value)
function refresh() {
  void live.reload()
  loadNumbers(true)
}

const ago = computed(() => {
  if (!live.updated.value) return ''
  const s = Math.max(0, Math.round((now.value - live.updated.value) / 1000))
  return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)} min ago`
})
const periodOptions = RANGES.map((p) => ({ value: p, label: p }))
const showOptions = [
  { value: 'all' as const, label: 'All' },
  { value: 'trouble' as const, label: 'Not up' },
]
</script>

<template>
  <StatusShell>
    <VxPageHead :eyebrow="TITLE" title="">
      <template #title>
        <span aria-live="polite">
          <VxStatusDot v-if="live.data.value" size="lg" :status="overall.health">{{ overall.title }}</VxStatusDot>
          <template v-else-if="live.error.value">Status unknown</template>
          <template v-else>Checking…</template>
        </span>
      </template>
      <template #actions><VxButton size="sm" :disabled="live.loading.value" @click="refresh()">Refresh</VxButton></template>
      Every service is checked once a minute.<template v-if="ago"> Updated {{ ago }}.</template>
    </VxPageHead>

    <div v-if="announcements.length" class="stack announcements">
      <VxCallout v-for="a in announcements" :key="a.timestamp + a.message" :tone="announcementTone(a)">
        {{ a.message }}
        <div class="vx-muted small vx-mono">{{ dateTime(a.timestamp) }}</div>
      </VxCallout>
    </div>

    <div class="row controls">
      <span class="vx-muted small">Uptime over</span>
      <VxSegmented v-model="period" :options="periodOptions" label="Uptime period" />
      <span class="controls-gap"></span>
      <VxSegmented v-model="show" :options="showOptions" label="Which services" />
    </div>
    <ul class="legend vx-muted small" aria-label="Colours">
      <li><i class="is-ok"></i>up</li>
      <li><i class="is-warn"></i>failed checks, or down part of the time</li>
      <li><i class="is-caution"></i>down most of it</li>
      <li><i class="is-down"></i>down all of it</li>
      <li><i class="is-off"></i>no record</li>
    </ul>

    <div class="content">
      <VxLoadState
        :error="live.error.value"
        error-title="Couldn't load the checks"
        :stale="!!live.data.value"
        :stale-title="`Couldn't refresh, showing the checks from ${ago}`"
        :loading="!live.data.value"
        :empty="!visible.length"
        row-height="84px"
        @retry="live.reload()"
      >
        <template #empty>
          <VxEmptyState
            :title="show === 'trouble' ? 'Everything is up' : 'Nothing is checked yet'"
            :text="show === 'trouble' ? 'No service has failed a check lately.' : undefined"
          >
            <template v-if="show === 'trouble'" #actions><VxButton @click="show = 'all'">Show all services</VxButton></template>
          </VxEmptyState>
        </template>
        <section v-for="g in groups" :key="g.name">
          <h2 class="vx-display sec">{{ g.name || 'Other' }}</h2>
          <div class="stack">
            <EndpointRow
              v-for="e in g.endpoints"
              :key="e.key"
              :endpoint="e"
              :range="period"
              :uptime="numbersOf(e)?.uptime"
              :response-time="numbersOf(e)?.responseTime"
              :now="live.updated.value ?? now"
            />
          </div>
        </section>
      </VxLoadState>
    </div>
  </StatusShell>
</template>

<style scoped>
.announcements { margin-bottom: 18px; }
.controls { margin-bottom: 4px; }
.legend { list-style: none; display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 6px 0 0; padding: 0; font-size: 12px; }
.legend li { display: flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 2px; background: var(--vx-surface-2); }
.legend .is-ok { background: var(--vx-ok); }
.legend .is-warn { background: var(--vx-warn); }
.legend .is-caution { background: var(--vx-caution); }
.legend .is-down { background: var(--vx-bad); }
.controls-gap { flex: 1; }
/* The first group's heading sits right under the controls. */
.content { margin-top: 18px; }
section:first-of-type .sec { margin-top: 0; }
</style>
