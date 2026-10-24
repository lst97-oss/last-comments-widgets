<script setup lang="ts">
import {
  accountBadge,
  DEFAULT_BODY_LIMIT,
  type ErrorInfo,
  foldReplySummary,
  formatRelativeTime,
  type ModerationAction,
  renderMarkdown,
  type ThreadNode,
  type ViewerRole,
  type VoteValue,
} from '@last-comments-widgets/client'
import { AccordionContent, AccordionHeader, AccordionItem, AccordionRoot, AccordionTrigger } from 'reka-ui'
import { Ban, ChevronDown, ChevronUp, Minus, Plus, Reply } from '@lucide/vue'
import { computed, ref, useTemplateRef } from 'vue'
import LcAvatar from './Avatar.vue'
import CommentActionsMenu from './CommentActionsMenu.vue'
import CommentForm from './CommentForm.vue'
import CommentList from './CommentList.vue'
import ReplyAvatarStack from './ReplyAvatarStack.vue'
import VoteButtons from './VoteButtons.vue'
import { badgeClass } from './lib/badge'
import { buttonClass } from './lib/button'
import { ITEM_INITIAL, type ItemAction, type ItemState, itemReducer } from './lib/itemState'
import type { TurnstileOptions } from './lib/turnstile'
import { useMarkdownEnhance } from './lib/useMarkdownEnhance'
import { type ActionMode, canEditComment } from './types'

export type CommentFormInput = {
  authorName: string
  bodyMarkdown: string
  verificationToken?: string
}

const props = defineProps<{
  node: ThreadNode
  depth: number
  viewerUserId?: string
  viewerRole?: ViewerRole
  hideVotes?: boolean
  pendingModeration?: Record<string, boolean>
  // Window for guest-authored comments; signed-in owners have no window.
  anonWindowMinutes?: number
  // A guest owns the comment only while this browser still holds its edit key.
  hasEditKey?: boolean
  // The same map for the nested replies.
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

defineOptions({ name: 'CommentItem' })

const comment = computed(() => props.node.comment)
const state = ref<ItemState>({ ...ITEM_INITIAL })
const actionMode = computed(() => props.actionMode ?? 'icon-text')
const bodyLimit = computed(() => props.bodyLimit ?? DEFAULT_BODY_LIMIT)
const math = computed(() => props.math ?? false)
const mermaid = computed(() => props.mermaid ?? false)
const codeHighlight = computed(() => props.codeHighlight ?? true)

function dispatch(action: ItemAction) {
  state.value = itemReducer(state.value, action)
}

const rendered = computed(() => renderMarkdown(comment.value.bodyMarkdown, { math: math.value }))
const bodyEl = useTemplateRef<HTMLElement>('bodyEl')
useMarkdownEnhance(bodyEl, rendered, { math: () => math.value, mermaid: () => mermaid.value })
const moderationPending = computed(() => props.pendingModeration?.[comment.value.id] ?? false)
const canReplyHere = computed(() => !(props.viewerRole && comment.value.status !== 'visible'))
const isOwn = computed(
  () => props.viewerUserId != null && comment.value.userId != null && props.viewerUserId === comment.value.userId,
)
const canEdit = computed(() =>
  canEditComment(comment.value, props.viewerUserId, {
    anonWindowMinutes: props.anonWindowMinutes,
    hasEditKey: props.hasEditKey,
  }),
)
const formattedDate = computed(() => formatRelativeTime(comment.value.createdAt))
const createdTitle = computed(() => new Date(comment.value.createdAt).toLocaleString())
const editedTitle = computed(() => (comment.value.editedAt ? new Date(comment.value.editedAt).toLocaleString() : ''))

// The reply group summary counts every status, so a moderator sees the same
// total a guest sees plus the pinned/hidden/deleted breakdown.
const summary = computed(() => foldReplySummary(props.node.children))
const repliesLabel = computed(() => `${summary.value.count} ${summary.value.count === 1 ? 'reply' : 'replies'}`)
const replyStateLabel = computed(() => {
  if (!props.viewerRole || props.node.children.length === 0) return ''
  return [
    summary.value.pinned > 0 ? `${summary.value.pinned} pinned` : null,
    summary.value.hidden > 0 ? `${summary.value.hidden} hidden` : null,
    summary.value.deleted > 0 ? `${summary.value.deleted} deleted` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')
})
// Negative net score collapses in every sort mode; 0 stays expanded.
const collapsed = computed(() => state.value.collapsedOverride ?? comment.value.score < 0)
const excerpt = computed(() => comment.value.bodyMarkdown.replace(/\s+/g, ' ').trim())
// Removed comments read as placeholders in the normal view; moderators keep
// the body so they can still judge a restore.
const placeholder = computed(() => !props.viewerRole && comment.value.status !== 'visible')

function toggleCollapse() {
  dispatch({ type: 'collapse/toggle', value: !collapsed.value })
}

function openEdit() {
  props.onCloseReply?.()
  dispatch({ type: 'edit/open' })
}

function cancelEdit() {
  dispatch({ type: 'edit/close' })
}

async function submitEdit(input: CommentFormInput) {
  dispatch({ type: 'saving/set', saving: true })
  try {
    const error = await props.onEdit(comment.value.id, input.bodyMarkdown)
    dispatch({ type: 'edit/settle', error })
    return error === null
  } finally {
    dispatch({ type: 'saving/set', saving: false })
  }
}

async function submitReply(input: CommentFormInput) {
  dispatch({ type: 'reply/submit' })
  try {
    const error = (await props.onReplySubmit?.(comment.value.id, input)) ?? null
    dispatch({ type: 'reply/settle', error })
    return error === null
  } finally {
    dispatch({ type: 'replying/set', replying: false })
  }
}

function cancelReply() {
  props.onCloseReply?.()
  dispatch({ type: 'reply/settle', error: null })
}

function toggleReply() {
  dispatch({ type: 'edit/close' })
  if (props.replyTo === comment.value.id) props.onCloseReply?.()
  else props.onReply(comment.value.id)
}
</script>

<template>
  <article
    class="lc-comment"
    :class="props.depth > 0 ? 'lc-reply' : ''"
    :data-depth="props.depth"
    :data-comment-id="comment.id"
    :data-comment-depth="props.depth"
    :data-lc-placeholder="placeholder ? (comment.status === 'deleted' ? 'deleted' : 'under-review') : undefined"
  >
    <template v-if="placeholder">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span v-if="comment.status === 'deleted'" class="text-sm text-muted-foreground">[deleted]</span>
        <template v-else>
          <LcAvatar :name="comment.authorName" :src="comment.avatarUrl" />
          <span class="min-w-0 truncate font-medium">{{ comment.authorName }}</span>
        </template>
        <time :dateTime="comment.createdAt" :title="createdTitle" class="text-xs text-muted-foreground">
          {{ formattedDate }}
        </time>
      </div>
      <p
        v-if="props.depth > 0 && props.parentAuthorName && comment.status !== 'deleted'"
        class="mt-1 text-xs text-muted-foreground"
      >
        Replying to <span class="font-medium text-foreground">@{{ props.parentAuthorName }}</span>
      </p>
      <p class="my-3 text-sm text-muted-foreground">
        {{ comment.status === 'deleted' ? '[deleted]' : 'This comment is under review.' }}
      </p>
    </template>
    <template v-else>
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          :class="[buttonClass('ghost', 'icon-xs'), 'lc-action lc-collapse']"
          :aria-expanded="!collapsed"
          :aria-label="`${collapsed ? 'Expand' : 'Collapse'} comment by ${comment.authorName}`"
          @click="toggleCollapse"
        >
          <Plus v-if="collapsed" aria-hidden="true" />
          <Minus v-else aria-hidden="true" />
        </button>
        <LcAvatar :name="comment.authorName" :src="comment.avatarUrl" />
        <span class="min-w-0 truncate font-medium" :class="accountBadge(comment) === 'admin' ? 'lc-author-admin' : ''">
          {{ comment.authorName }}
        </span>
        <span v-if="accountBadge(comment) === 'admin'" :class="[badgeClass('default'), 'lc-admin-badge']">Admin</span>
        <span v-if="accountBadge(comment) === 'member'" :class="[badgeClass('default'), 'lc-member-badge']"
          >Member</span
        >
        <!-- Moderation rows carry the block state; the public wire shape omits it. -->
        <span v-if="comment.userBlocked" :class="[badgeClass('outline'), 'lc-blocked-badge']">
          <Ban aria-hidden="true" />
          blocked
        </span>
        <!-- Ages are computed at render, not on a timer: they refresh with the next render. -->
        <time :dateTime="comment.createdAt" :title="createdTitle" class="text-xs text-muted-foreground">
          {{ formattedDate }}
        </time>
        <span v-if="comment.editedAt" :title="editedTitle" class="text-xs text-muted-foreground">edited</span>
        <span v-if="comment.pinnedAt" class="text-xs text-muted-foreground">pinned</span>
        <span v-if="comment.status === 'hidden'" :class="badgeClass('destructive')">hidden</span>
        <span v-if="comment.status === 'deleted'" :class="badgeClass('secondary')">deleted</span>
        <CommentActionsMenu
          v-if="!props.readOnly"
          :comment="comment"
          :can-edit="canEdit"
          :editing="state.editing"
          :is-own="isOwn"
          :viewer-role="props.viewerRole"
          :moderation-pending="moderationPending"
          @edit="openEdit"
          @delete="props.onDelete(comment.id)"
          @moderate="(action) => props.onModerate?.(comment.id, action)"
          @block-user="(blocked) => props.onBlockUser?.(comment.id, blocked)"
        />
        <span v-if="!props.hideVotes" class="ml-auto">
          <span v-if="props.readOnly" class="text-sm text-muted-foreground">{{ comment.score }}</span>
          <VoteButtons v-else :comment="comment" :on-vote="props.onVote" />
        </span>
      </div>
      <div
        v-if="collapsed"
        class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        data-lc-collapsed
      >
        <template v-if="props.node.children.length > 0">
          <ReplyAvatarStack :nodes="props.node.children" />
          <span class="truncate">{{ repliesLabel }}</span>
          <span v-if="replyStateLabel" class="hidden truncate sm:inline">{{ replyStateLabel }}</span>
        </template>
        <template v-else>
          <span>comment hidden</span>
          <span class="truncate">{{ excerpt }}</span>
        </template>
      </div>
      <template v-else>
        <p v-if="props.depth > 0 && props.parentAuthorName" class="mt-1 text-xs text-muted-foreground">
          Replying to <span class="font-medium text-foreground">@{{ props.parentAuthorName }}</span>
        </p>
        <div v-if="state.editing && !props.readOnly" class="my-3">
          <CommentForm
            :guest="false"
            :parent-id="null"
            :pending="state.saving"
            :error="state.editError"
            :initial-body="comment.bodyMarkdown"
            submit-label="Save"
            error-title="Your edit wasn't saved"
            :body-limit="bodyLimit"
            :math="math"
            :mermaid="mermaid"
            :code-highlight="codeHighlight"
            :on-submit="submitEdit"
            :on-cancel-reply="cancelEdit"
            :sign-in-href="props.signInHref"
            :on-sign-in="props.onSignIn"
          />
        </div>
        <div v-else-if="!props.readOnly && props.replyTo === comment.id && props.onReplySubmit" class="my-3">
          <CommentForm
            :site-key="props.replySiteKey"
            :turnstile-options="props.turnstileOptions"
            :guest="props.replyGuest ?? true"
            :dark="props.dark"
            :parent-id="comment.id"
            :pending="state.replying"
            :error="state.replyError"
            :body-limit="bodyLimit"
            :math="math"
            :mermaid="mermaid"
            :code-highlight="codeHighlight"
            :on-submit="submitReply"
            :on-cancel-reply="cancelReply"
            :sign-in-href="props.signInHref"
            :on-sign-in="props.onSignIn"
          >
            <template v-if="$slots.signIn" #signIn>
              <slot name="signIn" />
            </template>
          </CommentForm>
        </div>
        <!-- eslint-disable vue/no-v-html -- renderMarkdown strips raw HTML and restricts link protocols. -->
        <div
          v-else
          ref="bodyEl"
          class="lc-markdown my-3 font-sans text-sm [overflow-wrap:anywhere]"
          v-html="rendered"
        />
        <!-- eslint-enable vue/no-v-html -->
        <div v-if="!props.readOnly" class="flex flex-wrap items-center gap-1 text-sm">
          <button
            v-if="canReplyHere"
            type="button"
            :class="[buttonClass('ghost', actionMode === 'icon' ? 'icon-xs' : 'xs'), 'lc-action']"
            :aria-label="actionMode === 'icon' ? 'Reply' : undefined"
            :aria-expanded="props.replyTo === comment.id"
            @click="toggleReply"
          >
            <Reply v-if="actionMode !== 'text'" aria-hidden="true" />
            <span :class="actionMode === 'icon' ? 'sr-only' : undefined">Reply</span>
          </button>
        </div>
      </template>
    </template>
    <AccordionRoot
      v-if="props.node.children.length > 0 && (placeholder || !collapsed)"
      type="single"
      collapsible
      :default-value="comment.id"
      class="mt-2 flex w-full flex-col"
      data-lc-replies
    >
      <AccordionItem :value="comment.id" class="border-0">
        <div style="padding-inline-start: 16px">
          <AccordionHeader class="flex">
            <AccordionTrigger
              class="lc-replies-trigger group/accordion-trigger relative flex flex-1 items-center justify-between rounded-lg border border-transparent py-1 text-left text-sm font-medium transition-all outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground"
            >
              <span class="flex min-w-0 items-center gap-2 group-aria-expanded/accordion-trigger:hidden">
                <ReplyAvatarStack :nodes="props.node.children" />
                <span class="truncate text-xs">{{ repliesLabel }}</span>
                <span v-if="replyStateLabel" class="hidden truncate text-xs sm:inline">{{ replyStateLabel }}</span>
              </span>
              <span class="hidden text-xs group-aria-expanded/accordion-trigger:inline"> Hide {{ repliesLabel }} </span>
              <ChevronDown
                data-slot="accordion-trigger-icon"
                aria-hidden="true"
                class="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden"
              />
              <ChevronUp
                data-slot="accordion-trigger-icon"
                aria-hidden="true"
                class="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline"
              />
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionContent class="pt-1" data-slot="accordion-content">
            <CommentList
              :nodes="props.node.children as ThreadNode[]"
              :depth="props.depth + 1"
              :viewer-user-id="props.viewerUserId"
              :viewer-role="props.viewerRole"
              :hide-votes="props.hideVotes"
              :pending-moderation="props.pendingModeration"
              :anon-window-minutes="props.anonWindowMinutes"
              :has-edit-key="props.hasEditKey"
              :has-edit-keys="props.hasEditKeys"
              :read-only="props.readOnly"
              :action-mode="actionMode"
              :body-limit="bodyLimit"
              :math="math"
              :mermaid="mermaid"
              :code-highlight="codeHighlight"
              :parent-author-name="comment.authorName"
              :reply-to="props.replyTo"
              :dark="props.dark"
              :sign-in-href="props.signInHref"
              :on-sign-in="props.onSignIn"
              :on-vote="props.onVote"
              :on-reply="props.onReply"
              :on-edit="props.onEdit"
              :on-delete="props.onDelete"
              :on-reply-submit="props.onReplySubmit"
              :reply-site-key="props.replySiteKey"
              :turnstile-options="props.turnstileOptions"
              :reply-guest="props.replyGuest"
              :on-close-reply="props.onCloseReply"
              :on-moderate="props.onModerate"
              :on-block-user="props.onBlockUser"
            >
              <template v-if="$slots.signIn" #signIn>
                <slot name="signIn" />
              </template>
            </CommentList>
          </AccordionContent>
        </div>
      </AccordionItem>
    </AccordionRoot>
  </article>
</template>
