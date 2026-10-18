<script setup lang="ts">
import { VxButton, VxEmptyState } from '@vex/ui'
import StatusShell from '@/components/StatusShell.vue'
</script>

<template>
  <StatusShell>
    <VxEmptyState code="404" title="Nothing here" text="That page doesn't exist. Every service is on the front page.">
      <template #actions>
        <VxButton to="/" variant="primary">All services</VxButton>
      </template>
    </VxEmptyState>
  </StatusShell>
</template>
