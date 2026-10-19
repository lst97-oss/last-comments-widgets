<script setup lang="ts">
import type { ThreadSort } from '@last-comments-widgets/client'
import { buttonClass } from './lib/button'

defineProps<{ value: ThreadSort; onChange: (value: ThreadSort) => void }>()

defineOptions({ name: 'ThreadSortToggle' })

const OPTIONS: { value: ThreadSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'best', label: 'Best' },
]
</script>

<template>
  <div class="flex items-center gap-1" role="toolbar" aria-label="Sort comments">
    <span class="mr-1 text-xs text-muted-foreground">Sort</span>
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      :class="buttonClass(value === option.value ? 'secondary' : 'ghost', 'sm')"
      :aria-pressed="value === option.value"
      @click="onChange(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
