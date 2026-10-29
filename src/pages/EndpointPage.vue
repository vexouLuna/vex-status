<script setup lang="ts">
// One service: uptime and average response over every period, its last hundred checks (pick one to see it in
// full), their response times, and its outages from Gatus's events. The checks are polled; the numbers are fetched
// again only when due (useNumbers), or on Refresh.
import { VxButton, VxEmptyState, VxLoadState, VxPageHead, VxSkeleton, VxStatTile, VxStatusDot, VxTable, VxUptimeBar } from '@vex/ui'
import type { TableColumn } from '@vex/ui'
import { computed, ref, watch } from 'vue'
import ResponseChart from '@/components/ResponseChart.vue'
import StatusShell from '@/components/StatusShell.vue'
import { PERIODS, gatus } from '@/lib/gatus'
import { HEALTH_WORD, dateTime, failureOf, healthOf, incidentsOf, millis, ms, percent, ticksOf, uptimeHealth } from '@/lib/health'
import { useLive } from '@/lib/useLive'
import { useNumbers } from '@/lib/useNumbers'

const props = defineProps<{ endpointKey: string }>()

const live = useLive(() => gatus.endpoint(props.endpointKey), () => props.endpointKey)
const numbers = useNumbers()
watch([() => props.endpointKey, live.updated], () => void numbers.load([props.endpointKey], PERIODS))
function refresh() {
  void live.reload()
  void numbers.load([props.endpointKey], PERIODS, true)
}

// Gatus answers 404 for a key it doesn't know.
const notFound = computed(() => !live.data.value && /^404/.test(live.error.value ?? ''))

const ep = computed(() => live.data.value ?? null)
// The route's static title until the service has loaded; syncDocumentTitle resets it on the next navigation.
watch(() => ep.value?.name, (name) => name && (document.title = `${name} · ${__TITLE__}`))
const results = computed(() => ep.value?.results ?? [])
const health = computed(() => healthOf(results.value))
const ticks = computed(() => ticksOf(results.value))
const incidents = computed(() => incidentsOf(ep.value?.events))
const OUTAGE_COLUMNS: TableColumn[] = [
  { key: 'start', label: 'Went down', mono: true, nowrap: true },
  { key: 'end', label: 'Came back', mono: true, nowrap: true },
  { key: 'length', label: 'For', mono: true, nowrap: true },
]
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
      <VxLoadState
        :error="live.error.value"
        error-title="Couldn't load this service"
        :stale="!!ep"
        stale-title="Couldn't refresh"
        :loading="!ep"
        @retry="live.reload()"
      >
        <template #loading>
          <VxSkeleton h="60px" />
          <VxSkeleton h="80px" />
          <VxSkeleton h="200px" />
        </template>
        <template v-if="ep">
          <VxPageHead :eyebrow="ep.group || 'service'" :title="ep.name">
            <template #title><VxStatusDot size="lg" :status="health">{{ ep.name }}</VxStatusDot></template>
            <template #actions><VxButton size="sm" :disabled="live.loading.value" @click="refresh()">Refresh</VxButton></template>
            <span aria-live="polite">
              {{ HEALTH_WORD[health] }}<template v-if="results.length"> · last checked {{ dateTime(results.at(-1)!.timestamp) }}</template>
            </span>
          </VxPageHead>

          <div class="tiles">
            <VxStatTile
              v-for="p in PERIODS"
              :key="p"
              :label="`last ${p}`"
              :status="uptimeHealth(numbers.get(endpointKey, p)?.uptime)"
              :headline="percent(numbers.get(endpointKey, p)?.uptime)"
              :sub="`avg ${millis(numbers.get(endpointKey, p)?.responseTime)}`"
            />
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
                <dl class="vx-facts is-inline vx-mono small">
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
          <VxTable v-else :columns="OUTAGE_COLUMNS" :rows="incidents" row-key="start" label="Outages">
            <template #cell-start="{ row }">{{ dateTime(row.start) }}</template>
            <template #cell-end="{ row }">
              <template v-if="row.end">{{ dateTime(row.end) }}</template>
              <VxStatusDot v-else status="down">still down</VxStatusDot>
            </template>
          </VxTable>
          <p v-if="incidents.length && started" class="vx-muted small">Checks began {{ dateTime(started) }}.</p>
        </template>
      </VxLoadState>
    </template>
  </StatusShell>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 14px; }
.back:hover { color: var(--vx-ink); }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.checks { padding: 14px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.check { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--vx-line); padding-top: 12px; }
.conds { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.conds li { overflow-wrap: anywhere; }
.conds .is-ok > span:first-child { color: var(--vx-ok); }
.conds .is-bad { color: var(--vx-bad); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@container vx-site (max-width: 700px) {
  .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
