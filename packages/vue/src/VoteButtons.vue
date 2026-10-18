<script setup lang="ts">
import type { Comment, VoteValue } from '@last-comments-widgets/client'
import { ArrowDown, ArrowUp } from 'lucide-vue-next'
import { cn } from './lib/cn'
import { toggleVoteValue } from './types'

const props = defineProps<{
  comment: Comment
  onVote: (commentId: string, value: VoteValue | 'clear') => void
}>()

const base =
  'inline-flex size-7 items-center justify-center rounded-lg border border-transparent text-sm font-medium transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5'
const active = 'border-border bg-muted text-foreground'
const idle = 'text-muted-foreground hover:bg-muted hover:text-foreground'
</script>

<template>
  <div class="flex items-center gap-1" role="group" aria-label="Vote">
    <button
      type="button"
      :class="cn(base, props.comment.viewerVote === 1 ? active : idle)"
      :aria-pressed="props.comment.viewerVote === 1"
      aria-label="Upvote"
      @click="props.onVote(props.comment.id, toggleVoteValue(props.comment.viewerVote, 1))"
    >
      <ArrowUp />
    </button>
    <span class="min-w-6 text-center text-xs font-medium text-muted-foreground" aria-label="Score">{{
      props.comment.score
    }}</span>
    <button
      type="button"
      :class="cn(base, props.comment.viewerVote === -1 ? active : idle)"
      :aria-pressed="props.comment.viewerVote === -1"
      aria-label="Downvote"
      @click="props.onVote(props.comment.id, toggleVoteValue(props.comment.viewerVote, -1))"
    >
      <ArrowDown />
    </button>
  </div>
</template>
