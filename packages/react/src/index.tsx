/**
 * React subpath of `@lst97-oss/last-comments-widgets`.
 *
 * Exports the `Comments` and `CommentViewer` components, their props types,
 * the standalone pieces a host can compose (`CommentItem`, `VoteButtons`,
 * `CommentsTheme`, …) and the edit/moderation helpers. Import
 * `@lst97-oss/last-comments-widgets/react/styles.css` once, and proxy `/api/*`
 * same-origin (the API sends no `Access-Control-Allow-Credentials`).
 */
export type { ThemeVars, WidgetTheme } from '@last-comments-widgets/client'
export { canModerate } from '@last-comments-widgets/client'
export { CommentItem } from './CommentItem'
export { Comments } from './Comments'
export { CommentsTheme } from './CommentsTheme'
export { CommentViewer, type CommentViewerProps } from './CommentViewer'
export { canEditComment } from './editGate'
export type { TurnstileOptions } from './lib/turnstile'
export { ThreadGuides } from './ThreadGuides'
export { type ThreadSort, ThreadSortToggle } from './ThreadSortToggle'
export type { ActionMode, CommentsProps, Theme } from './types'
export { VoteButtons } from './VoteButtons'
