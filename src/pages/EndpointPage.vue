<script setup lang="ts">
// One service: uptime and average response over every period, its last hundred checks (pick one to see it in
// full), their response times, and its outages from Gatus's events.
import { VxButton, VxCallout, VxEmptyState, VxSkeleton, VxStatusDot, VxUptimeBar } from '@vex/ui'
import { computed, ref, watch } from 'vue'
import ResponseChart from '@/components/ResponseChart.vue'
import StatusShell from '@/components/StatusShell.vue'
import { PERIODS, gatus, type Period } from '@/lib/gatus'
import { HEALTH_WORD, dateTime, failureOf, healthOf, incidentsOf, millis, ms, percent, ticksOf } from '@/lib/health'
import { useLive } from '@/lib/useLive'

const props = defineProps<{ endpointKey: string }>()

const live = useLive(async () => {
  const [endpoint, numbers] = await Promise.all([
    gatus.endpoint(props.endpointKey),
    Promise.all(
      PERIODS.map(async (p) => {
        const [uptime, responseTime] = await Promise.all([
          gatus.uptime(props.endpointKey, p).catch(() => null),
          gatus.responseTime(props.endpointKey, p).catch(() => null),
        ])
        return [p, { uptime, responseTime }] as const
      }),
    ),
  ])
  return { endpoint, numbers: new Map<Period, { uptime: number | null; responseTime: number | null }>(numbers) }
}, () => props.endpointKey)

// Gatus answers 404 for a key it doesn't know.
const notFound = computed(() => !live.data.value && /^404/.test(live.error.value ?? ''))

const ep = computed(() => live.data.value?.endpoint ?? null)
const results = computed(() => ep.value?.results ?? [])
const health = computed(() => healthOf(results.value))
const ticks = computed(() => ticksOf(results.value))
const incidents = computed(() => incidentsOf(ep.value?.events))
const started = computed(() => ep.value?.events?.find((e) => e.type === 'START')?.timestamp)

// The check shown in full: the one picked, else the latest. A refresh adds checks at the end and drops the oldest,
// so a pick follows its check by timestamp rather than by index.
const picked = ref<string | null>(null)
const selected = computed<number | null>({
  get: () => {
    if (!picked.value) return null
    const i = results.value.findIndex((r) => r.timestamp === picked.value)
    return i < 0 ? null : i
  },
  set: (i) => (picked.value = i === null ? null : (results.value[i]?.timestamp ?? null)),
})
watch(() => props.endpointKey, () => (picked.value = null))
const check = computed(() => results.value[selected.value ?? results.value.length - 1] ?? null)
</script>

<template>
  <StatusShell>
    <RouterLink to="/" class="back vx-muted small">← All services</RouterLink>

    <VxEmptyState v-if="notFound" code="404" title="No such service" :text="`Nothing is checked under “${endpointKey}”.`">
      <template #actions><VxButton to="/" variant="primary">All services</VxButton></template>
    </VxEmptyState>
    <template v-else>
      <VxCallout v-if="live.error.value" :tone="live.data.value ? 'warn' : 'error'" :title="live.data.value ? `Couldn't refresh` : `Couldn't load this service`" class="err">
        {{ live.error.value }}
        <template #actions><VxButton size="sm" @click="live.reload()">Try again</VxButton></template>
      </VxCallout>

      <div v-if="!ep && !live.error.value" class="stack" aria-busy="true">
        <VxSkeleton h="60px" />
        <VxSkeleton h="80px" />
        <VxSkeleton h="200px" />
      </div>

      <template v-if="ep">
        <div class="page-head">
          <div>
            <div class="vx-eyebrow">{{ ep.group || 'service' }}</div>
            <h1 class="vx-display"><VxStatusDot class="big-dot" :status="health" />{{ ep.name }}</h1>
            <p class="vx-muted small head-note" aria-live="polite">
              {{ HEALTH_WORD[health] }}<template v-if="results.length"> · last checked {{ dateTime(results.at(-1)!.timestamp) }}</template>
            </p>
          </div>
          <VxButton size="sm" :disabled="live.loading.value" @click="live.reload()">Refresh</VxButton>
        </div>

        <div class="tiles">
          <div v-for="p in PERIODS" :key="p" class="tile vx-panel">
            <div class="vx-eyebrow">last {{ p }}</div>
            <div class="tile-main vx-mono">{{ percent(live.data.value?.numbers.get(p)?.uptime) }}</div>
            <div class="vx-muted small vx-mono">avg {{ millis(live.data.value?.numbers.get(p)?.responseTime) }}</div>
          </div>
        </div>

        <h2 class="vx-display sec">Last {{ results.length }} checks</h2>
        <div class="vx-panel checks">
          <p v-if="!results.length" class="vx-muted">No checks yet.</p>
          <template v-else>
            <VxUptimeBar v-model:selected="selected" :ticks="ticks" :height="36" selectable :label="`${ep.name}, last ${results.length} checks`" />
            <ResponseChart v-model:selected="selected" :results="results" />
            <div v-if="check" class="check" aria-live="polite">
              <div class="row">
                <VxStatusDot :status="check.success ? 'ok' : 'down'"><b>{{ check.success ? 'Passed' : 'Failed' }}</b></VxStatusDot>
                <span class="vx-mono small">{{ dateTime(check.timestamp) }}</span>
                <span class="vx-muted small">{{ selected === null ? 'latest check · pick another above' : 'picked' }}</span>
                <VxButton v-if="selected !== null" size="sm" variant="ghost" @click="selected = null">Show latest</VxButton>
              </div>
              <dl class="facts vx-mono small">
                <div><dt class="vx-muted">response</dt><dd>{{ millis(ms(check)) }}</dd></div>
                <div v-if="check.status"><dt class="vx-muted">status</dt><dd>{{ check.status }}</dd></div>
                <div v-if="!check.success"><dt class="vx-muted">why</dt><dd>{{ failureOf(check) }}</dd></div>
              </dl>
              <ul v-if="check.conditionResults?.length" class="conds vx-mono small">
                <li v-for="c in check.conditionResults" :key="c.condition" :class="c.success ? 'is-ok' : 'is-bad'">
                  <span aria-hidden="true">{{ c.success ? '✓' : '×' }}</span>
                  <span class="sr-only">{{ c.success ? 'passed' : 'failed' }}:</span>
                  {{ c.condition }}
                </li>
              </ul>
              <ul v-if="check.errors?.length" class="conds vx-mono small">
                <li v-for="e in check.errors" :key="e" class="is-bad"><span aria-hidden="true">!</span> {{ e }}</li>
              </ul>
            </div>
          </template>
        </div>

        <h2 class="vx-display sec">Outages</h2>
        <p v-if="!incidents.length" class="vx-muted">
          None on record<template v-if="started">, since checks began {{ dateTime(started) }}</template>.
        </p>
        <div v-else class="table-scroll">
          <table class="vx-table">
            <thead><tr><th>Went down</th><th>Came back</th><th>For</th></tr></thead>
            <tbody>
              <tr v-for="i in incidents" :key="i.start">
                <td class="vx-mono">{{ dateTime(i.start) }}</td>
                <td class="vx-mono">
                  <template v-if="i.end">{{ dateTime(i.end) }}</template>
                  <VxStatusDot v-else status="down">still down</VxStatusDot>
                </td>
                <td class="vx-mono">{{ i.length }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="incidents.length && started" class="vx-muted small">Checks began {{ dateTime(started) }}.</p>
      </template>
    </template>
  </StatusShell>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 14px; }
.back:hover { color: var(--vx-ink); }
.head-note { margin: 0; }
.err { margin-bottom: 18px; }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.tile { padding: 10px 14px; }
.tile-main { font-size: 22px; margin: 2px 0; }
.checks { padding: 14px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.check { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--vx-line); padding-top: 12px; }
.facts { display: flex; flex-wrap: wrap; gap: 4px 20px; margin: 0; }
.facts div { display: flex; gap: 8px; }
.facts dd { margin: 0; overflow-wrap: anywhere; }
.conds { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.conds li { overflow-wrap: anywhere; }
.conds .is-ok > span:first-child { color: var(--vx-ok); }
.conds .is-bad { color: var(--vx-bad); }
.table-scroll { overflow-x: auto; }
.table-scroll > table { min-width: 26rem; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@container vx-site (max-width: 700px) {
  .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
