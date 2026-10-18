<script setup lang="ts">
// Everything at once: one line for the whole network, Gatus's announcements, then every service by group with its
// history over the chosen period. The period and the filter live in the URL (?period=7d&show=trouble), so a link shows the same view.
import { VxButton, VxCallout, VxEmptyState, VxSegmented, VxSkeleton, VxStatusDot } from '@vex/ui'
import { useNow } from '@vex/ui/utils'
import { computed, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EndpointRow from '@/components/EndpointRow.vue'
import StatusShell from '@/components/StatusShell.vue'
import { PERIODS, gatus, type Period } from '@/lib/gatus'
import { HISTORY, NUMBERS_TTL, announcementTone, dateTime, groupsOf, healthOf, overallOf } from '@/lib/health'
import { useLive } from '@/lib/useLive'

const route = useRoute()
const router = useRouter()

// The latest hour of checks for every service, and each one's events (its outages, as far back as Gatus keeps them):
// the bars are built from both. A service whose events don't load still shows its checks.
const live = useLive(async () => {
  const endpoints = await gatus.statuses(HISTORY['1h'].slots)
  const events = await Promise.all(endpoints.map((e) => gatus.endpoint(e.key, 1).then((d) => d.events, () => undefined)))
  return endpoints.map((e, i) => ({ ...e, events: events[i] }))
})
const config = useLive(() => gatus.config())
const now = useNow(5000)

const period = computed<Period>({
  get: () => (PERIODS as readonly string[]).includes(String(route.query.period)) ? (route.query.period as Period) : '24h',
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

// Uptime and average response per service and period, fetched per service. A poll fetches only the ones older than
// the period's NUMBERS_TTL (or that failed), a period seen before shows its numbers until they're due again, and
// Refresh fetches them all.
interface Numbers {
  uptime: number | null
  responseTime: number | null
  /** When they were fetched (ms); 0 when either failed, so the next poll tries again. */
  at: number
}
const numbers = reactive(new Map<string, Numbers>())
const pending = new Set<string>()
const numbersKey = (k: string, p: Period) => `${p} ${k}`
const numbersOf = (k: string) => numbers.get(numbersKey(k, period.value))

async function loadNumbers(force = false) {
  const p = period.value
  await Promise.all(
    endpoints.value.map(async (e) => {
      const id = numbersKey(e.key, p)
      const had = numbers.get(id)
      if (pending.has(id) || (!force && had && Date.now() - had.at < NUMBERS_TTL[p])) return
      pending.add(id)
      try {
        const [uptime, responseTime] = await Promise.all([
          gatus.uptime(e.key, p).catch(() => null),
          gatus.responseTime(e.key, p).catch(() => null),
        ])
        numbers.set(id, { uptime, responseTime, at: uptime === null || responseTime === null ? 0 : Date.now() })
      } finally {
        pending.delete(id)
      }
    }),
  )
}
watch([() => endpoints.value.map((e) => e.key).join(), period, live.updated], () => void loadNumbers())
function refresh() {
  void live.reload()
  void loadNumbers(true)
}

const ago = computed(() => {
  if (!live.updated.value) return ''
  const s = Math.max(0, Math.round((now.value - live.updated.value) / 1000))
  return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)} min ago`
})
const periodOptions = PERIODS.map((p) => ({ value: p, label: p }))
const showOptions = [
  { value: 'all' as const, label: 'All' },
  { value: 'trouble' as const, label: 'Not up' },
]
</script>

<template>
  <StatusShell>
    <div class="page-head">
      <div>
        <div class="vx-eyebrow">vexoul.net status</div>
        <h1 class="vx-display" aria-live="polite">
          <template v-if="live.data.value"><VxStatusDot class="big-dot" :status="overall.health" />{{ overall.title }}</template>
          <template v-else-if="live.error.value">Status unknown</template>
          <template v-else>Checking…</template>
        </h1>
        <p class="vx-muted small head-note">
          Every service is checked once a minute.<template v-if="ago"> Updated {{ ago }}.</template>
        </p>
      </div>
      <VxButton size="sm" :disabled="live.loading.value" @click="refresh()">Refresh</VxButton>
    </div>

    <div v-if="announcements.length" class="stack announcements">
      <VxCallout v-for="a in announcements" :key="a.timestamp + a.message" :tone="announcementTone(a)">
        {{ a.message }}
        <div class="vx-muted small vx-mono">{{ dateTime(a.timestamp) }}</div>
      </VxCallout>
    </div>

    <VxCallout v-if="live.error.value" :tone="live.data.value ? 'warn' : 'error'" :title="live.data.value ? `Couldn't refresh, showing the checks from ${ago}` : `Couldn't load the checks`" class="err">
      {{ live.error.value }}
      <template #actions><VxButton size="sm" @click="live.reload()">Try again</VxButton></template>
    </VxCallout>

    <div class="row controls">
      <span class="vx-muted small">Uptime over</span>
      <VxSegmented v-model="period" :options="periodOptions" label="Uptime period" />
      <span class="controls-gap"></span>
      <VxSegmented v-model="show" :options="showOptions" label="Which services" />
    </div>

    <div v-if="!live.data.value && !live.error.value" class="stack" aria-busy="true">
      <VxSkeleton v-for="i in 4" :key="i" h="84px" />
    </div>
    <VxEmptyState
      v-else-if="live.data.value && !visible.length"
      :title="show === 'trouble' ? 'Everything is up' : 'Nothing is checked yet'"
      :text="show === 'trouble' ? 'No service has failed a check lately.' : undefined"
    >
      <template v-if="show === 'trouble'" #actions><VxButton @click="show = 'all'">Show all services</VxButton></template>
    </VxEmptyState>
    <section v-for="g in groups" :key="g.name">
      <h2 class="vx-display sec">{{ g.name || 'Other' }}</h2>
      <div class="stack">
        <EndpointRow
          v-for="e in g.endpoints"
          :key="e.key"
          :endpoint="e"
          :period="period"
          :uptime="numbersOf(e.key)?.uptime"
          :response-time="numbersOf(e.key)?.responseTime"
          :now="live.updated.value ?? now"
        />
      </div>
    </section>
  </StatusShell>
</template>

<style scoped>
.head-note { margin: 0; }
.announcements, .err { margin-bottom: 18px; }
.controls { margin-bottom: 4px; }
.controls-gap { flex: 1; }
section:first-of-type .sec { margin-top: 18px; }
</style>
