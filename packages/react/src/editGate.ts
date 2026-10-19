import { EDIT_WINDOW_CLOSED, isEditWindowOpen, resolveEditWindow } from '@last-comments-widgets/client'

export type EditGateOptions = {
  // Window for guest-authored comments; signed-in owners have no window.
  anonWindowMinutes?: number
  // A guest owns the comment only while this browser still holds its edit key.
  hasEditKey?: boolean
}

export function canEditComment(
  comment: { userId?: string | null; createdAt: string },
  viewerUserId?: string,
  options: EditGateOptions = {},
): boolean {
  const windowMinutes = resolveEditWindow({
    commentUserId: comment.userId,
    viewerUserId,
    hasEditKey: options.hasEditKey,
    ...(options.anonWindowMinutes === undefined ? {} : { anonymousWindowMinutes: options.anonWindowMinutes }),
  })
  if (windowMinutes === EDIT_WINDOW_CLOSED) return false
  return isEditWindowOpen(comment.createdAt, Date.now(), windowMinutes)
}
