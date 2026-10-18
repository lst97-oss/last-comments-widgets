import { DEFAULT_EDIT_WINDOW_MINUTES, isEditWindowOpen } from '@last-comments-widgets/client'

export function canEditComment(
  comment: { userId?: string | null; createdAt: string },
  viewerUserId?: string,
  editWindowMinutes: number = DEFAULT_EDIT_WINDOW_MINUTES,
): boolean {
  return Boolean(
    viewerUserId &&
      comment.userId &&
      viewerUserId === comment.userId &&
      isEditWindowOpen(comment.createdAt, Date.now(), editWindowMinutes),
  )
}
