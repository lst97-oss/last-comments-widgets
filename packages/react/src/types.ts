import type { CommentSettings, ViewerRole, WidgetTheme } from '@last-comments-widgets/client'
import type { TurnstileOptions } from './lib/turnstile'

export type Theme = 'light' | 'dark' | 'system'

/** Comment action rendering: icon only, icon plus label, or label only. */
export type ActionMode = 'icon' | 'icon-text' | 'text'

/**
 * Props for the React `Comments` widget.
 *
 * Import the compiled stylesheet next to the component —
 * `import '@lst97-oss/last-comments-widgets/react/styles.css'` — and make
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
   * Fires after a successful moderation action, lock change or moderator post,
   * so a dashboard can refresh its own thread list (counts, lock badge).
   */
  onModerated?: () => void
  /**
   * The site's public policy (access, length limit, edit window, Turnstile key). Anything given here
   * wins over the public settings endpoint; anything left out is read from it, once per site.
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
  /** Replaces that sign-in action with the host's own (for example, open a modal). */
  onSignInClick?: () => void
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
  /**
   * Max body characters, counted before trimming to match the server routes.
   * Set this to whatever the host server enforces (default 10,000).
   */
  bodyLimit?: number
  /** Embed below the fold: hold the first fetch until the widget nears the viewport. */
  lazy?: boolean
  /** Render `$…$` / `$$…$$` with KaTeX (lazy; off by default). */
  math?: boolean
  /** Render ```mermaid fences as diagrams (lazy; off by default). */
  mermaid?: boolean
  /** Syntax-highlight fenced code (lazy; on by default). */
  codeHighlight?: boolean
  /** Custom fetch, e.g. one that rewrites requests to a same-origin proxy. */
  fetchImpl?: typeof fetch
}
