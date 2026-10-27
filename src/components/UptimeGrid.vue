<script setup lang="ts">
// A service's history as a grid, GitHub's contribution graph turned to uptime: columns oldest on the left, each a
// stretch of calendar time (a week, a day, an hour...) top to bottom, so the first and last columns are partial.
// Green up, yellow a failed check or an outage over part of a cell, amber over most of it, red all of it, grey no
// record. Hovering a cell shows its label above it, like VxUptimeBar; touch screens get it on tap.
import { clampX } from '@vex/ui/utils'
import { computed, nextTick, ref } from 'vue'
import type { GridCell } from '@/lib/health'

const props = defineProps<{
  columns: GridCell[][]
  /** What the grid is, for screen readers ("vods, last 24h"). */
  label: string
}>()

const rows = computed(() => props.columns[0]?.length ?? 0)
const summary = computed(() => {
  const known = props.columns.flat().filter((c) => c.status !== 'none' && c.status !== 'off')
  const up = known.filter((c) => c.status === 'ok' || c.status === 'warn').length
  return `${props.label}: ${known.length ? `up all through ${up} of ${known.length}` : 'no data'}`
})

// The one bubble, over whichever cell is hovered.
const bubble = ref<HTMLElement | null>(null)
const shown = ref<{ col: number; row: number } | null>(null)
const shiftX = ref(0)
const text = computed(() => (shown.value ? props.columns[shown.value.col]?.[shown.value.row]?.label : undefined))
const place = computed(() => {
  if (!shown.value) return {}
  const { col, row } = shown.value
  return { left: `${((col + 0.5) / props.columns.length) * 100}%`, bottom: `calc(${((rows.value - row) / rows.value) * 100}% + 6px)` }
})
async function show(col: number, row: number) {
  if (!props.columns[col]?.[row]?.label) return
  shiftX.value = 0
  shown.value = { col, row }
  await nextTick()
  const box = bubble.value?.getBoundingClientRect()
  if (box) shiftX.value = clampX(box.left, box.right, document.documentElement.clientWidth)
}
const hide = () => (shown.value = null)
</script>

<template>
  <div class="grid" role="img" :aria-label="summary" :style="{ '--cols': columns.length, '--rows': rows }" @pointerleave="hide">
    <template v-for="(column, c) in columns" :key="c">
      <span v-for="(cell, r) in column" :key="r" class="cell" :class="`is-${cell.status}`" @pointerenter="show(c, r)"></span>
    </template>
    <span v-if="text" ref="bubble" class="vx-tooltip-bubble" :style="{ ...place, translate: shiftX ? `${shiftX}px 0` : undefined }" aria-hidden="true">{{ text }}</span>
  </div>
</template>

<style scoped>
.grid { --gap: 2px; --max: 24px; width: 100%; position: relative; display: grid; grid-auto-flow: column; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); grid-template-rows: repeat(var(--rows), auto); gap: var(--gap); max-width: calc(var(--cols) * (var(--max) + var(--gap)) - var(--gap)); margin-inline: auto; }
.cell { aspect-ratio: 1; border-radius: 2px; background: var(--vx-surface-2); }
.cell.is-ok { background: var(--vx-ok); }
.cell.is-warn, .cell.is-partial { background: var(--vx-warn); }
.cell.is-caution { background: var(--vx-caution); }
.cell.is-down { background: var(--vx-bad); }
.cell.is-none { background: none; }
.cell:not(.is-none):hover { opacity: 0.75; }
.vx-tooltip-bubble { white-space: nowrap; top: auto; }
</style>
