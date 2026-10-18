import {
  DEFAULT_EDIT_WINDOW_MINUTES,
  isEditWindowOpen,
  type ViewerRole,
  type WidgetTheme,
} from '@last-comments-widgets/client'

export { canModerate } from '@last-comments-widgets/client'

export type Theme = 'light' | 'dark' | 'system'

export type CommentsOptions = {
  site: string
  baseUrl: string
  pageUrl?: string
  turnstileSiteKey?: string
  limit?: number
  theme?: Theme
  signInUrl?: string
  viewerUserId?: string
  viewerRole?: ViewerRole
  editWindowMinutes?: number
  themeVars?: WidgetTheme
  fetchImpl?: typeof fetch
}

export function resolvePageUrl(explicit: string | undefined): string {
  if (explicit) return explicit
  if (typeof window !== 'undefined') return window.location.href
  throw new Error('pageUrl is required outside the browser')
}

// Delete stays ownership-only (no window); edit also requires the window.
export function canEditComment(
  comment: { userId: string | null; createdAt: string },
  viewerUserId: string | undefined,
  editWindowMinutes: number = DEFAULT_EDIT_WINDOW_MINUTES,
): boolean {
  return (
    !!viewerUserId &&
    !!comment.userId &&
    viewerUserId === comment.userId &&
    isEditWindowOpen(comment.createdAt, Date.now(), editWindowMinutes)
  )
}
