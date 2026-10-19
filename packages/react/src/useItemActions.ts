import type { Comment, ErrorInfo, ModerationAction, VoteValue } from '@last-comments-widgets/client'
import { useCallback } from 'react'
import type { CommentFormInput } from './CommentForm'

// Binds the host's handlers to the prop shape CommentItem expects. Every
// callback is memoized on its input, so a parent state tick does not hand the
// rows a fresh function set (which would defeat memoization everywhere below).
export function useItemActions(actions: {
  vote: (comment: Comment, value: VoteValue) => Promise<void>
  clear: (comment: Comment) => Promise<void>
  edit: (commentId: string, bodyMarkdown: string) => Promise<ErrorInfo | null>
  remove: (commentId: string) => Promise<void>
  replySubmit: (commentId: string, input: CommentFormInput) => Promise<ErrorInfo | null>
  closeReply: () => void
  moderate: (comment: Comment, action: ModerationAction) => Promise<void>
  blockUser: (comment: Comment, blocked: boolean) => Promise<void>
}) {
  const { vote, clear, edit, remove, replySubmit, closeReply, moderate, blockUser } = actions

  // The `void` wrappers match the item prop signatures: async work is fire-and-forget.
  const onVote = useCallback((comment: Comment, value: VoteValue) => void vote(comment, value), [vote])
  const onClear = useCallback((comment: Comment) => void clear(comment), [clear])
  const onEdit = useCallback((commentId: string, bodyMarkdown: string) => edit(commentId, bodyMarkdown), [edit])
  const onDelete = useCallback((commentId: string) => void remove(commentId), [remove])
  const onReplySubmit = useCallback(
    (commentId: string, input: CommentFormInput) => replySubmit(commentId, input),
    [replySubmit],
  )
  const onCloseReply = useCallback(() => closeReply(), [closeReply])
  const onModerate = useCallback(
    (comment: Comment, action: ModerationAction) => void moderate(comment, action),
    [moderate],
  )
  const onBlockUser = useCallback((comment: Comment, blocked: boolean) => void blockUser(comment, blocked), [blockUser])

  return { onVote, onClear, onEdit, onDelete, onReplySubmit, onCloseReply, onModerate, onBlockUser }
}
