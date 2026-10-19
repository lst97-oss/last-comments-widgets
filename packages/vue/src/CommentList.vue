<script setup lang="ts">
import {
  canModerate,
  type ModerationAction,
  type ThreadNode,
  type ViewerRole,
  type VoteValue,
} from '@last-comments-widgets/client'
import CommentItem from './CommentItem.vue'

defineProps<{
  nodes: ThreadNode[]
  depth?: number
  viewerUserId?: string
  viewerRole?: ViewerRole
  hideVotes?: boolean
  pendingModeration?: Record<string, boolean>
  editWindowMinutes?: number
  readOnly?: boolean
  signInHref?: string
  onSignIn?: () => void
  onVote: (commentId: string, value: VoteValue | 'clear') => void
  onReply: (commentId: string) => void
  onEdit: (commentId: string, bodyMarkdown: string) => Promise<void>
  onDelete: (commentId: string) => Promise<void>
  onModerate?: (commentId: string, action: ModerationAction) => void
  onBlockUser?: (commentId: string, blocked: boolean) => void
}>()

defineOptions({ name: 'CommentList' })
</script>

<template>
  <div class="grid gap-4">
    <CommentItem
      v-for="node in nodes"
      :key="node.comment.id"
      :node="node"
      :depth="depth ?? 0"
      :viewer-user-id="viewerUserId"
      :viewer-role="viewerRole"
      :hide-votes="hideVotes || (canModerate(viewerRole) && node.comment.status !== 'visible')"
      :pending-moderation="pendingModeration"
      :edit-window-minutes="editWindowMinutes"
      :read-only="readOnly"
      :sign-in-href="signInHref"
      :on-sign-in="onSignIn"
      :on-vote="onVote"
      :on-reply="onReply"
      :on-edit="onEdit"
      :on-delete="onDelete"
      :on-moderate="onModerate"
      :on-block-user="onBlockUser"
    />
  </div>
</template>
