// Public option and handle types, and the Window augmentation for Turnstile.

import type { CommentSettings, ViewerRole, WidgetTheme } from '@last-comments-widgets/client'
import type { TurnstileOptions, TurnstileRenderParams } from '@last-comments-widgets/client/enhance'

export type Theme = 'light' | 'dark' | 'system'

// Comment action rendering: icon only, icon plus label, or label only.
export type ActionMode = 'icon' | 'icon-text' | 'text'

/**
 * Options for {@link mountComments}; every field except `site` and `baseUrl` is
 * optional. The declarative auto-mount reads the same options from `data-lc-*`
 * attributes (see the attribute list at the bottom of this module).
 */
export type MountOptions = {
  /** Site key the last-comments server registered for this host. */
  site: string
  /** Origin of the last-comments server; `/api/*` on it must be same-origin (see the module note). */
  baseUrl: string
  /** Thread identity; defaults to `window.location.href`. */
  pageUrl?: string
  /**
   * Host-known thread id: moderator mode then addresses this page directly
   * instead of matching `pageUrl` against the site's (capped) page list.
   */
  pageId?: string
  /** The site's public policy. Anything given here wins over the public settings endpoint. */
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
  /** Reply/action rendering, default `'icon-text'`. */
  actionMode?: ActionMode
  /** Max body characters, counted before trimming to match the server routes. */
  bodyLimit?: number
  /** Embed below the fold: fetch only once the widget scrolls into view. */
  lazy?: boolean
  /** Render `$…$` / `$$…$$` with KaTeX (lazy; off by default). */
  math?: boolean
  /** Render ```mermaid fences as diagrams (lazy; off by default). */
  mermaid?: boolean
  /** Syntax highlighting for fenced code (lazy; on by default). */
  codeHighlight?: boolean
  /** Custom fetch, e.g. one that rewrites requests to a same-origin proxy. */
  fetchImpl?: typeof fetch
  /** Fires after a successful moderation action, lock change or moderator post. */
  onModerated?: () => void
}

/** Handle to a mounted widget: re-fetch the thread, or tear the widget down. */
export type WidgetHandle = {
  /** Re-fetches the thread from page 1, keeping the current identity and sort. */
  refresh(): Promise<void>
  /** Removes the widget markup and its listeners, restoring the host's inline theme values. */
  destroy(): void
}

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: TurnstileRenderParams): string | null | undefined
      reset(widgetId?: string): void
      remove?(widgetId?: string): void
    }
  }
}
