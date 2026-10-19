import { Component, computed, input, linkedSignal, output } from '@angular/core'
import {
  type Comment,
  DEFAULT_EDIT_WINDOW_MINUTES,
  type ErrorInfo,
  type ModerationAction,
  renderMarkdown,
  safeUrl,
  type ThreadNode,
  type ViewerRole,
} from '@last-comments-widgets/client'
import { type CommentSubmit, LcCommentFormComponent } from './comment-form.component'
import { canEditComment } from './types'
import { LcVoteButtonsComponent, type VoteEvent } from './vote-buttons.component'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

// Flat comment row with nested replies (ml-6 border-l indent per level).
// Body HTML comes only from the shared renderMarkdown (raw HTML stripped).
@Component({
  selector: 'lc-comment-item',
  standalone: true,
  imports: [LcVoteButtonsComponent, LcCommentFormComponent],
  template: `
    @let c = comment().comment;
    <!-- Static class and [class] merge; lc-comment is never replaced. -->
    <article class="lc-comment" [class]="depth() > 0 ? 'lc-reply ml-6 border-l border-border' : ''">
      <div class="flex flex-wrap items-center gap-2">
        @if (avatarUrl(); as avatarSrc) {
          <img
            [src]="avatarSrc"
            [alt]="c.authorName"
            referrerpolicy="no-referrer"
            loading="lazy"
            decoding="async"
            class="lc-avatar h-8 w-8 rounded-full object-cover"
          />
        } @else {
          <span
            class="lc-avatar flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
            >{{ initialsLabel() }}</span
          >
        }
        <span class="min-w-0 font-medium break-words">{{ c.authorName }}</span>
        <time [attr.dateTime]="c.createdAt" class="text-xs text-muted-foreground">{{ dateLabel() }}</time>
        @if (c.editedAt) {
          <span class="text-xs text-muted-foreground">edited</span>
        }
        @if (c.pinnedAt) {
          <span class="text-xs text-muted-foreground">pinned</span>
        }
        @if (c.status === 'hidden') {
          <span class="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">hidden</span>
        }
        @if (c.status === 'deleted') {
          <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">deleted</span>
        }
        @if (!votesHidden()) {
          <span class="ml-auto">
            @if (readOnly()) {
              <span class="text-sm text-muted-foreground">{{ c.score }}</span>
            } @else {
              <lc-vote-buttons [comment]="comment().comment" (vote)="vote.emit($event)" />
            }
          </span>
        }
      </div>
      @if (editing() && !readOnly()) {
        <div class="my-3">
          <lc-comment-form
            [guest]="false"
            [initialBody]="c.bodyMarkdown"
            submitLabel="Save"
            [submitting]="editSaving()"
            [showCancel]="true"
            (submitted)="onEditSubmit($event)"
            (signIn)="signIn.emit()"
            (cancelReply)="editing.set(false)"
          />
        </div>
      } @else {
        <div class="lc-markdown my-3 font-sans text-sm" [innerHTML]="bodyHtml()"></div>
      }
      @if (!readOnly()) {
        <div class="flex flex-wrap items-center gap-3 text-sm">
          @if (canReplyHere()) {
            <button
              type="button"
              (click)="replying.set(!replying())"
              [attr.aria-expanded]="replying()"
              class="lc-action font-medium underline-offset-4 hover:underline"
            >
              Reply
            </button>
          }
          @if (canEdit() && !editing()) {
            <button type="button" (click)="editing.set(true)" class="lc-action underline-offset-4 hover:underline">
              Edit
            </button>
          }
          @if (own() && !viewerRole() && !editing()) {
            <button
              type="button"
              (click)="onDelete()"
              class="lc-action lc-action-destructive underline-offset-4 hover:underline"
            >
              Delete
            </button>
          }
        </div>
      }
      @if (viewerRole() && !readOnly()) {
        <div class="mt-2 flex flex-wrap items-center gap-3 text-sm">
          @if (c.status === 'visible') {
            <button
              type="button"
              [disabled]="moderationPending()"
              (click)="moderate.emit({ comment: c, action: 'hide' })"
              class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              Hide
            </button>
          }
          @if (c.status !== 'visible') {
            <button
              type="button"
              [disabled]="moderationPending()"
              (click)="moderate.emit({ comment: c, action: 'restore' })"
              class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              Restore
            </button>
          }
          @if (c.status === 'visible' && c.pinnedAt) {
            <button
              type="button"
              [disabled]="moderationPending()"
              (click)="moderate.emit({ comment: c, action: 'unpin' })"
              class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              Unpin
            </button>
          }
          @if (c.status === 'visible' && !c.pinnedAt) {
            <button
              type="button"
              [disabled]="moderationPending()"
              (click)="moderate.emit({ comment: c, action: 'pin' })"
              class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              Pin
            </button>
          }
          @if (c.status !== 'deleted') {
            <button
              type="button"
              [disabled]="moderationPending()"
              (click)="onModerateDelete()"
              class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              Delete
            </button>
          }
          @if (c.userId) {
            <button
              type="button"
              [disabled]="moderationPending()"
              (click)="blockUser.emit({ comment: c, blocked: !c.userBlocked })"
              class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              {{ c.userBlocked ? 'Unblock user' : 'Block user' }}
            </button>
          }
        </div>
      }
      @if (replying() && !readOnly()) {
        <div class="mt-3">
          <lc-comment-form
            #replyForm
            [guest]="guest()"
            [turnstileSiteKey]="turnstileSiteKey()"
            [parentId]="c.id"
            [submitting]="replySubmitting()"
            [error]="replyError()"
            (submitted)="reply.emit({ parentId: c.id, submit: $event })"
            (signIn)="signIn.emit()"
            (cancelReply)="replying.set(false)"
          />
        </div>
      }
      @if (comment().children.length > 0) {
        <div class="mt-3 grid gap-4">
          @for (child of comment().children; track child.comment.id) {
            <lc-comment-item
              [comment]="child"
              [depth]="depth() + 1"
              [guest]="guest()"
              [turnstileSiteKey]="turnstileSiteKey()"
              [viewerUserId]="viewerUserId()"
              [viewerRole]="viewerRole()"
              [hideVotes]="hideVotes()"
              [pendingModeration]="pendingModeration()"
              [editWindowMinutes]="editWindowMinutes()"
              [readOnly]="readOnly()"
              [replySubmitting]="replySubmitting()"
              [replyError]="replyError()"
              [editSaving]="editSaving()"
              (vote)="vote.emit($event)"
              (reply)="reply.emit($event)"
              (edited)="edited.emit($event)"
              (deleted)="deleted.emit($event)"
              (moderate)="moderate.emit($event)"
              (blockUser)="blockUser.emit($event)"
              (signIn)="signIn.emit($event)"
            />
          }
        </div>
      }
    </article>
  `,
})
export class LcCommentItemComponent {
  comment = input.required<ThreadNode>()
  depth = input(0)
  guest = input(false)
  turnstileSiteKey = input<string | undefined>(undefined)
  viewerUserId = input<string | undefined>(undefined)
  viewerRole = input<ViewerRole | undefined>(undefined)
  hideVotes = input(false)
  pendingModeration = input<Record<string, boolean>>({})
  editWindowMinutes = input<number>(DEFAULT_EDIT_WINDOW_MINUTES)
  readOnly = input(false)
  replySubmitting = input(false)
  replyError = input<ErrorInfo | null>(null)
  editSaving = input(false)
  vote = output<VoteEvent>()
  reply = output<{ parentId: string; submit: CommentSubmit }>()
  edited = output<{ id: string; submit: CommentSubmit }>()
  deleted = output<string>()
  moderate = output<{ comment: Comment; action: ModerationAction }>()
  blockUser = output<{ comment: Comment; blocked: boolean }>()
  signIn = output<void>()
  // Every thread mutation hands this item a fresh node: reset draft state.
  // That is also what closes the editor after a successful save, so a failed
  // save (no mutation) leaves the editor and its draft open.
  replying = linkedSignal({ source: () => this.comment(), computation: () => false })
  editing = linkedSignal({ source: () => this.comment(), computation: () => false })

  // Sanitization happened in the shared renderer; no bypass call needed.
  readonly bodyHtml = computed(() => renderMarkdown(this.comment().comment.bodyMarkdown))
  readonly initialsLabel = computed(() => initials(this.comment().comment.authorName))
  readonly avatarUrl = computed(() => safeUrl(this.comment().comment.avatarUrl))

  readonly dateLabel = computed(() => new Date(this.comment().comment.createdAt).toLocaleString())
  readonly own = computed(() => {
    const c = this.comment().comment
    const viewer = this.viewerUserId()
    return Boolean(viewer && c.userId && viewer === c.userId)
  })
  readonly canEdit = computed(() =>
    canEditComment(this.comment().comment, this.viewerUserId(), this.editWindowMinutes()),
  )
  readonly moderationPending = computed(() => this.pendingModeration()[this.comment().comment.id] ?? false)
  readonly canReplyHere = computed(() => !(this.viewerRole() && this.comment().comment.status !== 'visible'))
  // Voting needs a visible comment: the endpoint rejects the rest.
  readonly votesHidden = computed(
    () => this.hideVotes() || (this.viewerRole() !== undefined && this.comment().comment.status !== 'visible'),
  )

  // Stays open on a failed save: the widget's success path rebuilds the thread,
  // which resets this item's draft state.
  onEditSubmit(submit: CommentSubmit): void {
    this.edited.emit({ id: this.comment().comment.id, submit })
  }

  onDelete(): void {
    if (confirm('Delete this comment?')) this.deleted.emit(this.comment().comment.id)
  }

  onModerateDelete(): void {
    if (confirm('Delete this comment?')) this.moderate.emit({ comment: this.comment().comment, action: 'delete' })
  }
}

// Flat wrapper rendering the thread list.
@Component({
  selector: 'lc-comment-list',
  standalone: true,
  imports: [LcCommentItemComponent],
  template: `
    <div class="grid gap-4" aria-live="polite">
      @for (node of nodes(); track node.comment.id) {
        <lc-comment-item
          [comment]="node"
          [depth]="0"
          [guest]="guest()"
          [turnstileSiteKey]="turnstileSiteKey()"
          [viewerUserId]="viewerUserId()"
          [viewerRole]="viewerRole()"
          [hideVotes]="hideVotes()"
          [pendingModeration]="pendingModeration()"
          [editWindowMinutes]="editWindowMinutes()"
          [readOnly]="readOnly()"
          [replySubmitting]="replySubmitting()"
          [replyError]="replyError()"
          [editSaving]="editSaving()"
          (vote)="vote.emit($event)"
          (reply)="reply.emit($event)"
          (edited)="edited.emit($event)"
          (deleted)="deleted.emit($event)"
          (moderate)="moderate.emit($event)"
          (blockUser)="blockUser.emit($event)"
          (signIn)="signIn.emit()"
        />
      }
    </div>
  `,
})
export class LcCommentListComponent {
  nodes = input.required<ThreadNode[]>()
  guest = input(false)
  turnstileSiteKey = input<string | undefined>(undefined)
  viewerUserId = input<string | undefined>(undefined)
  viewerRole = input<ViewerRole | undefined>(undefined)
  hideVotes = input(false)
  pendingModeration = input<Record<string, boolean>>({})
  editWindowMinutes = input<number>(DEFAULT_EDIT_WINDOW_MINUTES)
  readOnly = input(false)
  replySubmitting = input(false)
  replyError = input<ErrorInfo | null>(null)
  editSaving = input(false)
  vote = output<VoteEvent>()
  reply = output<{ parentId: string; submit: CommentSubmit }>()
  edited = output<{ id: string; submit: CommentSubmit }>()
  deleted = output<string>()
  moderate = output<{ comment: Comment; action: ModerationAction }>()
  blockUser = output<{ comment: Comment; blocked: boolean }>()
  signIn = output<void>()
}
