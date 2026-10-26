import { type Comment, formatRelativeTime } from '@last-comments-widgets/client'
import type { ReactNode } from 'react'
import { cn, initials } from './lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'

// Removed comments read as placeholders in the normal view: a deleted row is
// anonymised like Reddit, a hidden row says it is under review. Moderators
// never reach this branch; they need the original body to judge a restore.
export function CommentPlaceholder({
  comment,
  depth,
  parentAuthorName,
  replies,
}: {
  comment: Comment
  depth: number
  parentAuthorName?: string
  replies: ReactNode
}) {
  const deleted = comment.status === 'deleted'
  return (
    <article
      className={cn('lc-comment', depth > 0 && 'lc-reply')}
      data-depth={depth}
      data-comment-id={comment.id}
      data-comment-depth={depth}
      data-lc-placeholder={deleted ? 'deleted' : 'under-review'}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {!deleted && (
          <>
            <Avatar size="sm">
              {comment.avatarUrl && (
                <AvatarImage
                  src={comment.avatarUrl}
                  alt={comment.authorName}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              )}
              <AvatarFallback>{initials(comment.authorName)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 truncate font-medium">{comment.authorName}</span>
          </>
        )}
        <time
          dateTime={comment.createdAt}
          title={new Date(comment.createdAt).toLocaleString()}
          className="text-xs text-muted-foreground"
        >
          {formatRelativeTime(comment.createdAt)}
        </time>
      </div>
      {depth > 0 && parentAuthorName && !deleted && (
        <p className="mt-1 text-xs text-muted-foreground">
          Replying to <span className="font-medium text-foreground">@{parentAuthorName}</span>
        </p>
      )}
      <p className="my-3 text-sm text-muted-foreground">
        {deleted ? '[This comment was deleted]' : 'This comment is under review.'}
      </p>
      {replies}
    </article>
  )
}
