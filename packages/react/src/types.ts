import type { ViewerRole, WidgetTheme } from '@last-comments-widgets/client'
import type { TurnstileOptions } from './lib/turnstile'

export type Theme = 'light' | 'dark' | 'system'

// Comment action rendering: icon only, icon plus label, or label only.
export type ActionMode = 'icon' | 'icon-text' | 'text'

export type CommentsProps = {
  site: string
  baseUrl: string
  pageUrl?: string
  // Host-known thread id: moderator mode then addresses this page directly
  // instead of matching `pageUrl` against the site's (capped) page list.
  pageId?: string
  // Fires after a successful moderation action, lock change or moderator post,
  // so a dashboard can refresh its own thread list (counts, lock badge).
  onModerated?: () => void
  turnstileSiteKey?: string
  // Cloudflare owns the challenge box (cross-origin iframe): `theme` defaults to
  // the widget's own light/dark mode, and these are the only design knobs
  // (`size`, `appearance`, `language`). Background, border, radius and shadow
  // cannot be overridden; style the `.lc-turnstile` container instead.
  turnstileOptions?: TurnstileOptions
  limit?: number
  theme?: Theme
  themeVars?: WidgetTheme
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
  // Set this to whatever the host server enforces (default 10,000).
  bodyLimit?: number
  // Embed below the fold: hold the first fetch until the widget nears the viewport.
  lazy?: boolean
  fetchImpl?: typeof fetch
}
