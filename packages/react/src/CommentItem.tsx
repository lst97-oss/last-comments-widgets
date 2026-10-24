import {
  accountBadge,
  type Comment,
  collectThreadParticipants,
  DEFAULT_BODY_LIMIT,
  type ErrorInfo,
  formatRelativeTime,
  type ModerationAction,
  safeUrl,
  type ThreadNode,
  type ViewerRole,
  type VoteValue,
} from '@last-comments-widgets/client'
import {
  Ban,
  CircleCheck,
  EllipsisVertical,
  Eye,
  EyeOff,
  type LucideIcon,
  Minus,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Reply,
  Trash2,
} from 'lucide-react'
import { type ComponentProps, memo, type ReactNode, useReducer, useRef } from 'react'
import { CommentForm, type CommentFormInput } from './CommentForm'
import { CommentPlaceholder } from './CommentPlaceholder'
import { canEditComment } from './editGate'
import { cn, initials } from './lib/utils'
import { Markdown } from './Markdown'
import type { ActionMode } from './types'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion'
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from './ui/popover'
import { VoteButtons } from './VoteButtons'

// One item owns three mutually-exclusive UI slots (editor, reply composer,
// body) plus their pending/error flags, so those transitions live in a reducer
// instead of six independent setters.
export type ItemState = {
  editing: boolean
  saving: boolean
  editError: ErrorInfo | null
  replying: boolean
  replyError: ErrorInfo | null
  collapsedOverride: boolean | null
}

export type ItemAction =
  | { type: 'edit/open' }
  | { type: 'edit/close' }
  | { type: 'edit/settle'; error: ErrorInfo | null }
  | { type: 'saving/set'; saving: boolean }
  | { type: 'reply/submit' }
  | { type: 'reply/settle'; error: ErrorInfo | null }
  | { type: 'replying/set'; replying: boolean }
  | { type: 'collapse/toggle'; value: boolean }

export const ITEM_INITIAL: ItemState = {
  editing: false,
  saving: false,
  editError: null,
  replying: false,
  replyError: null,
  collapsedOverride: null,
}

export function itemReducer(state: ItemState, action: ItemAction): ItemState {
  switch (action.type) {
    case 'edit/open':
      return { ...state, editing: true }
    case 'edit/close':
      return { ...state, editing: false, editError: null }
    // A failed save keeps the editor (and its draft) open; Cancel is the way out.
    case 'edit/settle':
      return { ...state, editError: action.error, editing: action.error === null ? false : state.editing }
    case 'saving/set':
      return { ...state, saving: action.saving }
    case 'reply/submit':
      return { ...state, replying: true }
    case 'reply/settle':
      return { ...state, replyError: action.error }
    case 'replying/set':
      return { ...state, replying: action.replying }
    case 'collapse/toggle':
      return { ...state, collapsedOverride: action.value }
    default:
      throw new Error(`Unknown comment item action: ${JSON.stringify(action)}`)
  }
}

type CommentItemProps = {
  node: ThreadNode
  depth: number
  pendingVotes: Record<string, boolean>
  replyTo: string | null
  viewerUserId?: string
  viewerRole?: ViewerRole
  hideVotes?: boolean
  pendingModeration?: Record<string, boolean>
  anonWindowMinutes?: number
  hasEditKey?: boolean
  readOnly?: boolean
  actionMode?: ActionMode
  bodyLimit?: number
  // Render `$…$` / `$$…$$` with KaTeX (lazy; off by default).
  math?: boolean
  // Render ```mermaid fences as diagrams (lazy; off by default).
  mermaid?: boolean
  // Syntax-highlight fenced code (lazy; on by default).
  codeHighlight?: boolean
  parentAuthorName?: string
  onVote: (comment: Comment, value: VoteValue) => void
  onClear: (comment: Comment) => void
  onReply: (commentId: string) => void
  onEdit: (commentId: string, bodyMarkdown: string) => Promise<ErrorInfo | null>
  onDelete: (commentId: string) => void
  // Inline reply: the item owns the composer slot; the host owns the API call.
  onReplySubmit?: (commentId: string, input: CommentFormInput) => Promise<ErrorInfo | null>
  replySiteKey?: string
  replyGuest?: boolean
  replyIdentity?: ReactNode
  onCloseReply?: () => void
  onModerate?: (comment: Comment, action: ModerationAction) => void
  onBlockUser?: (comment: Comment, blocked: boolean) => void
}

function countReplies(nodes: ThreadNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countReplies(node.children), 0)
}

function ActionContent({ icon: Icon, label, mode }: { icon: LucideIcon; label: string; mode: ActionMode }) {
  return (
    <>
      {mode !== 'text' && <Icon aria-hidden="true" />}
      <span className={mode === 'icon' ? 'sr-only' : undefined}>{label}</span>
    </>
  )
}

function CommentAction({
  icon,
  label,
  mode,
  className,
  ...props
}: ComponentProps<typeof Button> & { icon: LucideIcon; label: string; mode: ActionMode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={mode === 'icon' ? 'icon-xs' : 'xs'}
      aria-label={mode === 'icon' ? label : undefined}
      className={cn('lc-action', className)}
      {...props}
    >
      <ActionContent icon={icon} label={label} mode={mode} />
    </Button>
  )
}

const MENU_ITEM_CLASS =
  "lc-action flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
// Destructive entries (delete) take the alarm colour instead of the action tone.
const MENU_ITEM_DESTRUCTIVE_CLASS = `${MENU_ITEM_CLASS} lc-action-destructive`

// Secondary actions live behind the header's ⋮ so a comment reads as content
// first. Reply stays outside: it is the one action worth a permanent target.
function CommentActionsMenu({
  comment,
  canEdit,
  editing,
  isOwn,
  viewerRole,
  moderationPending,
  onEdit,
  onDelete,
  onModerate,
  onBlockUser,
}: {
  comment: Comment
  canEdit: boolean
  editing: boolean
  isOwn: boolean
  viewerRole?: ViewerRole
  moderationPending: boolean
  onEdit: () => void
  onDelete: () => void
  onModerate?: (comment: Comment, action: ModerationAction) => void
  onBlockUser?: (comment: Comment, blocked: boolean) => void
}) {
  // Delete is soft (status 'deleted', restorable by a moderator), so the menu
  // entry acts immediately instead of asking for confirmation.
  const showEdit = canEdit && !editing
  const showOwnDelete = isOwn && !viewerRole && !editing
  const showModeration = Boolean(viewerRole)
  if (!showEdit && !showOwnDelete && !showModeration) return null

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="More actions"
            className="lc-action lc-actions-trigger"
          />
        }
      >
        <EllipsisVertical aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="lc-actions-menu">
        {showEdit && (
          <PopoverClose className={MENU_ITEM_CLASS} onClick={onEdit}>
            <Pencil aria-hidden="true" />
            Edit
          </PopoverClose>
        )}
        {showOwnDelete && (
          <PopoverClose className={MENU_ITEM_DESTRUCTIVE_CLASS} onClick={onDelete}>
            <Trash2 aria-hidden="true" />
            Delete
          </PopoverClose>
        )}
        {viewerRole && (
          <>
            {comment.status === 'visible' && (
              <PopoverClose
                className={MENU_ITEM_CLASS}
                disabled={moderationPending}
                onClick={() => onModerate?.(comment, 'hide')}
              >
                <EyeOff aria-hidden="true" />
                Hide
              </PopoverClose>
            )}
            {comment.status !== 'visible' && (
              <PopoverClose
                className={MENU_ITEM_CLASS}
                disabled={moderationPending}
                onClick={() => onModerate?.(comment, 'restore')}
              >
                <Eye aria-hidden="true" />
                Restore
              </PopoverClose>
            )}
            {comment.status === 'visible' && (
              <PopoverClose
                className={MENU_ITEM_CLASS}
                disabled={moderationPending}
                onClick={() => onModerate?.(comment, comment.pinnedAt ? 'unpin' : 'pin')}
              >
                {comment.pinnedAt ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
                {comment.pinnedAt ? 'Unpin' : 'Pin'}
              </PopoverClose>
            )}
            {comment.status !== 'deleted' && (
              <PopoverClose
                className={MENU_ITEM_DESTRUCTIVE_CLASS}
                disabled={moderationPending}
                onClick={() => onModerate?.(comment, 'delete')}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </PopoverClose>
            )}
            {comment.userId && (
              <PopoverClose
                className={MENU_ITEM_CLASS}
                disabled={moderationPending}
                onClick={() => onBlockUser?.(comment, !comment.userBlocked)}
              >
                {comment.userBlocked ? <CircleCheck aria-hidden="true" /> : <Ban aria-hidden="true" />}
                {comment.userBlocked ? 'Unblock user' : 'Block user'}
              </PopoverClose>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

// Folded-group summary: who is inside the group, so a hidden group still shows
// its participants. Moderated authors are counted in the label, not marked here.
const ReplyAvatarStack = memo(function ReplyAvatarStack({ nodes }: { nodes: ThreadNode[] }) {
  const participants = collectThreadParticipants(nodes)
  const visible = participants.slice(0, 3)
  const extra = participants.length - visible.length
  return (
    <AvatarGroup className="lc-reply-stack">
      {visible.map((participant) => {
        const avatarUrl = safeUrl(participant.avatarUrl)
        return (
          <Avatar key={participant.key} size="sm">
            {avatarUrl && (
              <AvatarImage
                src={avatarUrl}
                alt={participant.name}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            )}
            <AvatarFallback>{initials(participant.name)}</AvatarFallback>
          </Avatar>
        )
      })}
      {extra > 0 && <AvatarGroupCount className="text-xs">+{extra}</AvatarGroupCount>}
    </AvatarGroup>
  )
})

// Moderator-only composition of a reply group: pinned/hidden/deleted replies
// are counted even though they render as rows like any other.
function countReplyStates(nodes: ThreadNode[]) {
  const totals = { pinned: 0, hidden: 0, deleted: 0 }
  const visit = (list: ThreadNode[]) => {
    for (const node of list) {
      if (node.comment.pinnedAt !== null) totals.pinned += 1
      if (node.comment.status === 'hidden') totals.hidden += 1
      if (node.comment.status === 'deleted') totals.deleted += 1
      visit(node.children)
    }
  }
  visit(nodes)
  return totals
}

// The header row: collapse control, author identity, status badges and the
// secondary-action menu. Kept out of CommentItem so the item stays a layout
// shell and each section can be read (and tested) on its own.
type CommentHeaderProps = {
  comment: Comment
  collapsed: boolean
  avatarUrl: string | undefined
  canEdit: boolean
  editing: boolean
  isOwn: boolean
  viewerRole?: ViewerRole
  moderationPending: boolean
  readOnly: boolean
  hideVotes: boolean
  pendingVote: boolean
  onToggleCollapse: () => void
  onEditStart: () => void
  onDelete: () => void
  onVote: (comment: Comment, value: VoteValue) => void
  onClear: (comment: Comment) => void
  onModerate?: (comment: Comment, action: ModerationAction) => void
  onBlockUser?: (comment: Comment, blocked: boolean) => void
}

function CommentHeader({
  comment,
  collapsed,
  avatarUrl,
  canEdit,
  editing,
  isOwn,
  viewerRole,
  moderationPending,
  readOnly,
  hideVotes,
  pendingVote,
  onToggleCollapse,
  onEditStart,
  onDelete,
  onVote,
  onClear,
  onModerate,
  onBlockUser,
}: CommentHeaderProps) {
  const badge = accountBadge(comment)
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="lc-action lc-collapse"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} comment by ${comment.authorName}`}
        onClick={onToggleCollapse}
      >
        {collapsed ? <Plus aria-hidden="true" /> : <Minus aria-hidden="true" />}
      </Button>
      <Avatar size="sm">
        {avatarUrl && (
          <AvatarImage
            src={avatarUrl}
            alt={comment.authorName}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        )}
        <AvatarFallback>{initials(comment.authorName)}</AvatarFallback>
      </Avatar>
      <span className={cn('min-w-0 truncate font-medium', badge === 'admin' && 'lc-author-admin')}>
        {comment.authorName}
      </span>
      {badge === 'admin' && (
        <Badge variant="default" className="lc-admin-badge">
          Admin
        </Badge>
      )}
      {badge === 'member' && (
        <Badge variant="default" className="lc-member-badge">
          Member
        </Badge>
      )}
      {/* Moderation rows carry the block state; the public wire shape omits it. */}
      {comment.userBlocked && (
        <Badge variant="outline" className="lc-blocked-badge">
          <Ban aria-hidden="true" />
          blocked
        </Badge>
      )}
      {/* Ages are computed at render, not on a timer: they refresh with the next render. */}
      <time
        dateTime={comment.createdAt}
        title={new Date(comment.createdAt).toLocaleString()}
        className="text-xs text-muted-foreground"
      >
        {formatRelativeTime(comment.createdAt)}
      </time>
      {comment.editedAt && (
        <span className="text-xs text-muted-foreground" title={new Date(comment.editedAt).toLocaleString()}>
          edited
        </span>
      )}
      {comment.pinnedAt && <span className="text-xs text-muted-foreground">pinned</span>}
      {comment.status === 'hidden' && <Badge variant="destructive">hidden</Badge>}
      {comment.status === 'deleted' && <Badge variant="secondary">deleted</Badge>}
      {!readOnly && (
        <CommentActionsMenu
          comment={comment}
          canEdit={canEdit}
          editing={editing}
          isOwn={isOwn}
          viewerRole={viewerRole}
          moderationPending={moderationPending}
          onEdit={onEditStart}
          onDelete={onDelete}
          onModerate={onModerate}
          onBlockUser={onBlockUser}
        />
      )}
      {!hideVotes && (
        <span className="ml-auto">
          {readOnly ? (
            <span className="text-sm text-muted-foreground">{comment.score}</span>
          ) : (
            <VoteButtons comment={comment} pending={pendingVote} onVote={onVote} onClear={onClear} />
          )}
        </span>
      )}
    </div>
  )
}

// Collapsed rows still show who is inside the group, or an excerpt for a
// thread-less comment, without re-rendering the body.
function CollapsedComment({
  nodes,
  repliesLabel,
  replyStateLabel,
  excerpt,
}: {
  nodes: ThreadNode[]
  repliesLabel: string
  replyStateLabel: string
  excerpt: string
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-lc-collapsed="">
      {nodes.length > 0 ? (
        <>
          <ReplyAvatarStack nodes={nodes} />
          <span className="truncate">{repliesLabel}</span>
          {replyStateLabel && <span className="hidden truncate sm:inline">{replyStateLabel}</span>}
        </>
      ) : (
        <>
          <span>comment hidden</span>
          <span className="truncate">{excerpt}</span>
        </>
      )}
    </div>
  )
}

export function CommentItem({
  node,
  depth,
  pendingVotes,
  replyTo,
  viewerUserId,
  viewerRole,
  hideVotes = false,
  pendingModeration,
  anonWindowMinutes,
  hasEditKey = false,
  readOnly = false,
  actionMode = 'icon-text',
  bodyLimit = DEFAULT_BODY_LIMIT,
  math = false,
  mermaid = false,
  codeHighlight = true,
  parentAuthorName,
  onVote,
  onClear,
  onReply,
  onEdit,
  onDelete,
  onReplySubmit,
  replySiteKey,
  replyGuest = false,
  replyIdentity,
  onCloseReply,
  onModerate,
  onBlockUser,
}: CommentItemProps) {
  const { comment } = node
  const [state, dispatch] = useReducer(itemReducer, ITEM_INITIAL)
  const { editing, saving, editError, replying, replyError, collapsedOverride } = state
  // The reply composer's in-flight lock: it outlives the render that disables
  // the button, so a second click cannot post the same reply twice.
  const replyingRef = useRef(false)
  // The inline editor's in-flight lock, for the same reason.
  const savingRef = useRef(false)
  const isOwn = Boolean(viewerUserId && comment.userId && viewerUserId === comment.userId)
  const canEdit = canEditComment(comment, viewerUserId, { anonWindowMinutes, hasEditKey })
  const moderationPending = pendingModeration?.[comment.id] ?? false
  const canReplyHere = !(viewerRole && comment.status !== 'visible')
  const avatarUrl = safeUrl(comment.avatarUrl)
  const replyCount = countReplies(node.children)
  const repliesLabel = `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`
  // Statuses only exist for moderators: the public list returns visible rows.
  const replyStates = viewerRole && node.children.length > 0 ? countReplyStates(node.children) : null
  const replyStateLabel = [
    replyStates && replyStates.pinned > 0 ? `${replyStates.pinned} pinned` : null,
    replyStates && replyStates.hidden > 0 ? `${replyStates.hidden} hidden` : null,
    replyStates && replyStates.deleted > 0 ? `${replyStates.deleted} deleted` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')
  // Negative net score collapses in every sort mode; 0 stays expanded.
  const collapsed = collapsedOverride ?? comment.score < 0
  const excerpt = comment.bodyMarkdown.replace(/\s+/g, ' ').trim()
  // Removed comments are placeholders in the normal view; moderators keep the
  // body so they can still judge a restore.
  const placeholder = !viewerRole && comment.status !== 'visible'
  const replies =
    node.children.length > 0 ? (
      <Accordion defaultValue={[comment.id]} className="mt-2" data-lc-replies="">
        <AccordionItem value={comment.id} className="border-0">
          <div style={{ paddingInlineStart: 16 }}>
            <AccordionTrigger className="lc-replies-trigger py-1">
              <span className="flex min-w-0 items-center gap-2 group-aria-expanded/accordion-trigger:hidden">
                <ReplyAvatarStack nodes={node.children} />
                <span className="truncate text-xs">{repliesLabel}</span>
                {replyStateLabel && <span className="hidden truncate text-xs sm:inline">{replyStateLabel}</span>}
              </span>
              <span className="hidden text-xs group-aria-expanded/accordion-trigger:inline">Hide {repliesLabel}</span>
            </AccordionTrigger>
            <AccordionContent className="pt-1">
              <div className="grid grid-cols-1 gap-4">
                {node.children.map((child) => (
                  <CommentItem
                    key={child.comment.id}
                    node={child}
                    depth={depth + 1}
                    pendingVotes={pendingVotes}
                    replyTo={replyTo}
                    viewerUserId={viewerUserId}
                    viewerRole={viewerRole}
                    hideVotes={hideVotes}
                    pendingModeration={pendingModeration}
                    anonWindowMinutes={anonWindowMinutes}
                    hasEditKey={hasEditKey}
                    readOnly={readOnly}
                    actionMode={actionMode}
                    bodyLimit={bodyLimit}
                    parentAuthorName={comment.authorName}
                    onVote={onVote}
                    onClear={onClear}
                    onReply={onReply}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onReplySubmit={onReplySubmit}
                    replySiteKey={replySiteKey}
                    replyGuest={replyGuest}
                    replyIdentity={replyIdentity}
                    onCloseReply={onCloseReply}
                    onModerate={onModerate}
                    onBlockUser={onBlockUser}
                  />
                ))}
              </div>
            </AccordionContent>
          </div>
        </AccordionItem>
      </Accordion>
    ) : null
  if (placeholder) {
    return <CommentPlaceholder comment={comment} depth={depth} parentAuthorName={parentAuthorName} replies={replies} />
  }
  return (
    <article
      className={cn('lc-comment', depth > 0 && 'lc-reply')}
      data-depth={depth}
      data-comment-id={comment.id}
      data-comment-depth={depth}
    >
      <CommentHeader
        comment={comment}
        collapsed={collapsed}
        avatarUrl={avatarUrl}
        canEdit={canEdit}
        editing={editing}
        isOwn={isOwn}
        viewerRole={viewerRole}
        moderationPending={moderationPending}
        readOnly={readOnly}
        hideVotes={hideVotes}
        pendingVote={pendingVotes[comment.id] ?? false}
        onToggleCollapse={() => dispatch({ type: 'collapse/toggle', value: !collapsed })}
        onEditStart={() => {
          onCloseReply?.()
          dispatch({ type: 'edit/open' })
        }}
        onDelete={() => onDelete(comment.id)}
        onVote={onVote}
        onClear={onClear}
        onModerate={onModerate}
        onBlockUser={onBlockUser}
      />
      {collapsed ? (
        <CollapsedComment
          nodes={node.children}
          repliesLabel={repliesLabel}
          replyStateLabel={replyStateLabel}
          excerpt={excerpt}
        />
      ) : (
        <>
          {depth > 0 && parentAuthorName && (
            <p className="mt-1 text-xs text-muted-foreground">
              Replying to <span className="font-medium text-foreground">@{parentAuthorName}</span>
            </p>
          )}
          {editing && !readOnly ? (
            <div className="my-3">
              <CommentForm
                siteKey={undefined}
                guest={false}
                parentId={null}
                pending={saving}
                error={editError}
                initialBody={comment.bodyMarkdown}
                submitLabel="Save"
                bodyLimit={bodyLimit}
                math={math}
                mermaid={mermaid}
                codeHighlight={codeHighlight}
                onSubmit={async (input) => {
                  // The in-flight lock: a second click must not save the same edit twice.
                  if (savingRef.current) return false
                  savingRef.current = true
                  dispatch({ type: 'saving/set', saving: true })
                  try {
                    const error = await onEdit(comment.id, input.bodyMarkdown)
                    dispatch({ type: 'edit/settle', error })
                    return error === null
                  } finally {
                    savingRef.current = false
                    dispatch({ type: 'saving/set', saving: false })
                  }
                }}
                onCancelReply={() => dispatch({ type: 'edit/close' })}
              />
            </div>
          ) : !readOnly && replyTo === comment.id && onReplySubmit ? (
            <div className="my-3">
              <CommentForm
                siteKey={replySiteKey}
                guest={replyGuest}
                parentId={comment.id}
                pending={replying}
                error={replyError}
                identity={replyIdentity}
                bodyLimit={bodyLimit}
                math={math}
                mermaid={mermaid}
                codeHighlight={codeHighlight}
                onSubmit={async (input) => {
                  // The in-flight lock: a second click must not post the reply twice.
                  if (replyingRef.current) return false
                  replyingRef.current = true
                  dispatch({ type: 'reply/submit' })
                  try {
                    const error = await onReplySubmit(comment.id, input)
                    dispatch({ type: 'reply/settle', error })
                    return error === null
                  } finally {
                    replyingRef.current = false
                    dispatch({ type: 'replying/set', replying: false })
                  }
                }}
                onCancelReply={() => {
                  onCloseReply?.()
                  dispatch({ type: 'reply/settle', error: null })
                }}
              />
            </div>
          ) : (
            <Markdown
              source={comment.bodyMarkdown}
              className="lc-markdown my-3 font-sans text-sm"
              math={math}
              mermaid={mermaid}
              codeHighlight={codeHighlight}
            />
          )}
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-1 text-sm">
              {canReplyHere && (
                <CommentAction
                  icon={Reply}
                  label="Reply"
                  mode={actionMode}
                  aria-expanded={replyTo === comment.id}
                  onClick={() => {
                    dispatch({ type: 'edit/close' })
                    if (replyTo === comment.id) onCloseReply?.()
                    else onReply(comment.id)
                  }}
                />
              )}
            </div>
          )}
          {replies}
        </>
      )}
    </article>
  )
}
