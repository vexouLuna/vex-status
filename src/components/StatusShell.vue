<script setup lang="ts">
// Every page's frame: the shared shell. Nothing here needs signing in; the menu shows the shared account.
import { VxAccount, VxSiteShell } from '@vex/ui'
import type { NavItem } from '@vex/ui'

const NAV: NavItem[] = [{ label: 'Services', to: '/' }]
</script>

<template>
  <VxSiteShell site="status" :nav="NAV">
    <template #account><VxAccount /></template>
    <slot></slot>
  </VxSiteShell>
</template>
