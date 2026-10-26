/**
 * Vue subpath of `@lst97-oss/last-comments-widgets`.
 *
 * Exports the `Comments` and `CommentViewer` SFCs, their props types, the
 * standalone pieces a host can compose, and the edit/moderation helpers.
 * Import `@lst97-oss/last-comments-widgets/vue/styles.css` once, and proxy
 * `/api/*` same-origin (the API sends no `Access-Control-Allow-Credentials`).
 */
export type { ThemeVars, WidgetTheme } from '@last-comments-widgets/client'
export { default as CommentForm } from './CommentForm.vue'
export { default as CommentItem } from './CommentItem.vue'
export { default as Comments } from './Comments.vue'
export { default as CommentViewer } from './CommentViewer.vue'
export type { ActionMode, CommentsProps, Commentupdater, CommentViewerProps, Theme } from './types'
export type { TurnstileOptions } from './lib/turnstile'
export { canEditComment, canModerate, resolvePageUrl, toggleVoteValue } from './types'
export { default as LcAvatar } from './Avatar.vue'
export { default as ReplyAvatarStack } from './ReplyAvatarStack.vue'
export { default as ThreadGuides } from './ThreadGuides.vue'
export { default as ThreadSortToggle } from './ThreadSortToggle.vue'
export { default as VoteButtons } from './VoteButtons.vue'
