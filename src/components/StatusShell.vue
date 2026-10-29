<script setup lang="ts">
// Every page's frame: the shared shell. Nothing here needs signing in; the menu shows the shared account, and is
// left out when sign-in is off (VITE_AUTH_BASE empty). With VITE_STATUS_SWITCHER=off the header shows the page's
// name instead of the vexoul.net site switcher, for a build that isn't one of the network's sites.
import { VxAccount, VxMark, VxSiteHeader, VxSiteShell } from '@vex/ui'
import { useAccount } from '@vex/ui/account'

const TITLE = __TITLE__
const switcher = import.meta.env.VITE_STATUS_SWITCHER !== 'off'
const account = useAccount()
</script>

<template>
  <VxSiteShell site="status" :class="{ 'no-switcher': !switcher }">
    <template v-if="!switcher" #header>
      <VxSiteHeader site="status">
        <template #brand>
          <RouterLink to="/" class="vx-switcher-trigger is-brand"><VxMark class="vx-switcher-mark" :size="22" /><b>{{ TITLE }}</b></RouterLink>
        </template>
        <template v-if="account.enabled" #account><VxAccount /></template>
      </VxSiteHeader>
    </template>
    <template v-if="account.enabled" #account><VxAccount /></template>
    <slot></slot>
  </VxSiteShell>
</template>

<style scoped>
/* shortcut: VxSiteFooter has no way to leave out its site switcher yet, so it's hidden here; drop this when it does. */
.no-switcher :deep(.vx-foot > .vx-popover) { display: none; }
</style>
