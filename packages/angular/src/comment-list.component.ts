import { CdkAccordion, CdkAccordionItem } from '@angular/cdk/accordion'
import { CdkTrapFocus } from '@angular/cdk/a11y'
import { CdkConnectedOverlay, type ConnectedPosition } from '@angular/cdk/overlay'
import { Component, computed, input, output, signal } from '@angular/core'
import {
  type Comment,
  collectThreadParticipants,
  DEFAULT_ANON_EDIT_WINDOW_MINUTES,
  DEFAULT_BODY_LIMIT,
  type ErrorInfo,
  foldReplySummary,
  formatRelativeTime,
  getEditKey,
  type ModerationAction,
  renderMarkdown,
  safeUrl,
  type ThreadNode,
  type ViewerRole,
} from '@last-comments-widgets/client'
import {
  LucideBan,
  LucideChevronDown,
  LucideChevronUp,
  LucideCircleCheck,
  LucideEllipsisVertical,
  LucideEye,
  LucideEyeOff,
  LucideMinus,
  LucidePencil,
  LucidePin,
  LucidePinOff,
  LucidePlus,
  LucideReply,
  LucideTrash2,
} from '@lucide/angular'
import { buttonClass } from './button-classes'
import { type CommentSubmit, LcCommentFormComponent } from './comment-form.component'
import { ITEM_INITIAL, type ItemAction, type ItemState, itemReducer } from './item-state'
import { LcThreadGuidesComponent } from './thread-guides.component'
import { canEditComment, type TurnstileOptions } from './types'
import { LcVoteButtonsComponent, type VoteEvent } from './vote-buttons.component'

export type CommentSubmitHandler = (commentId: string, submit: CommentSubmit) => Promise<ErrorInfo | null>

const MENU_ITEM_CLASS =
  "lc-action flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
// Destructive entries (delete) take the alarm colour instead of the action tone.
const MENU_ITEM_DESTRUCTIVE_CLASS = `${MENU_ITEM_CLASS} lc-action-destructive`
const BADGE_CLASS =
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all [&>svg]:pointer-events-none [&>svg]:size-3!'
// Avatar: transparent outer shell whose fallback paints the muted disc, like
// the reference's Avatar + AvatarFallback pair.
const AVATAR_CLASS =
  'lc-avatar group/avatar relative flex size-6 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken dark:after:mix-blend-lighten'
const STACK_AVATAR_CLASS = `${AVATAR_CLASS} ring-2 ring-background`
const AVATAR_FALLBACK_CLASS =
  'flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

// One comment row with its reply group. Header order, badges, menu and collapse
// summary all follow the React reference; body HTML comes only from the shared
// renderMarkdown (raw HTML stripped).
@Component({
  selector: 'lc-comment-item',
  imports: [
    CdkAccordion,
    CdkAccordionItem,
    CdkConnectedOverlay,
    CdkTrapFocus,
    LcCommentFormComponent,
    LcVoteButtonsComponent,
    LucideBan,
    LucideChevronDown,
    LucideChevronUp,
    LucideCircleCheck,
    LucideEllipsisVertical,
    LucideEye,
    LucideEyeOff,
    LucideMinus,
    LucidePencil,
    LucidePin,
    LucidePinOff,
    LucidePlus,
    LucideReply,
    LucideTrash2,
  ],
  template: `
    @let c = comment().comment;
    @let state = itemState();
    <article
      class="lc-comment"
      [class.lc-reply]="depth() > 0"
      [attr.data-depth]="depth()"
      [attr.data-comment-id]="c.id"
      [attr.data-comment-depth]="depth()"
    >
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          [class]="collapseClass"
          [attr.aria-expanded]="!collapsed()"
          [attr.aria-label]="(collapsed() ? 'Expand' : 'Collapse') + ' comment by ' + c.authorName"
          (click)="dispatch({ type: 'collapse/toggle', value: !collapsed() })"
        >
          @if (collapsed()) {
            <svg lucidePlus [size]="12"></svg>
          } @else {
            <svg lucideMinus [size]="12"></svg>
          }
        </button>
        <span [class]="avatarClass" data-slot="avatar" data-size="sm">
          @if (avatarUrl(); as avatarSrc) {
            <img
              [src]="avatarSrc"
              [alt]="c.authorName"
              referrerpolicy="no-referrer"
              loading="lazy"
              decoding="async"
              class="aspect-square size-full rounded-full object-cover"
            />
          }
          <span [class]="avatarFallbackClass">{{ initialsLabel() }}</span>
        </span>
        <span class="min-w-0 truncate font-medium" [class.text-primary]="c.authorRole === 'admin'">{{
          c.authorName
        }}</span>
        @if (c.authorRole === 'admin') {
          <span [class]="adminBadgeClass">Admin</span>
        }
        <!-- Moderation rows carry the block state; the public wire shape omits it. -->
        @if (c.userBlocked) {
          <span [class]="blockedBadgeClass">
            <svg lucideBan [size]="12"></svg>
            blocked
          </span>
        }
        <!-- Ages are computed at render, not on a timer: they refresh with the next render. -->
        <time [attr.dateTime]="c.createdAt" [attr.title]="dateLabel()" class="text-xs text-muted-foreground">{{
          relativeTime()
        }}</time>
        @if (c.editedAt) {
          <span class="text-xs text-muted-foreground" [attr.title]="editedLabel()">edited</span>
        }
        @if (c.pinnedAt) {
          <span class="text-xs text-muted-foreground">pinned</span>
        }
        @if (c.status === 'hidden') {
          <span [class]="hiddenBadgeClass">hidden</span>
        }
        @if (c.status === 'deleted') {
          <span [class]="deletedBadgeClass">deleted</span>
        }
        @if (showMenu()) {
          <button
            #actionsOrigin
            type="button"
            [class]="actionsTriggerClass"
            aria-label="More actions"
            aria-haspopup="dialog"
            [attr.aria-expanded]="actionsOpen()"
            (click)="actionsOpen.set(!actionsOpen())"
          >
            <svg lucideEllipsisVertical [size]="12"></svg>
          </button>
          <ng-template
            cdkConnectedOverlay
            [cdkConnectedOverlayOrigin]="actionsOrigin"
            [cdkConnectedOverlayOpen]="actionsOpen()"
            [cdkConnectedOverlayPositions]="actionsPositions"
            (detach)="actionsOpen.set(false)"
            (overlayOutsideClick)="actionsOpen.set(false)"
          >
            <div role="dialog" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" [class]="actionsMenuClass">
              @if (canEdit() && !state.editing) {
                <button type="button" [class]="menuItemClass" (click)="actionsOpen.set(false); openEditor()">
                  <svg lucidePencil [size]="16"></svg>
                  Edit
                </button>
              }
              @if (own() && !viewerRole() && !state.editing) {
                <button
                  type="button"
                  [class]="menuDestructiveClass"
                  (click)="actionsOpen.set(false); deleted.emit(c.id)"
                >
                  <svg lucideTrash2 [size]="16"></svg>
                  Delete
                </button>
              }
              @if (viewerRole()) {
                @if (c.status === 'visible') {
                  <button
                    type="button"
                    [disabled]="moderationPending()"
                    [class]="menuItemClass"
                    (click)="actionsOpen.set(false); moderate.emit({ comment: c, action: 'hide' })"
                  >
                    <svg lucideEyeOff [size]="16"></svg>
                    Hide
                  </button>
                } @else {
                  <button
                    type="button"
                    [disabled]="moderationPending()"
                    [class]="menuItemClass"
                    (click)="actionsOpen.set(false); moderate.emit({ comment: c, action: 'restore' })"
                  >
                    <svg lucideEye [size]="16"></svg>
                    Restore
                  </button>
                }
                @if (c.status === 'visible') {
                  <button
                    type="button"
                    [disabled]="moderationPending()"
                    [class]="menuItemClass"
                    (click)="
                      actionsOpen.set(false); moderate.emit({ comment: c, action: c.pinnedAt ? 'unpin' : 'pin' })
                    "
                  >
                    @if (c.pinnedAt) {
                      <svg lucidePinOff [size]="16"></svg>
                      Unpin
                    } @else {
                      <svg lucidePin [size]="16"></svg>
                      Pin
                    }
                  </button>
                }
                @if (c.status !== 'deleted') {
                  <button
                    type="button"
                    [disabled]="moderationPending()"
                    [class]="menuDestructiveClass"
                    (click)="actionsOpen.set(false); moderate.emit({ comment: c, action: 'delete' })"
                  >
                    <svg lucideTrash2 [size]="16"></svg>
                    Delete
                  </button>
                }
                @if (c.userId) {
                  <button
                    type="button"
                    [disabled]="moderationPending()"
                    [class]="menuItemClass"
                    (click)="actionsOpen.set(false); blockUser.emit({ comment: c, blocked: !c.userBlocked })"
                  >
                    @if (c.userBlocked) {
                      <svg lucideCircleCheck [size]="16"></svg>
                      Unblock user
                    } @else {
                      <svg lucideBan [size]="16"></svg>
                      Block user
                    }
                  </button>
                }
              }
            </div>
          </ng-template>
        }
        @if (!votesHidden()) {
          <span class="ml-auto">
            @if (readOnly()) {
              <span class="text-sm text-muted-foreground">{{ c.score }}</span>
            } @else {
              <lc-vote-buttons [comment]="c" (vote)="vote.emit($event)" />
            }
          </span>
        }
      </div>
      @if (collapsed()) {
        <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-lc-collapsed="">
          @if (comment().children.length > 0) {
            <span class="lc-reply-stack flex -space-x-2">
              @for (participant of visibleParticipants(); track participant.key) {
                <span [class]="stackAvatarClass" data-slot="avatar">
                  @if (participant.avatarUrl; as avatarSrc) {
                    <img
                      [src]="avatarSrc"
                      [alt]="participant.name"
                      referrerpolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                      class="aspect-square size-full rounded-full object-cover"
                    />
                  } @else {
                    <span [class]="avatarFallbackClass">{{ participant.initials }}</span>
                  }
                </span>
              }
              @if (extraParticipants() > 0) {
                <span [class]="stackAvatarClass" data-slot="avatar-group-count">+{{ extraParticipants() }}</span>
              }
            </span>
            <span class="truncate">{{ repliesLabel() }}</span>
            @if (replyStateLabel(); as states) {
              <span class="hidden truncate sm:inline">{{ states }}</span>
            }
          } @else {
            <span>comment hidden</span>
            <span class="truncate">{{ excerpt() }}</span>
          }
        </div>
      } @else {
        @if (depth() > 0 && parentAuthorName(); as parentName) {
          <p class="mt-1 text-xs text-muted-foreground">
            Replying to <span class="font-medium text-foreground">@{{ parentName }}</span>
          </p>
        }
        @if (state.editing && !readOnly()) {
          <div class="my-3">
            <lc-comment-form
              [guest]="false"
              [initialBody]="c.bodyMarkdown"
              submitLabel="Save"
              [submitting]="state.saving"
              [error]="state.editError"
              [showCancel]="true"
              [bodyLimit]="bodyLimit()"
              (submitted)="submitEdit($event)"
              (signIn)="signIn.emit()"
              (cancelReply)="dispatch({ type: 'edit/close' })"
            />
          </div>
        } @else if (!readOnly() && replyTo() === c.id) {
          <div class="my-3">
            <lc-comment-form
              [guest]="guest()"
              [turnstileSiteKey]="turnstileSiteKey()"
              [dark]="dark()"
              [turnstileOptions]="turnstileOptions()"
              [parentId]="c.id"
              [submitting]="state.replying"
              [error]="state.replyError"
              [bodyLimit]="bodyLimit()"
              (submitted)="submitReply($event)"
              (signIn)="signIn.emit()"
              (cancelReply)="cancelReply()"
            />
          </div>
        } @else {
          <div class="lc-markdown my-3 font-sans text-sm" [innerHTML]="bodyHtml()"></div>
        }
        @if (!readOnly()) {
          <div class="flex flex-wrap items-center gap-1 text-sm">
            @if (canReplyHere()) {
              <button
                type="button"
                [class]="replyActionClass()"
                [attr.aria-expanded]="replyTo() === c.id"
                [attr.aria-label]="actionMode() === 'icon' ? 'Reply' : null"
                (click)="toggleReply()"
              >
                @if (actionMode() !== 'text') {
                  <svg lucideReply [size]="12"></svg>
                }
                <span [class.sr-only]="actionMode() === 'icon'">Reply</span>
              </button>
            }
          </div>
        }
        @if (comment().children.length > 0) {
          <div class="mt-2" data-lc-replies cdkAccordion>
            <div #group="cdkAccordionItem" cdkAccordionItem [expanded]="true" class="border-0">
              <div style="padding-inline-start: 16px">
                <button
                  type="button"
                  class="lc-replies-trigger flex w-full items-center justify-between rounded-lg border border-transparent py-1 text-left text-sm font-medium transition-all outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  [attr.aria-expanded]="group.expanded"
                  (click)="group.toggle()"
                >
                  <span class="flex min-w-0 items-center gap-2" [class.hidden]="group.expanded">
                    <span class="lc-reply-stack flex -space-x-2">
                      @for (participant of visibleParticipants(); track participant.key) {
                        <span [class]="stackAvatarClass" data-slot="avatar">
                          @if (participant.avatarUrl; as avatarSrc) {
                            <img
                              [src]="avatarSrc"
                              [alt]="participant.name"
                              referrerpolicy="no-referrer"
                              loading="lazy"
                              decoding="async"
                              class="aspect-square size-full rounded-full object-cover"
                            />
                          } @else {
                            <span [class]="avatarFallbackClass">{{ participant.initials }}</span>
                          }
                        </span>
                      }
                      @if (extraParticipants() > 0) {
                        <span [class]="stackAvatarClass" data-slot="avatar-group-count"
                          >+{{ extraParticipants() }}</span
                        >
                      }
                    </span>
                    <span class="truncate text-xs">{{ repliesLabel() }}</span>
                    @if (replyStateLabel(); as states) {
                      <span class="hidden truncate text-xs sm:inline">{{ states }}</span>
                    }
                  </span>
                  <span class="text-xs" [class.hidden]="!group.expanded">Hide {{ repliesLabel() }}</span>
                  @if (group.expanded) {
                    <svg lucideChevronUp [size]="16" class="text-muted-foreground"></svg>
                  } @else {
                    <svg lucideChevronDown [size]="16" class="text-muted-foreground"></svg>
                  }
                </button>
                @if (group.expanded) {
                  <div data-slot="accordion-content" class="overflow-clip pt-1 [overflow-clip-margin:16px]">
                    <div class="grid grid-cols-1 gap-4">
                      @for (child of comment().children; track child.comment.id) {
                        <lc-comment-item
                          [comment]="child"
                          [depth]="depth() + 1"
                          [guest]="guest()"
                          [turnstileSiteKey]="turnstileSiteKey()"
                          [dark]="dark()"
                          [turnstileOptions]="turnstileOptions()"
                          [viewerUserId]="viewerUserId()"
                          [viewerRole]="viewerRole()"
                          [hideVotes]="hideVotes()"
                          [pendingModeration]="pendingModeration()"
                          [anonWindowMinutes]="anonWindowMinutes()"
                          [actionMode]="actionMode()"
                          [bodyLimit]="bodyLimit()"
                          [readOnly]="readOnly()"
                          [replyTo]="replyTo()"
                          [parentAuthorName]="c.authorName"
                          [editComment]="editComment()"
                          [replyComment]="replyComment()"
                          (vote)="vote.emit($event)"
                          (deleted)="deleted.emit($event)"
                          (moderate)="moderate.emit($event)"
                          (blockUser)="blockUser.emit($event)"
                          (openReply)="openReply.emit($event)"
                          (closeReply)="closeReply.emit()"
                          (signIn)="signIn.emit()"
                        />
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        }
      }
    </article>
  `,
})
export class LcCommentItemComponent {
  readonly comment = input.required<ThreadNode>()
  readonly depth = input(0)
  readonly guest = input(false)
  readonly turnstileSiteKey = input<string | undefined>(undefined)
  readonly dark = input(false)
  readonly turnstileOptions = input<TurnstileOptions | undefined>(undefined)
  readonly viewerUserId = input<string | undefined>(undefined)
  readonly viewerRole = input<ViewerRole | undefined>(undefined)
  readonly hideVotes = input(false)
  readonly pendingModeration = input<Record<string, boolean>>({})
  readonly anonWindowMinutes = input(DEFAULT_ANON_EDIT_WINDOW_MINUTES)
  readonly actionMode = input<'icon' | 'icon-text' | 'text'>('icon-text')
  readonly bodyLimit = input(DEFAULT_BODY_LIMIT)
  readonly readOnly = input(false)
  readonly replyTo = input<string | null>(null)
  readonly parentAuthorName = input<string | undefined>(undefined)
  // The host owns the API calls: the row only needs their outcome to settle.
  readonly editComment = input.required<CommentSubmitHandler>()
  readonly replyComment = input.required<CommentSubmitHandler>()
  readonly vote = output<VoteEvent>()
  readonly deleted = output<string>()
  readonly moderate = output<{ comment: Comment; action: ModerationAction }>()
  readonly blockUser = output<{ comment: Comment; blocked: boolean }>()
  readonly openReply = output<string>()
  readonly closeReply = output<void>()
  readonly signIn = output<void>()

  protected readonly avatarClass = AVATAR_CLASS
  protected readonly avatarFallbackClass = AVATAR_FALLBACK_CLASS
  protected readonly stackAvatarClass = STACK_AVATAR_CLASS
  protected readonly adminBadgeClass = `${BADGE_CLASS} lc-admin-badge bg-primary text-primary-foreground`
  protected readonly blockedBadgeClass = `${BADGE_CLASS} lc-blocked-badge border-border text-foreground`
  protected readonly hiddenBadgeClass = `${BADGE_CLASS} bg-destructive/10 text-destructive dark:bg-destructive/20`
  protected readonly deletedBadgeClass = `${BADGE_CLASS} bg-secondary text-secondary-foreground`
  protected readonly menuItemClass = MENU_ITEM_CLASS
  protected readonly menuDestructiveClass = MENU_ITEM_DESTRUCTIVE_CLASS
  protected readonly collapseClass = `${buttonClass('ghost', 'icon-xs')} lc-action lc-collapse`
  protected readonly actionsTriggerClass = `${buttonClass('ghost', 'icon-xs')} lc-action lc-actions-trigger`
  protected readonly actionsMenuClass =
    'lc-actions-menu z-50 flex w-auto min-w-36 flex-col rounded-lg bg-popover p-1 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none'
  protected readonly actionsPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  ]
  protected readonly actionsOpen = signal(false)

  // One instance per comment id (@for tracks the id), so the row owns its slot
  // state for its whole life: a re-sorted or vote-patched node keeps the editor
  // and its draft open. A linkedSignal would reset on every new node object.
  protected readonly itemState = signal<ItemState>(ITEM_INITIAL)
  protected readonly collapsed = computed(() => this.itemState().collapsedOverride ?? this.comment().comment.score < 0)

  // Sanitization happened in the shared renderer; no bypass call needed.
  protected readonly bodyHtml = computed(() => renderMarkdown(this.comment().comment.bodyMarkdown))
  protected readonly initialsLabel = computed(() => initials(this.comment().comment.authorName))
  protected readonly avatarUrl = computed(() => safeUrl(this.comment().comment.avatarUrl))
  protected readonly dateLabel = computed(() => new Date(this.comment().comment.createdAt).toLocaleString())
  protected readonly editedLabel = computed(() => {
    const editedAt = this.comment().comment.editedAt
    return editedAt ? new Date(editedAt).toLocaleString() : ''
  })
  protected readonly relativeTime = computed(() => formatRelativeTime(this.comment().comment.createdAt))
  protected readonly excerpt = computed(() => this.comment().comment.bodyMarkdown.replace(/\s+/g, ' ').trim())
  protected readonly own = computed(() => {
    const comment = this.comment().comment
    const viewer = this.viewerUserId()
    return Boolean(viewer && comment.userId && viewer === comment.userId)
  })
  // Guest edit keys live in this browser; every row owns only its own key.
  protected readonly hasEditKey = computed(() => getEditKey(this.comment().comment.id) !== null)
  protected readonly canEdit = computed(() =>
    canEditComment(this.comment().comment, this.viewerUserId(), {
      anonWindowMinutes: this.anonWindowMinutes(),
      hasEditKey: this.hasEditKey(),
    }),
  )
  protected readonly moderationPending = computed(() => this.pendingModeration()[this.comment().comment.id] ?? false)
  protected readonly canReplyHere = computed(() => !(this.viewerRole() && this.comment().comment.status !== 'visible'))
  // Voting needs a visible comment: the endpoint rejects the rest.
  protected readonly votesHidden = computed(
    () => this.hideVotes() || (this.viewerRole() !== undefined && this.comment().comment.status !== 'visible'),
  )
  protected readonly showMenu = computed(() => {
    const state = this.itemState()
    const viewerRole = this.viewerRole()
    return (
      !this.readOnly() &&
      ((this.canEdit() && !state.editing) || (this.own() && !viewerRole && !state.editing) || Boolean(viewerRole))
    )
  })

  protected readonly folded = computed(() => foldReplySummary(this.comment().children))
  protected readonly repliesLabel = computed(() => {
    const count = this.folded().count
    return `${count} ${count === 1 ? 'reply' : 'replies'}`
  })
  // Statuses only exist for moderators: the public list returns visible rows.
  protected readonly replyStateLabel = computed(() => {
    if (!this.viewerRole() || this.comment().children.length === 0) return null
    const { pinned, hidden, deleted } = this.folded()
    return [
      pinned > 0 ? `${pinned} pinned` : null,
      hidden > 0 ? `${hidden} hidden` : null,
      deleted > 0 ? `${deleted} deleted` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(' · ')
  })
  readonly #participants = computed(() => collectThreadParticipants(this.comment().children))
  protected readonly visibleParticipants = computed(() =>
    this.#participants()
      .slice(0, 3)
      .map((participant) => ({
        ...participant,
        avatarUrl: safeUrl(participant.avatarUrl),
        initials: initials(participant.name),
      })),
  )
  protected readonly extraParticipants = computed(() => this.#participants().length - 3)

  protected readonly replyActionClass = computed(
    () => `${buttonClass('ghost', this.actionMode() === 'icon' ? 'icon-xs' : 'xs')} lc-action`,
  )

  protected dispatch(action: ItemAction): void {
    this.itemState.update((state) => itemReducer(state, action))
  }

  protected openEditor(): void {
    this.closeReply.emit()
    this.dispatch({ type: 'edit/open' })
  }

  protected toggleReply(): void {
    this.dispatch({ type: 'edit/close' })
    if (this.replyTo() === this.comment().comment.id) this.closeReply.emit()
    else this.openReply.emit(this.comment().comment.id)
  }

  protected cancelReply(): void {
    this.closeReply.emit()
    this.dispatch({ type: 'reply/settle', error: null })
  }

  protected async submitEdit(submit: CommentSubmit): Promise<void> {
    this.dispatch({ type: 'saving/set', saving: true })
    try {
      this.dispatch({ type: 'edit/settle', error: await this.editComment()(this.comment().comment.id, submit) })
    } finally {
      this.dispatch({ type: 'saving/set', saving: false })
    }
  }

  protected async submitReply(submit: CommentSubmit): Promise<void> {
    this.dispatch({ type: 'reply/submit' })
    try {
      this.dispatch({ type: 'reply/settle', error: await this.replyComment()(this.comment().comment.id, submit) })
    } finally {
      this.dispatch({ type: 'replying/set', replying: false })
    }
  }
}

// Thread list: the rails measure the same wrapped rows.
@Component({
  selector: 'lc-comment-list',
  imports: [LcCommentItemComponent, LcThreadGuidesComponent],
  template: `
    <lc-thread-guides [measureKey]="measureKey()">
      @for (node of nodes(); track node.comment.id) {
        <lc-comment-item
          [comment]="node"
          [depth]="0"
          [guest]="guest()"
          [turnstileSiteKey]="turnstileSiteKey()"
          [dark]="dark()"
          [turnstileOptions]="turnstileOptions()"
          [viewerUserId]="viewerUserId()"
          [viewerRole]="viewerRole()"
          [hideVotes]="hideVotes()"
          [pendingModeration]="pendingModeration()"
          [anonWindowMinutes]="anonWindowMinutes()"
          [actionMode]="actionMode()"
          [bodyLimit]="bodyLimit()"
          [readOnly]="readOnly()"
          [replyTo]="replyTo()"
          [editComment]="editComment()"
          [replyComment]="replyComment()"
          (vote)="vote.emit($event)"
          (deleted)="deleted.emit($event)"
          (moderate)="moderate.emit($event)"
          (blockUser)="blockUser.emit($event)"
          (openReply)="openReply.emit($event)"
          (closeReply)="closeReply.emit()"
          (signIn)="signIn.emit()"
        />
      }
    </lc-thread-guides>
  `,
})
export class LcCommentListComponent {
  readonly nodes = input.required<ThreadNode[]>()
  readonly guest = input(false)
  readonly turnstileSiteKey = input<string | undefined>(undefined)
  readonly dark = input(false)
  readonly turnstileOptions = input<TurnstileOptions | undefined>(undefined)
  readonly viewerUserId = input<string | undefined>(undefined)
  readonly viewerRole = input<ViewerRole | undefined>(undefined)
  readonly hideVotes = input(false)
  readonly pendingModeration = input<Record<string, boolean>>({})
  readonly anonWindowMinutes = input(DEFAULT_ANON_EDIT_WINDOW_MINUTES)
  readonly actionMode = input<'icon' | 'icon-text' | 'text'>('icon-text')
  readonly bodyLimit = input(DEFAULT_BODY_LIMIT)
  readonly readOnly = input(false)
  readonly replyTo = input<string | null>(null)
  readonly editComment = input.required<CommentSubmitHandler>()
  readonly replyComment = input.required<CommentSubmitHandler>()
  readonly measureKey = input('')
  readonly vote = output<VoteEvent>()
  readonly deleted = output<string>()
  readonly moderate = output<{ comment: Comment; action: ModerationAction }>()
  readonly blockUser = output<{ comment: Comment; blocked: boolean }>()
  readonly openReply = output<string>()
  readonly closeReply = output<void>()
  readonly signIn = output<void>()
}
