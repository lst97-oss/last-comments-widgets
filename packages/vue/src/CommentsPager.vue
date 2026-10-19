<script setup lang="ts">
defineOptions({ name: 'CommentsPager' })

const props = defineProps<{
  page: number
  limit: number
  threads: number
  hasMore: boolean
  nextDisabled: boolean
  loading: boolean
}>()

const emit = defineEmits<{ prev: []; next: [] }>()
</script>

<template>
  <!-- `threads > limit`: after Prev to page 1 at the end of the stream hasMore
       is false, yet later pages are loaded and must stay reachable. -->
  <nav
    v-if="props.page > 1 || props.hasMore || props.threads > props.limit"
    aria-label="Comments pagination"
    class="flex flex-wrap items-center justify-between gap-2 text-sm"
  >
    <button
      type="button"
      class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
      :disabled="props.page === 1 || props.loading"
      @click="emit('prev')"
    >
      <span aria-hidden="true">&lsaquo;</span> Previous
    </button>
    <span class="text-muted-foreground">
      Page <span aria-current="page" class="font-medium text-foreground">{{ props.page }}</span>
    </span>
    <button
      type="button"
      class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
      :disabled="props.nextDisabled || props.loading"
      @click="emit('next')"
    >
      Next <span aria-hidden="true">&rsaquo;</span>
    </button>
  </nav>
</template>
