<script setup lang="ts">
import {
  canModerate,
  type ErrorInfo,
  type ModerationAction,
  type ThreadNode,
  type ViewerRole,
  type VoteValue,
} from '@last-comments-widgets/client'
import CommentItem, { type CommentFormInput } from './CommentItem.vue'
import type { TurnstileOptions } from './lib/turnstile'
import { type ActionMode } from './types'

defineProps<{
  nodes: ThreadNode[]
  depth?: number
  viewerUserId?: string
  viewerRole?: ViewerRole
  hideVotes?: boolean
  pendingModeration?: Record<string, boolean>
  anonWindowMinutes?: number
  hasEditKey?: boolean
  // Per-row guest edit keys: a guest owns a comment only while this browser
  // still holds the key issued when it was created.
  hasEditKeys?: Record<string, boolean>
  readOnly?: boolean
  actionMode?: ActionMode
  bodyLimit?: number
  math?: boolean
  mermaid?: boolean
  codeHighlight?: boolean
  parentAuthorName?: string
  replyTo?: string | null
  dark?: boolean
  signInHref?: string
  onSignIn?: () => void
  onVote: (commentId: string, value: VoteValue | 'clear') => void
  onReply: (commentId: string) => void
  onEdit: (commentId: string, bodyMarkdown: string) => Promise<ErrorInfo | null>
  onDelete: (commentId: string) => Promise<void>
  onReplySubmit?: (commentId: string, input: CommentFormInput) => Promise<ErrorInfo | null>
  replySiteKey?: string
  turnstileOptions?: TurnstileOptions
  replyGuest?: boolean
  onCloseReply?: () => void
  onModerate?: (commentId: string, action: ModerationAction) => void
  onBlockUser?: (commentId: string, blocked: boolean) => void
}>()

defineOptions({ name: 'CommentList' })
</script>

<template>
  <!-- Depth 0 is the thread grid itself: a wrapper would take the guides' gap. -->
  <div :class="(depth ?? 0) === 0 ? 'contents' : 'grid grid-cols-1 gap-4'">
    <CommentItem
      v-for="node in nodes"
      :key="node.comment.id"
      :node="node"
      :depth="depth ?? 0"
      :viewer-user-id="viewerUserId"
      :viewer-role="viewerRole"
      :hide-votes="hideVotes || (canModerate(viewerRole) && node.comment.status !== 'visible')"
      :pending-moderation="pendingModeration"
      :anon-window-minutes="anonWindowMinutes"
      :has-edit-key="hasEditKeys?.[node.comment.id] ?? hasEditKey ?? false"
      :read-only="readOnly"
      :action-mode="actionMode"
      :body-limit="bodyLimit"
      :math="math"
      :mermaid="mermaid"
      :code-highlight="codeHighlight"
      :parent-author-name="parentAuthorName"
      :reply-to="replyTo"
      :dark="dark"
      :sign-in-href="signInHref"
      :on-sign-in="onSignIn"
      :on-vote="onVote"
      :on-reply="onReply"
      :on-edit="onEdit"
      :on-delete="onDelete"
      :on-reply-submit="onReplySubmit"
      :reply-site-key="replySiteKey"
      :turnstile-options="turnstileOptions"
      :reply-guest="replyGuest"
      :on-close-reply="onCloseReply"
      :on-moderate="onModerate"
      :on-block-user="onBlockUser"
    >
      <template v-if="$slots.signIn" #signIn>
        <slot name="signIn" />
      </template>
    </CommentItem>
  </div>
</template>
