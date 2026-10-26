<script setup lang="ts">
import type { Comment, ModerationAction } from '@last-comments-widgets/client'
import { Ban, CircleCheck, EllipsisVertical, Eye, EyeOff, Pencil, Pin, PinOff, Trash2 } from '@lucide/vue'
import { PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed } from 'vue'
import { buttonClass } from './lib/button'
import { useWidgetRoot } from './lib/widgetRoot'

const props = defineProps<{
  comment: Comment
  canEdit: boolean
  editing: boolean
  canDelete: boolean
  viewerRole?: string
  moderationPending: boolean
  onEdit: () => void
  onDelete: () => void
  onModerate?: (action: ModerationAction) => void
  onBlockUser?: (blocked: boolean) => void
}>()

defineOptions({ name: 'CommentActionsMenu' })

// Delete is soft (status 'deleted', restorable by a moderator), so the menu
// entry acts immediately instead of asking for confirmation.
const showEdit = computed(() => props.canEdit && !props.editing)
const showOwnDelete = computed(() => props.canDelete && !props.viewerRole && !props.editing)
const showModeration = computed(() => Boolean(props.viewerRole))

const MENU_ITEM_CLASS =
  "lc-action flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
// Destructive entries (delete) take the alarm colour instead of the action tone.
const MENU_ITEM_DESTRUCTIVE_CLASS = `${MENU_ITEM_CLASS} lc-action-destructive`

const CONTENT_CLASS =
  'z-50 flex w-auto min-w-36 flex-col rounded-lg bg-popover p-1 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none lc-actions-menu'

const root = useWidgetRoot()
</script>

<template>
  <PopoverRoot v-if="showEdit || showOwnDelete || showModeration">
    <PopoverTrigger as-child>
      <button
        type="button"
        :class="buttonClass('ghost', 'icon-xs')"
        aria-label="More actions"
        class="lc-action lc-actions-trigger"
      >
        <EllipsisVertical aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverPortal :to="root ?? undefined">
      <PopoverContent :class="CONTENT_CLASS" align="end" :side-offset="4">
        <PopoverClose v-if="showEdit" :class="MENU_ITEM_CLASS" @click="props.onEdit">
          <Pencil aria-hidden="true" />
          Edit
        </PopoverClose>
        <PopoverClose v-if="showOwnDelete" :class="MENU_ITEM_DESTRUCTIVE_CLASS" @click="props.onDelete">
          <Trash2 aria-hidden="true" />
          Delete
        </PopoverClose>
        <template v-if="showModeration">
          <PopoverClose
            v-if="props.comment.status === 'visible'"
            :class="MENU_ITEM_CLASS"
            :disabled="props.moderationPending"
            @click="props.onModerate?.('hide')"
          >
            <EyeOff aria-hidden="true" />
            Hide
          </PopoverClose>
          <PopoverClose
            v-else
            :class="MENU_ITEM_CLASS"
            :disabled="props.moderationPending"
            @click="props.onModerate?.('restore')"
          >
            <Eye aria-hidden="true" />
            Restore
          </PopoverClose>
          <PopoverClose
            v-if="props.comment.status === 'visible'"
            :class="MENU_ITEM_CLASS"
            :disabled="props.moderationPending"
            @click="props.onModerate?.(props.comment.pinnedAt ? 'unpin' : 'pin')"
          >
            <PinOff v-if="props.comment.pinnedAt" aria-hidden="true" />
            <Pin v-else aria-hidden="true" />
            {{ props.comment.pinnedAt ? 'Unpin' : 'Pin' }}
          </PopoverClose>
          <PopoverClose
            v-if="props.comment.status !== 'deleted'"
            :class="MENU_ITEM_DESTRUCTIVE_CLASS"
            :disabled="props.moderationPending"
            @click="props.onModerate?.('delete')"
          >
            <Trash2 aria-hidden="true" />
            Delete
          </PopoverClose>
          <PopoverClose
            v-if="props.comment.userId"
            :class="MENU_ITEM_CLASS"
            :disabled="props.moderationPending"
            @click="props.onBlockUser?.(!props.comment.userBlocked)"
          >
            <CircleCheck v-if="props.comment.userBlocked" aria-hidden="true" />
            <Ban v-else aria-hidden="true" />
            {{ props.comment.userBlocked ? 'Unblock user' : 'Block user' }}
          </PopoverClose>
        </template>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
