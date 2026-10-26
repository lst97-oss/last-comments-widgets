import {
  type CommentSettings,
  EDIT_WINDOW_CLOSED,
  isEditWindowOpen,
  resolveEditWindow,
  type ThreadNode,
  type ViewerOptions,
  type ViewerRole,
  type VoteValue,
  type WidgetTheme,
} from '@last-comments-widgets/client'
import type { TurnstileOptions } from './lib/turnstile'

export { canModerate } from '@last-comments-widgets/client'

export type Theme = 'light' | 'dark' | 'system'

/** Comment action rendering: icon only, icon plus label, or label only. */
export type ActionMode = 'icon' | 'icon-text' | 'text'

/**
 * Props for the Vue `Comments` component; templates pass them kebab-cased
 * (`turnstile-site-key`, `theme-vars`, …).
 *
 * Import the compiled stylesheet next to the component —
 * `import '@lst97-oss/last-comments-widgets/vue/styles.css'` — and make
 * `/api/*` reachable on the host's origin: the API sends no
 * `Access-Control-Allow-Credentials`, so a cross-origin embed cannot list,
 * post or vote.
 */
export type CommentsProps = {
  /** Site key the last-comments server registered for this host. */
  site: string
  /** Origin of the last-comments server; `/api/*` on it must be same-origin (see the type note). */
  baseUrl: string
  /** Thread identity; defaults to `window.location.href`. */
  pageUrl?: string
  /**
   * Host-known thread id: moderator mode then addresses this page directly
   * instead of matching `pageUrl` against the site's (capped) page list.
   */
  pageId?: string
  /**
   * The site's public policy. Anything given here wins over the public settings endpoint.
   */
  settings?: Partial<CommentSettings>
  /** Public Cloudflare Turnstile key for guest posting; without it guests solve no challenge. */
  turnstileSiteKey?: string
  /**
   * Cloudflare owns the challenge box (cross-origin iframe): `theme` defaults to
   * the widget's own light/dark mode, and these are the only design knobs
   * (`size`, `appearance`, `language`). Background, border, radius and shadow
   * cannot be overridden; style the `.lc-turnstile` container instead.
   */
  turnstileOptions?: TurnstileOptions
  /** Top-level threads per page (default 20); a thread's replies come with it. */
  limit?: number
  /** `'system'` (default) follows the OS preference. */
  theme?: Theme
  /** Per-instance design-token overrides; see `WidgetTheme`. */
  themeVars?: WidgetTheme
  /**
   * Host-owned sign-in page for `login`/`private` sites. Without it the widget
   * starts the API's OAuth flow in place.
   */
  signInUrl?: string
  /** Fallback viewer identity when the session probe cannot answer (no same-origin proxy). */
  viewerUserId?: string
  /** `'admin'` turns on the moderation UI; the server authorizes every call. */
  viewerRole?: ViewerRole
  /**
   * Guest-authored comments may be edited for this many minutes from this
   * browser (default 10; 0 = unlimited). Signed-in authors have no window.
   */
  anonEditWindowMinutes?: number
  /** Reply/Edit/Delete (and moderator) action rendering, default `'icon-text'`. */
  actionMode?: ActionMode
  /** Max body characters, counted before trimming. Overrides the site's own limit when set. */
  bodyLimit?: number
  /** Embed below the fold: hold the first fetch until the widget nears the viewport. */
  lazy?: boolean
  /** Render `$…$` / `$$…$$` with KaTeX (lazy; off by default). */
  math?: boolean
  /** Render ```mermaid fences as diagrams (lazy; off by default). */
  mermaid?: boolean
  /** Syntax-highlight fenced code (lazy; on by default; React only until the ports are migrated). */
  codeHighlight?: boolean
  /** Custom fetch, e.g. one that rewrites requests to a same-origin proxy. */
  fetchImpl?: typeof fetch
}

/** Props for the Vue `CommentViewer` component; templates pass them kebab-cased. */
export type CommentViewerProps = ViewerOptions & {
  /** Embed below the fold: hold the first fetch until the viewer nears the viewport. */
  lazy?: boolean
  /** Where a signed-out visitor goes to sign in on a private site. Without it the OAuth flow starts. */
  signInUrl?: string
}

export type Commentupdater = (id: string, patch: { score?: number; viewerVote?: VoteValue | null }) => void

export type EditGateOptions = {
  // Window for guest-authored comments; signed-in owners have no window.
  anonWindowMinutes?: number
  // A guest owns the comment only while this browser still holds its edit key.
  hasEditKey?: boolean
}

export function resolvePageUrl(explicit: string | undefined): string {
  if (explicit) return explicit
  if (typeof window !== 'undefined') return window.location.href
  throw new Error('pageUrl is required outside the browser')
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

export function toggleVoteValue(current: VoteValue | null, next: VoteValue): 'clear' | VoteValue {
  return current === next ? 'clear' : next
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
