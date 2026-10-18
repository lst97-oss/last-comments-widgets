import type { ViewerRole, WidgetTheme } from '@last-comments-widgets/client'

export type Theme = 'light' | 'dark' | 'system'

export type CommentsProps = {
  site: string
  baseUrl: string
  pageUrl?: string
  turnstileSiteKey?: string
  limit?: number
  theme?: Theme
  themeVars?: WidgetTheme
  signInUrl?: string
  onSignInClick?: () => void
  viewerUserId?: string
  viewerRole?: ViewerRole
  editWindowMinutes?: number
  // Embed below the fold: hold the first fetch until the widget nears the viewport.
  lazy?: boolean
  fetchImpl?: typeof fetch
}
