<script setup lang="ts">
// One service on the front page: its state, uptime and average response over the chosen range, and its history
// over that range as a grid. The name opens the service's own page.
import { VxStatusDot } from '@vex/ui'
import { computed } from 'vue'
import UptimeGrid from '@/components/UptimeGrid.vue'
import type { EndpointStatus } from '@/lib/gatus'
import { HEALTH_WORD, gridOf, gridStart, healthOf, millis, percent, type Range } from '@/lib/health'

const props = defineProps<{
  endpoint: EndpointStatus
  range: Range
  uptime?: number | null
  responseTime?: number | null
  /** When the data was fetched: the bar ends there. */
  now: number
}>()

const health = computed(() => healthOf(props.endpoint.results))
const columns = computed(() => gridOf(props.endpoint.results, props.endpoint.events, props.range, props.now))
const start = computed(() => gridStart(props.range, props.now))
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
        <span :title="range === '1y' ? 'Uptime over the last year, from the outages on record' : `Uptime over the last ${range}`"><span class="vx-muted">{{ range }}</span> {{ percent(uptime) }}</span>
        <!-- Gatus keeps no response times past 30 days. -->
        <span v-if="range !== '1y'" :title="`Average response over the last ${range}`"><span class="vx-muted">avg</span> {{ millis(responseTime) }}</span>
      </span>
    </div>
    <UptimeGrid :columns="columns" :label="`${endpoint.name}, last ${range}`" />
    <div class="ep-axis vx-mono small vx-muted" :style="{ '--cols': columns.length }" aria-hidden="true">
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
/* Same width as UptimeGrid (its --max 24px, --gap 2px), so the labels sit at the grid's edges. */
.ep-axis { display: flex; justify-content: space-between; font-size: 11px; width: 100%; max-width: calc(var(--cols) * 26px - 2px); margin-inline: auto; }
</style>
