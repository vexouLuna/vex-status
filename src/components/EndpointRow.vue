<script setup lang="ts">
// One service on the front page: its state, uptime and average response over the chosen period, and its history
// over that period as a bar. The name opens the service's own page.
import { VxStatusDot, VxUptimeBar } from '@vex/ui'
import { computed } from 'vue'
import type { EndpointStatus, Period } from '@/lib/gatus'
import { HEALTH_WORD, healthOf, historyOf, historyStart, millis, percent } from '@/lib/health'

const props = defineProps<{
  endpoint: EndpointStatus
  period: Period
  uptime?: number | null
  responseTime?: number | null
  /** When the data was fetched: the bar ends there. */
  now: number
}>()

const health = computed(() => healthOf(props.endpoint.results))
const ticks = computed(() => historyOf(props.endpoint.results, props.endpoint.events, props.period, props.now))
const start = computed(() => historyStart(props.period, props.now))
</script>

<template>
  <div class="ep vx-panel">
    <div class="ep-top">
      <RouterLink :to="`/endpoints/${endpoint.key}`" class="ep-name">
        <VxStatusDot :status="health"><b>{{ endpoint.name }}</b></VxStatusDot>
      </RouterLink>
      <span class="ep-word small" :class="`is-${health}`">{{ HEALTH_WORD[health] }}</span>
      <span class="ep-spacer"></span>
      <span class="ep-nums vx-mono small">
        <span :title="`Uptime over the last ${period}`"><span class="vx-muted">{{ period }}</span> {{ percent(uptime) }}</span>
        <span :title="`Average response over the last ${period}`"><span class="vx-muted">avg</span> {{ millis(responseTime) }}</span>
      </span>
    </div>
    <VxUptimeBar :ticks="ticks" :label="`${endpoint.name}, last ${period}`" />
    <div class="ep-axis vx-mono small vx-muted" aria-hidden="true">
      <span>{{ start }}</span>
      <span>now</span>
    </div>
  </div>
</template>

<style scoped>
.ep { padding: 12px 14px 10px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ep-top { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; }
.ep-name { color: var(--vx-ink); }
.ep-name:hover b { text-decoration: underline; text-underline-offset: 3px; }
.ep-name .vx-status { font-size: 14px; }
.ep-word.is-ok { color: var(--vx-ok); }
.ep-word.is-warn { color: var(--vx-warn); }
.ep-word.is-down { color: var(--vx-bad); }
.ep-word.is-off { color: var(--vx-muted); }
.ep-spacer { flex: 1; }
.ep-nums { display: flex; gap: 14px; }
.ep-axis { display: flex; justify-content: space-between; font-size: 11px; }
</style>
