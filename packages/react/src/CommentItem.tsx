import {
  type Comment,
  DEFAULT_EDIT_WINDOW_MINUTES,
  type ErrorInfo,
  type ModerationAction,
  renderMarkdown,
  safeUrl,
  type ThreadNode,
  type ViewerRole,
  type VoteValue,
} from '@last-comments-widgets/client'
import { useState } from 'react'
import { CommentForm } from './CommentForm'
import { canEditComment } from './editGate'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Badge } from './ui/badge'
import { VoteButtons } from './VoteButtons'

type CommentItemProps = {
  node: ThreadNode
  depth: number
  pendingVotes: Record<string, boolean>
  replyTo: string | null
  viewerUserId?: string
  viewerRole?: ViewerRole
  hideVotes?: boolean
  pendingModeration?: Record<string, boolean>
  editWindowMinutes?: number
  readOnly?: boolean
  onVote: (comment: Comment, value: VoteValue) => void
  onClear: (comment: Comment) => void
  onReply: (commentId: string) => void
  onEdit: (commentId: string, bodyMarkdown: string) => Promise<ErrorInfo | null>
  onDelete: (commentId: string) => void
  onModerate?: (comment: Comment, action: ModerationAction) => void
  onBlockUser?: (comment: Comment, blocked: boolean) => void
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
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
  editWindowMinutes = DEFAULT_EDIT_WINDOW_MINUTES,
  readOnly = false,
  onVote,
  onClear,
  onReply,
  onEdit,
  onDelete,
  onModerate,
  onBlockUser,
}: CommentItemProps) {
  const { comment } = node
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<ErrorInfo | null>(null)
  const isOwn = Boolean(viewerUserId && comment.userId && viewerUserId === comment.userId)
  const canEdit = canEditComment(comment, viewerUserId, editWindowMinutes)
  const moderationPending = pendingModeration?.[comment.id] ?? false
  const canReplyHere = !(viewerRole && comment.status !== 'visible')
  const avatarUrl = safeUrl(comment.avatarUrl)
  return (
    <article className={`lc-comment ${depth > 0 ? 'lc-reply ml-6 border-l border-border pl-4' : ''}`}>
      <div className="flex items-center gap-2">
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
        <span className="min-w-0 truncate font-medium">{comment.authorName}</span>
        <time dateTime={comment.createdAt} className="text-xs text-muted-foreground">
          {new Date(comment.createdAt).toLocaleString()}
        </time>
        {comment.editedAt && <span className="text-xs text-muted-foreground">edited</span>}
        {comment.pinnedAt && <span className="text-xs text-muted-foreground">pinned</span>}
        {comment.status === 'hidden' && <Badge variant="destructive">hidden</Badge>}
        {comment.status === 'deleted' && <Badge variant="secondary">deleted</Badge>}
        {!hideVotes && (
          <span className="ml-auto">
            {readOnly ? (
              <span className="text-sm text-muted-foreground">{comment.score}</span>
            ) : (
              <VoteButtons
                comment={comment}
                pending={pendingVotes[comment.id] ?? false}
                onVote={onVote}
                onClear={onClear}
              />
            )}
          </span>
        )}
      </div>
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
            onSubmit={async (input) => {
              setSaving(true)
              try {
                const error = await onEdit(comment.id, input.bodyMarkdown)
                setEditError(error)
                // Any failure keeps the editor (and the draft) open — including
                // the expired window, whose copy tells the user to copy their
                // text. Cancel is the way out.
                if (!error) setEditing(false)
                return error === null
              } finally {
                setSaving(false)
              }
            }}
            onCancelReply={() => {
              setEditing(false)
              setEditError(null)
            }}
          />
        </div>
      ) : (
        <div
          className="lc-markdown my-3 font-sans text-sm"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by shared renderMarkdown (strips raw HTML, allowlists http(s)/mailto links)
          dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.bodyMarkdown) }}
        />
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {canReplyHere && (
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => onReply(comment.id)}
              aria-expanded={replyTo === comment.id}
            >
              Reply
            </button>
          )}
          {canEdit && !editing && (
            <button
              type="button"
              className="text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          )}
          {isOwn && !viewerRole && !editing && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <button type="button" className="text-muted-foreground underline-offset-4 hover:underline">
                    Delete
                  </button>
                }
              >
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(comment.id)}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
      {viewerRole && !readOnly && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          {comment.status === 'visible' && (
            <button
              type="button"
              className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
              disabled={moderationPending}
              onClick={() => onModerate?.(comment, 'hide')}
            >
              Hide
            </button>
          )}
          {comment.status !== 'visible' && (
            <button
              type="button"
              className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
              disabled={moderationPending}
              onClick={() => onModerate?.(comment, 'restore')}
            >
              Restore
            </button>
          )}
          {comment.status === 'visible' &&
            (comment.pinnedAt ? (
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
                disabled={moderationPending}
                onClick={() => onModerate?.(comment, 'unpin')}
              >
                Unpin
              </button>
            ) : (
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
                disabled={moderationPending}
                onClick={() => onModerate?.(comment, 'pin')}
              >
                Pin
              </button>
            ))}
          {comment.status !== 'deleted' && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <button
                    type="button"
                    className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
                    disabled={moderationPending}
                  >
                    Delete
                  </button>
                }
              >
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onModerate?.(comment, 'delete')}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {comment.userId &&
            (comment.userBlocked ? (
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
                disabled={moderationPending}
                onClick={() => onBlockUser?.(comment, false)}
              >
                Unblock user
              </button>
            ) : (
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
                disabled={moderationPending}
                onClick={() => onBlockUser?.(comment, true)}
              >
                Block user
              </button>
            ))}
        </div>
      )}
      {node.children.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-4">
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
              editWindowMinutes={editWindowMinutes}
              readOnly={readOnly}
              onVote={onVote}
              onClear={onClear}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onModerate={onModerate}
              onBlockUser={onBlockUser}
            />
          ))}
        </div>
      )}
    </article>
  )
}
