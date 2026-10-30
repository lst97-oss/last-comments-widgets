/**
 * Plain-HTML subpath of `@lst97-oss/last-comments-widgets`.
 *
 * `mountComments` renders the widget into an element and `renderCommentViewer`
 * renders the read-only thread; the module also auto-mounts `[data-lc-comments]`
 * and `[data-lc-viewer]` elements from `data-lc-*` attributes. Import
 * `@lst97-oss/last-comments-widgets/vanilla/styles.css` (or the hosted
 * `/dist/vanilla/styles.css`) once, and route `/api/*` through a same-origin
 * proxy: the API sends no `Access-Control-Allow-Credentials`.
 */

export type { ThemeVars, WidgetTheme } from '@last-comments-widgets/client'
export type {
  TurnstileOptions,
  TurnstileRenderConfig,
  TurnstileRenderParams,
  TurnstileWidgetAppearance,
  TurnstileWidgetSize,
  TurnstileWidgetTheme,
} from '@last-comments-widgets/client/enhance'
export { enhanceMath, enhanceMermaid, isSafeSvg, resolveTurnstileConfig } from '@last-comments-widgets/client/enhance'
export { parseThemeAttrs } from './auto-mount'
export type { GuideRow, GuidesSession } from './guides'
export { GUTTER_INSET, guidePath, observeInView, pickActive, READING_POINT, renderGuides } from './guides'
export type { CommentNodeOptions, ReactionMode } from './markup'
export {
  actionsMenuMarkup,
  errorMarkup,
  escapeHtml,
  insertPrefix,
  insertWrap,
  pagerMarkup,
  renderCommentNode,
  renderCommentTree,
  signInPromptMarkup,
  sortToggleMarkup,
} from './markup'
export { mountComments, runMarkdownEnhancers } from './mount'
export type { ItemState, UiAction, UiState, VotePatch } from './state'
export { applyVotes, canEditComment, ITEM_INITIAL, transition, UI_INITIAL } from './state'
export type { ActionMode, MountOptions, Theme, WidgetHandle } from './types'
export { renderCommentViewer } from './viewer'

import { autoMount } from './auto-mount'

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount, { once: true })
  else autoMount()
}
