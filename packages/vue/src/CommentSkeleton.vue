<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ count?: number; readOnly?: boolean }>(), { count: 3, readOnly: false })

defineOptions({ name: 'CommentSkeleton' })

// shortcut: widths cycle so rows read like real comments without a sixth prop.
const NAME_WIDTHS = ['w-24', 'w-32', 'w-20']
const BODY_WIDTHS = ['w-3/4', 'w-2/3', 'w-4/5']
const rows = computed(() =>
  Array.from({ length: props.count }, (_, index) => ({
    key: index,
    name: NAME_WIDTHS[index % NAME_WIDTHS.length] ?? 'w-24',
    body: BODY_WIDTHS[index % BODY_WIDTHS.length] ?? 'w-3/4',
  })),
)
</script>

<template>
  <div role="status" aria-busy="true">
    <span class="sr-only">Loading comments…</span>
    <div class="grid gap-3" aria-hidden="true">
      <div v-for="row in rows" :key="row.key" class="lc-comment-skeleton" data-lc-skeleton>
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div class="size-6 rounded-md lc-skeleton animate-pulse bg-muted"></div>
          <div class="size-6 rounded-full lc-skeleton animate-pulse bg-muted"></div>
          <div class="h-4 lc-skeleton animate-pulse bg-muted" :class="row.name"></div>
          <div class="h-3 w-10 lc-skeleton animate-pulse bg-muted"></div>
          <div v-if="props.readOnly" class="ml-auto h-4 w-6 lc-skeleton animate-pulse bg-muted"></div>
          <template v-else>
            <div class="ml-auto size-6 rounded-md lc-skeleton animate-pulse bg-muted"></div>
            <div class="h-6 w-20 rounded-full lc-skeleton animate-pulse bg-muted"></div>
          </template>
        </div>
        <div class="my-3 space-y-2">
          <div class="h-4 w-full lc-skeleton animate-pulse bg-muted"></div>
          <div class="h-4 lc-skeleton animate-pulse bg-muted" :class="row.body"></div>
        </div>
        <div v-if="!props.readOnly" class="h-7 w-16 rounded-md lc-skeleton animate-pulse bg-muted"></div>
      </div>
    </div>
  </div>
</template>
