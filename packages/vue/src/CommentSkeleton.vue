<script setup lang="ts">
const props = withDefaults(defineProps<{ count?: number }>(), { count: 3 })

defineOptions({ name: 'CommentSkeleton' })
</script>

<template>
  <div role="status" aria-busy="true" class="grid gap-3">
    <span class="sr-only">Loading comments…</span>
    <div class="grid gap-3" aria-hidden="true">
      <div v-for="index in props.count" :key="index" class="rounded-lg border border-border p-4">
        <div class="flex items-center gap-3">
          <div class="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted"></div>
          <div class="h-4 w-32 lc-skeleton animate-pulse bg-muted"></div>
        </div>
        <div class="mt-3 space-y-2">
          <div class="h-4 w-full lc-skeleton animate-pulse bg-muted"></div>
          <div class="h-4 w-4/5 lc-skeleton animate-pulse bg-muted"></div>
        </div>
        <div class="mt-3 flex gap-2">
          <div class="h-6 w-16 lc-skeleton animate-pulse bg-muted"></div>
          <div class="h-6 w-20 lc-skeleton animate-pulse bg-muted"></div>
        </div>
      </div>
    </div>
  </div>
</template>
