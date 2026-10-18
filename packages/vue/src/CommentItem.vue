<script setup lang="ts">
import {
  type Comment,
  DEFAULT_EDIT_WINDOW_MINUTES,
  isEditWindowOpen,
  type ModerationAction,
  renderMarkdown,
  safeUrl,
  type ThreadNode,
  type ViewerRole,
  type VoteValue,
} from '@last-comments-widgets/client'
import { computed, ref } from 'vue'
import CommentForm from './CommentForm.vue'
import CommentList from './CommentList.vue'
import VoteButtons from './VoteButtons.vue'

const props = defineProps<{
  node: ThreadNode
  depth: number
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

defineOptions({ name: 'CommentItem' })

const editing = ref(false)
const busy = ref(false)

const rendered = computed(() => renderMarkdown(props.node.comment.bodyMarkdown))
const avatarUrl = computed(() => safeUrl(props.node.comment.avatarUrl))
const moderationPending = computed(() => props.pendingModeration?.[props.node.comment.id] ?? false)
const canReplyHere = computed(() => !(props.viewerRole && props.node.comment.status !== 'visible'))
const own = computed(
  () =>
    props.viewerUserId != null && props.node.comment.userId != null && props.viewerUserId === props.node.comment.userId,
)
const canEdit = computed(
  () =>
    own.value &&
    isEditWindowOpen(props.node.comment.createdAt, Date.now(), props.editWindowMinutes ?? DEFAULT_EDIT_WINDOW_MINUTES),
)

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

// The editor owns the edit error: it renders the block and keeps the draft, so
// this only closes on success and the failure never becomes two surfaces.
function submitEdit(input: { bodyMarkdown: string }) {
  return props.onEdit(props.node.comment.id, input.bodyMarkdown)
}

async function remove() {
  if (busy.value) return
  if (typeof window !== 'undefined' && !window.confirm('Delete this comment?')) return
  busy.value = true
  try {
    // The widget reports delete failures above the list: they are not local to
    // the row once the row is gone from the cache.
    await props.onDelete(props.node.comment.id)
  } finally {
    busy.value = false
  }
}

function removeModerated() {
  if (typeof window !== 'undefined' && !window.confirm('Delete this comment?')) return
  props.onModerate?.(props.node.comment.id, 'delete')
}
</script>

<template>
  <article class="lc-comment min-w-0" :class="props.depth > 0 ? 'lc-reply ml-6 border-l border-border pl-4' : ''">
    <div class="flex flex-wrap items-center gap-2">
      <span
        class="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground"
      >
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          :alt="props.node.comment.authorName"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          class="size-full object-cover"
        />
        <span v-else>{{ initials(props.node.comment.authorName) }}</span>
      </span>
      <span class="min-w-0 font-medium break-words">{{ props.node.comment.authorName }}</span>
      <time :dateTime="props.node.comment.createdAt" class="text-xs text-muted-foreground">{{
        formatDate(props.node.comment.createdAt)
      }}</time>
      <span v-if="props.node.comment.editedAt" class="text-xs text-muted-foreground">edited</span>
      <span v-if="props.node.comment.pinnedAt" class="text-xs text-muted-foreground">pinned</span>
      <span
        v-if="props.node.comment.status === 'hidden'"
        class="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
      >
        hidden
      </span>
      <span
        v-if="props.node.comment.status === 'deleted'"
        class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
      >
        deleted
      </span>
      <span v-if="!props.hideVotes" class="ml-auto">
        <span v-if="props.readOnly" class="text-sm text-muted-foreground">{{ props.node.comment.score }}</span>
        <VoteButtons v-else :comment="props.node.comment as Comment" :on-vote="props.onVote" />
      </span>
    </div>
    <div v-if="editing && !props.readOnly" class="my-3">
      <CommentForm
        :guest="false"
        :parent-id="null"
        :initial-body="props.node.comment.bodyMarkdown"
        submit-label="Save"
        error-title="Your edit wasn't saved"
        :on-submit="submitEdit"
        :on-cancel-reply="() => (editing = false)"
        :sign-in-href="props.signInHref"
        :on-sign-in="props.onSignIn"
        @submitted="editing = false"
      />
    </div>
    <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown strips raw HTML and restricts link protocols. -->
    <div v-else class="lc-markdown my-3 font-sans text-sm [overflow-wrap:anywhere]" v-html="rendered" />
    <div v-if="!props.readOnly" class="flex flex-wrap items-center gap-3 text-sm">
      <button
        v-if="canReplyHere"
        type="button"
        class="font-medium text-primary underline-offset-4 hover:underline"
        @click="props.onReply(props.node.comment.id)"
      >
        Reply
      </button>
      <button
        v-if="canEdit && !editing"
        type="button"
        class="text-muted-foreground underline-offset-4 hover:underline"
        @click="editing = true"
      >
        Edit
      </button>
      <button
        v-if="own && !props.viewerRole && !editing"
        type="button"
        class="text-muted-foreground underline-offset-4 hover:underline"
        :disabled="busy"
        @click="remove"
      >
        Delete
      </button>
    </div>
    <div v-if="props.viewerRole && !props.readOnly" class="mt-2 flex flex-wrap items-center gap-3 text-sm">
      <button
        v-if="props.node.comment.status === 'visible'"
        type="button"
        class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
        :disabled="moderationPending"
        @click="props.onModerate?.(props.node.comment.id, 'hide')"
      >
        Hide
      </button>
      <button
        v-if="props.node.comment.status !== 'visible'"
        type="button"
        class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
        :disabled="moderationPending"
        @click="props.onModerate?.(props.node.comment.id, 'restore')"
      >
        Restore
      </button>
      <button
        v-if="props.node.comment.status === 'visible' && props.node.comment.pinnedAt"
        type="button"
        class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
        :disabled="moderationPending"
        @click="props.onModerate?.(props.node.comment.id, 'unpin')"
      >
        Unpin
      </button>
      <button
        v-if="props.node.comment.status === 'visible' && !props.node.comment.pinnedAt"
        type="button"
        class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
        :disabled="moderationPending"
        @click="props.onModerate?.(props.node.comment.id, 'pin')"
      >
        Pin
      </button>
      <button
        v-if="props.node.comment.status !== 'deleted'"
        type="button"
        class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
        :disabled="moderationPending"
        @click="removeModerated"
      >
        Delete
      </button>
      <button
        v-if="props.node.comment.userId"
        type="button"
        class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
        :disabled="moderationPending"
        @click="props.onBlockUser?.(props.node.comment.id, !props.node.comment.userBlocked)"
      >
        {{ props.node.comment.userBlocked ? 'Unblock user' : 'Block user' }}
      </button>
    </div>
    <div v-if="props.node.children.length > 0" class="mt-3 grid gap-4">
      <CommentList
        :nodes="props.node.children as ThreadNode[]"
        :depth="props.depth + 1"
        :viewer-user-id="props.viewerUserId"
        :viewer-role="props.viewerRole"
        :hide-votes="props.hideVotes"
        :pending-moderation="props.pendingModeration"
        :edit-window-minutes="props.editWindowMinutes"
        :read-only="props.readOnly"
        :sign-in-href="props.signInHref"
        :on-sign-in="props.onSignIn"
        :on-vote="props.onVote"
        :on-reply="props.onReply"
        :on-edit="props.onEdit"
        :on-delete="props.onDelete"
        :on-moderate="props.onModerate"
        :on-block-user="props.onBlockUser"
      />
    </div>
  </article>
</template>
