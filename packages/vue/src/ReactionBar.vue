<script setup lang="ts">
import type { ReactionSummary } from '@last-comments-widgets/client'
import { SmilePlus } from '@lucide/vue'
import { computed, ref } from 'vue'
import { buttonClass } from './lib/button'
import type { ReactionMode } from './types'

// One row of reaction chips. `picker` (a comment) shows the reactions it has and a control that opens the
// whole allowed set; without it (the page bar) the row is the allowed set.
const props = defineProps<{
  label: string
  mode: ReactionMode
  allowed: string[]
  reactions: ReactionSummary[]
  pending: boolean
  picker?: boolean
  onReact: (emoji: string, viewerReacted: boolean) => void
}>()

defineOptions({ name: 'ReactionBar' })

const picking = ref(false)

function reactionFor(emoji: string): ReactionSummary {
  return props.reactions.find((reaction) => reaction.emoji === emoji) ?? { emoji, count: 0, viewerReacted: false }
}

const shown = computed<string[]>(() => {
  if (props.picker && !(picking.value && props.mode === 'interactive')) {
    return props.reactions.map((reaction) => reaction.emoji)
  }
  return props.allowed
})
</script>

<template>
  <div
    v-if="props.mode !== 'off' && (shown.length > 0 || (props.picker && props.mode === 'interactive'))"
    class="lc-reactions flex flex-wrap items-center gap-1"
    role="group"
    :aria-label="props.label"
  >
    <button
      v-for="emoji in shown"
      :key="emoji"
      type="button"
      :class="[buttonClass('ghost', 'sm'), 'lc-reaction']"
      :aria-pressed="reactionFor(emoji).viewerReacted"
      :aria-label="`${emoji}, ${reactionFor(emoji).count} ${reactionFor(emoji).count === 1 ? 'reaction' : 'reactions'}`"
      :disabled="props.pending || props.mode === 'counts'"
      @click="props.onReact(emoji, reactionFor(emoji).viewerReacted)"
    >
      <span aria-hidden="true">{{ emoji }}</span>
      <span v-if="reactionFor(emoji).count > 0" class="lc-reaction-count text-xs tabular-nums">{{
        reactionFor(emoji).count
      }}</span>
    </button>
    <button
      v-if="props.picker && props.mode === 'interactive'"
      type="button"
      :class="[buttonClass('ghost', 'icon-xs'), 'lc-action lc-reaction-add']"
      :aria-expanded="picking"
      :aria-label="picking ? 'Close reactions' : 'Add reaction'"
      :disabled="props.pending"
      @click="picking = !picking"
    >
      <SmilePlus aria-hidden="true" />
    </button>
  </div>
</template>
