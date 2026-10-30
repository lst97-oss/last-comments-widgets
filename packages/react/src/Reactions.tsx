import type { Comment, ReactionSummary } from '@last-comments-widgets/client'
import { SmilePlus } from 'lucide-react'
import { memo, useCallback, useState } from 'react'
import { Button } from './ui/button'

// What a reaction control can do here. `off`: the site's switch is off, so nothing shows. `counts`: the
// counts show but cannot be changed (a moderator, a read-only viewer). `interactive`: a signed-in visitor
// can react, unless the page is locked.
export type ReactionMode = 'off' | 'counts' | 'interactive'

// One emoji and its count. Pressed when the viewer holds it; the count is shown only above zero. The chip hands
// its own emoji and pressed state back, so the parent passes one stable callback to every chip.
const ReactionChip = memo(function ReactionChip({
  emoji,
  count,
  pressed,
  disabled,
  onToggle,
}: {
  emoji: string
  count: number
  pressed: boolean
  disabled: boolean
  onToggle: (emoji: string, viewerReacted: boolean) => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="lc-reaction"
      aria-pressed={pressed}
      aria-label={`${emoji}, ${count} ${count === 1 ? 'reaction' : 'reactions'}`}
      disabled={disabled}
      onClick={() => onToggle(emoji, pressed)}
    >
      <span aria-hidden="true">{emoji}</span>
      {count > 0 && <span className="lc-reaction-count text-xs tabular-nums">{count}</span>}
    </Button>
  )
})

// Chips for the given emoji. A count the server did not send is zero, and a viewer's own
// reaction is what makes the chip pressed.
function reactionFor(reactions: ReactionSummary[], emoji: string): ReactionSummary {
  return reactions.find((reaction) => reaction.emoji === emoji) ?? { emoji, count: 0, viewerReacted: false }
}

export const PageReactions = memo(function PageReactions({
  mode,
  allowed,
  reactions,
  disabled,
  onReact,
}: {
  mode: ReactionMode
  allowed: string[]
  reactions: ReactionSummary[]
  disabled: boolean
  onReact: (emoji: string, viewerReacted: boolean) => void
}) {
  if (mode === 'off') return null
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons; a fieldset would add form semantics and a border every port would need to undo
    <div
      className="lc-reactions lc-page-reactions flex flex-wrap items-center gap-1"
      role="group"
      aria-label="Reactions to this page"
    >
      {allowed.map((emoji) => {
        const reaction = reactionFor(reactions, emoji)
        return (
          <ReactionChip
            key={emoji}
            emoji={emoji}
            count={reaction.count}
            pressed={reaction.viewerReacted}
            disabled={disabled || mode === 'counts'}
            onToggle={onReact}
          />
        )
      })}
    </div>
  )
})

// Under a comment: the reactions it has, and a control that opens the whole allowed set. Replies get the same
// control, since the item is recursive.
export const CommentReactions = memo(function CommentReactions({
  comment,
  mode,
  allowed,
  disabled,
  onReact,
}: {
  comment: Comment
  mode: ReactionMode
  allowed: string[]
  disabled: boolean
  onReact: (comment: Comment, emoji: string, viewerReacted: boolean) => void
}) {
  const [picking, setPicking] = useState(false)
  const toggle = useCallback(
    (emoji: string, viewerReacted: boolean) => onReact(comment, emoji, viewerReacted),
    [comment, onReact],
  )
  if (mode === 'off') return null
  const shown = picking && mode === 'interactive' ? allowed : comment.reactions.map((reaction) => reaction.emoji)
  if (shown.length === 0 && mode === 'counts') return null
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons; a fieldset would add form semantics and a border every port would need to undo
    <div
      className="lc-reactions lc-comment-reactions flex flex-wrap items-center gap-1"
      role="group"
      aria-label="Reactions"
    >
      {shown.map((emoji) => {
        const reaction = reactionFor(comment.reactions, emoji)
        return (
          <ReactionChip
            key={emoji}
            emoji={emoji}
            count={reaction.count}
            pressed={reaction.viewerReacted}
            disabled={disabled || mode === 'counts'}
            onToggle={toggle}
          />
        )
      })}
      {mode === 'interactive' && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="lc-action lc-reaction-add"
          aria-expanded={picking}
          aria-label={picking ? 'Close reactions' : 'Add reaction'}
          disabled={disabled}
          onClick={() => setPicking((open) => !open)}
        >
          <SmilePlus aria-hidden="true" />
        </Button>
      )}
    </div>
  )
})
