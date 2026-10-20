<script setup lang="ts">
import type { Comment, VoteValue } from '@last-comments-widgets/client'
import { ArrowDown, ArrowUp } from '@lucide/vue'
import { buttonClass } from './lib/button'
import { toggleVoteValue } from './types'

const props = defineProps<{
  comment: Comment
  onVote: (commentId: string, value: VoteValue | 'clear') => void
}>()

defineOptions({ name: 'VoteButtons' })
</script>

<template>
  <div class="lc-vote flex items-center gap-0.5">
    <button
      type="button"
      :class="buttonClass(props.comment.viewerVote === 1 ? 'default' : 'ghost', 'sm')"
      :aria-pressed="props.comment.viewerVote === 1"
      aria-label="Upvote"
      @click="props.onVote(props.comment.id, toggleVoteValue(props.comment.viewerVote, 1))"
    >
      <ArrowUp />
    </button>
    <span class="min-w-6 text-center text-sm text-muted-foreground" aria-live="polite">{{ props.comment.score }}</span>
    <button
      type="button"
      :class="buttonClass(props.comment.viewerVote === -1 ? 'default' : 'ghost', 'sm')"
      :aria-pressed="props.comment.viewerVote === -1"
      aria-label="Downvote"
      @click="props.onVote(props.comment.id, toggleVoteValue(props.comment.viewerVote, -1))"
    >
      <ArrowDown />
    </button>
  </div>
</template>
