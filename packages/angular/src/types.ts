import { type Comment, type ThreadNode, type ViewerRole, type WidgetTheme } from '@last-comments-widgets/client'
import type { TurnstileOptions } from '@last-comments-widgets/client/enhance'

export { canModerate } from '@last-comments-widgets/client'
export { canEditComment, type EditGateOptions } from '@last-comments-widgets/client'
// The Turnstile option type is shared with every port (its resolver lives in the client's enhance entry).
export type { TurnstileOptions }

export type Theme = 'light' | 'dark' | 'system'

// Comment action rendering: icon only, icon plus label, or label only.
export type ActionMode = 'icon' | 'icon-text' | 'text'

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
  onSignInClick?: () => void
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
  // Syntax-highlight fenced code (lazy; on by default).
  codeHighlight?: boolean
  themeVars?: WidgetTheme
  fetchImpl?: typeof fetch
}

export function resolvePageUrl(explicit: string | undefined): string {
  if (explicit) return explicit
  if (typeof window !== 'undefined') return window.location.href
  throw new Error('pageUrl is required outside the browser')
}

// What a vote or a reaction changes on one row. Both write one overlay (the name is kept for consumers that
// import it), so one tree pass applies both.
export type VoteOverlay = Record<string, Partial<Pick<Comment, 'score' | 'viewerVote' | 'reactions'>>>

// The reaction control's mode, as the other ports: `off` hides it, `counts` shows it read-only,
// `interactive` lets a signed-in visitor react.
export type ReactionMode = 'off' | 'counts' | 'interactive'

// Applies pending vote and reaction results to a built tree without rebuilding it. Untouched
// nodes keep their identity, so only the changed row (and its ancestors' child
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
      comment: { ...node.comment, ...patch },
      children: childrenChanged ? children : node.children,
    }
  }
  const result = nodes.map(apply)
  return changed ? result : nodes
}
