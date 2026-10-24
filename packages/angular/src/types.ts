import {
  EDIT_WINDOW_CLOSED,
  isEditWindowOpen,
  resolveEditWindow,
  type ThreadNode,
  type ViewerRole,
  type VoteValue,
  type WidgetTheme,
} from '@last-comments-widgets/client'

export { canModerate } from '@last-comments-widgets/client'

export type Theme = 'light' | 'dark' | 'system'

// Comment action rendering: icon only, icon plus label, or label only.
export type ActionMode = 'icon' | 'icon-text' | 'text'

// Cloudflare draws the challenge itself inside a cross-origin iframe (in a
// closed shadow root), so light/dark is the only design surface it exposes.
// Background, border, radius and shadow of the widget box cannot be styled —
// hosts can only theme the container around it.
export type TurnstileWidgetTheme = 'auto' | 'light' | 'dark'
export type TurnstileWidgetSize = 'normal' | 'compact' | 'flexible'
export type TurnstileWidgetAppearance = 'always' | 'interaction-only'

// TurnstileOptions are the Cloudflare render knobs the widget exposes to hosts.
export type TurnstileOptions = {
  theme?: TurnstileWidgetTheme
  size?: TurnstileWidgetSize
  appearance?: TurnstileWidgetAppearance
  language?: string
}

export type TurnstileRenderConfig = {
  theme: TurnstileWidgetTheme
  size?: TurnstileWidgetSize
  appearance?: TurnstileWidgetAppearance
  language?: string
}

export type TurnstileRenderParams = TurnstileRenderConfig & {
  sitekey: string
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': (code: string) => void
}

// Follow the widget's own light/dark mode by default so the challenge box
// matches the theme it is embedded in instead of the OS preference; an explicit
// host `theme` wins. Nothing else about the box is styleable.
// The challenge stays out of the way by default: `interaction-only` shows the box
// only when Cloudflare needs a human check, and the token still arrives silently
// otherwise. A host opts back into the always-visible box with `appearance: 'always'`.
export function resolveTurnstileConfig(dark: boolean, options?: TurnstileOptions): TurnstileRenderConfig {
  const config: TurnstileRenderConfig = {
    theme: options?.theme ?? (dark ? 'dark' : 'light'),
    appearance: options?.appearance ?? 'interaction-only',
  }
  if (options?.size !== undefined) config.size = options.size
  if (options?.language !== undefined) config.language = options.language
  return config
}

export type CommentsOptions = {
  site: string
  baseUrl: string
  pageUrl?: string
  turnstileSiteKey?: string
  // Cloudflare owns the challenge box (cross-origin iframe): `theme` defaults to
  // the widget's own light/dark mode, and these are the only design knobs
  // (`size`, `appearance`, `language`). Background, border, radius and shadow
  // cannot be overridden; style the `.lc-turnstile` container instead.
  turnstileOptions?: TurnstileOptions
  limit?: number
  theme?: Theme
  signInUrl?: string
  viewerUserId?: string
  viewerRole?: ViewerRole
  // Guest-authored comments may be edited for this many minutes from this
  // browser (default 10; 0 = unlimited). Signed-in authors have no window.
  anonEditWindowMinutes?: number
  // Reply/Edit/Delete (and moderator) action rendering, default 'icon-text'.
  actionMode?: ActionMode
  // Max body characters, counted before trimming to match the server routes.
  bodyLimit?: number
  // Render `$…$` / `$$…$$` with KaTeX (lazy; off by default).
  math?: boolean
  // Render ```mermaid fences as diagrams (lazy; off by default).
  mermaid?: boolean
  // Syntax-highlight fenced code (lazy; on by default; React only until the ports are migrated).
  codeHighlight?: boolean
  themeVars?: WidgetTheme
  fetchImpl?: typeof fetch
}

export function resolvePageUrl(explicit: string | undefined): string {
  if (explicit) return explicit
  if (typeof window !== 'undefined') return window.location.href
  throw new Error('pageUrl is required outside the browser')
}

export type EditGateOptions = {
  // Window for guest-authored comments; signed-in owners have no window.
  anonWindowMinutes?: number
  // A guest owns the comment only while this browser still holds its edit key.
  hasEditKey?: boolean
}

// Signed-in authors edit any time; guest authors only inside the anonymous
// window while this browser still holds the key issued at creation.
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

export type VoteOverlay = Record<string, { score: number; viewerVote: VoteValue | null }>

// Applies pending vote results to a built tree without rebuilding it. Untouched
// nodes keep their identity, so only the voted row (and its ancestors' child
// arrays) re-renders; an empty overlay returns the input array unchanged.
export function applyVoteOverlay(nodes: ThreadNode[], overlay: VoteOverlay): ThreadNode[] {
  if (Object.keys(overlay).length === 0) return nodes
  let changed = false
  const apply = (node: ThreadNode): ThreadNode => {
    const patch = overlay[node.comment.id]
    const children = node.children.map(apply)
    const childrenChanged = children.some((child, index) => child !== node.children[index])
    if (!patch) return childrenChanged ? { ...node, children } : node
    changed = true
    return {
      comment: { ...node.comment, score: patch.score, viewerVote: patch.viewerVote },
      children: childrenChanged ? children : node.children,
    }
  }
  const result = nodes.map(apply)
  return changed ? result : nodes
}
