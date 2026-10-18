import type { Comment, VoteValue } from '@last-comments-widgets/client'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from './ui/button'

type VoteButtonsProps = {
  comment: Comment
  pending: boolean
  onVote: (comment: Comment, value: VoteValue) => void
  onClear: (comment: Comment) => void
}

export function VoteButtons({ comment, pending, onVote, onClear }: VoteButtonsProps) {
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant={comment.viewerVote === 1 ? 'default' : 'ghost'}
        disabled={pending}
        aria-pressed={comment.viewerVote === 1}
        aria-label="Upvote"
        onClick={() => (comment.viewerVote === 1 ? onClear(comment) : onVote(comment, 1))}
      >
        <ArrowUp />
      </Button>
      <span className="min-w-6 text-center text-sm text-muted-foreground" aria-live="polite">
        {comment.score}
      </span>
      <Button
        size="sm"
        variant={comment.viewerVote === -1 ? 'default' : 'ghost'}
        disabled={pending}
        aria-pressed={comment.viewerVote === -1}
        aria-label="Downvote"
        onClick={() => (comment.viewerVote === -1 ? onClear(comment) : onVote(comment, -1))}
      >
        <ArrowDown />
      </Button>
    </div>
  )
}
