// Reads data-lc-* attributes and mounts the widgets they describe.

import type { ThemeVars, WidgetTheme } from '@last-comments-widgets/client'
import { THEME_CSS_VARIABLES, THEME_VAR_VALUES } from '@last-comments-widgets/client'
import type { TurnstileOptions } from '@last-comments-widgets/client/enhance'
import { mountComments } from './mount'
import type { ActionMode, Theme } from './types'
import { renderCommentViewer } from './viewer'

// Kebab attr suffix → ThemeVars key. Curated to the allowlist so typos
// and internal tokens never become inline styles.
const THEME_ATTR_KEYS = new Map(
  Object.keys(THEME_CSS_VARIABLES).map((key) => [
    key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
    key as keyof ThemeVars,
  ]),
)

// DOM-free so bun test covers it without a browser: entries are
// [attrName, attrValue] pairs straight from `node.attributes`.
export function parseThemeAttrs(attrs: [string, string][]): WidgetTheme | undefined {
  // Collected flat, then narrowed to ThemeVars: the key is a union, so a
  // per-key assignment cannot be type-checked in place.
  const vars: Record<string, string> = {}
  const dark: Record<string, string> = {}
  for (const [name, value] of attrs) {
    const light = name.startsWith('data-lc-theme-var-')
    const darkAttr = name.startsWith('data-lc-theme-dark-var-')
    if (!light && !darkAttr) continue
    const key = THEME_ATTR_KEYS.get(name.slice((light ? 'data-lc-theme-var-' : 'data-lc-theme-dark-var-').length))
    if (!key) continue
    // Host attributes are untrusted: a value outside a closed set is dropped so
    // the documented default applies.
    const allowed = THEME_VAR_VALUES[key as keyof typeof THEME_VAR_VALUES]
    if (allowed && !(allowed as readonly string[]).includes(value)) continue
    ;(light ? vars : dark)[key] = value
  }
  if (Object.keys(vars).length === 0 && Object.keys(dark).length === 0) return undefined
  return { vars: vars as ThemeVars, dark: dark as ThemeVars }
}

// Host attributes are untrusted: text that is not a number at or above `min` leaves the option unset, so the
// documented default applies.
export function parseHostNumber(raw: string | null, parse: (raw: string) => number, min: number): number | undefined {
  if (raw === null) return undefined
  const value = parse(raw)
  return Number.isFinite(value) && value >= min ? value : undefined
}

function readActionMode(node: HTMLElement): ActionMode | undefined {
  const raw = node.getAttribute('data-lc-action-mode')
  return raw === 'icon' || raw === 'icon-text' || raw === 'text' ? raw : undefined
}

// Cloudflare knobs for the declarative embed; invalid values are ignored and
// the object is omitted entirely when no attribute is present.
function readTurnstileOptions(node: HTMLElement): TurnstileOptions | undefined {
  const options: TurnstileOptions = {}
  const theme = node.getAttribute('data-lc-turnstile-theme')
  if (theme === 'auto' || theme === 'light' || theme === 'dark') options.theme = theme
  const size = node.getAttribute('data-lc-turnstile-size')
  if (size === 'normal' || size === 'compact' || size === 'flexible') options.size = size
  const appearance = node.getAttribute('data-lc-turnstile-appearance')
  if (appearance === 'always' || appearance === 'interaction-only') options.appearance = appearance
  const language = node.getAttribute('data-lc-turnstile-language')
  if (language) options.language = language
  return Object.keys(options).length > 0 ? options : undefined
}

/**
 * Declarative mount for hosts that load the bundle without calling the API.
 *
 * `[data-lc-comments]` mounts {@link mountComments} and `[data-lc-viewer]`
 * mounts {@link renderCommentViewer}; both take their options from attributes:
 * `data-lc-site`, `data-lc-base-url`, `data-lc-page-url`, `data-lc-limit`,
 * `data-lc-theme`, `data-lc-sign-in-url`, `data-lc-viewer-user-id`,
 * `data-lc-viewer-role`, `data-lc-anon-edit-window-minutes`,
 * `data-lc-action-mode`, `data-lc-body-limit`, the boolean flags
 * `data-lc-lazy`, `data-lc-math`, `data-lc-mermaid`,
 * `data-lc-no-code-highlight`, the Turnstile knobs `data-lc-turnstile`,
 * `data-lc-turnstile-theme`, `data-lc-turnstile-size`,
 * `data-lc-turnstile-appearance`, `data-lc-turnstile-language`, and the theme
 * tokens `data-lc-theme-var-*` / `data-lc-theme-dark-var-*`.
 * `site` and `turnstile` may also be set once on the `<script>` tag. Invalid
 * values are ignored. `pageId`, `settings`, `fetchImpl`, `onModerated` and
 * `onSignInClick` have no attribute — call the mount functions for those.
 */
export function autoMount() {
  if (typeof document === 'undefined') return
  for (const node of document.querySelectorAll<HTMLElement>('[data-lc-comments]')) {
    if (node.hasAttribute('data-lc-mounted')) continue
    const site = node.getAttribute('data-lc-site') ?? document.currentScript?.getAttribute('data-lc-site') ?? ''
    const baseUrl = node.getAttribute('data-lc-base-url') ?? ''
    if (!site || !baseUrl) continue
    const viewerRoleAttr = node.getAttribute('data-lc-viewer-role')
    node.setAttribute('data-lc-mounted', 'true')
    mountComments(node, {
      site,
      baseUrl,
      pageUrl: node.getAttribute('data-lc-page-url') ?? undefined,
      turnstileSiteKey:
        node.getAttribute('data-lc-turnstile') ??
        document.currentScript?.getAttribute('data-lc-turnstile') ??
        undefined,
      turnstileOptions: readTurnstileOptions(node),
      limit: parseHostNumber(node.getAttribute('data-lc-limit'), Number.parseInt, 1),
      theme: (node.getAttribute('data-lc-theme') as Theme | null) ?? undefined,
      signInUrl: node.getAttribute('data-lc-sign-in-url') ?? undefined,
      viewerUserId: node.getAttribute('data-lc-viewer-user-id') ?? undefined,
      viewerRole: viewerRoleAttr === 'admin' ? viewerRoleAttr : undefined,
      anonEditWindowMinutes: parseHostNumber(
        node.getAttribute('data-lc-anon-edit-window-minutes'),
        Number.parseFloat,
        0,
      ),
      actionMode: readActionMode(node),
      bodyLimit: parseHostNumber(node.getAttribute('data-lc-body-limit'), Number.parseInt, 0),
      lazy: node.hasAttribute('data-lc-lazy'),
      math: node.hasAttribute('data-lc-math'),
      mermaid: node.hasAttribute('data-lc-mermaid'),
      codeHighlight: !node.hasAttribute('data-lc-no-code-highlight'),
      themeVars: parseThemeAttrs(Array.from(node.attributes, (a) => [a.name, a.value] as [string, string])),
    })
  }

  for (const node of document.querySelectorAll<HTMLElement>('[data-lc-viewer]')) {
    if (node.hasAttribute('data-lc-mounted')) continue
    const site = node.getAttribute('data-lc-site') ?? document.currentScript?.getAttribute('data-lc-site') ?? ''
    const baseUrl = node.getAttribute('data-lc-base-url') ?? ''
    if (!site || !baseUrl) continue
    node.setAttribute('data-lc-mounted', 'true')
    renderCommentViewer(node, {
      site,
      baseUrl,
      pageUrl: node.getAttribute('data-lc-page-url') ?? undefined,
      limit: parseHostNumber(node.getAttribute('data-lc-limit'), Number.parseInt, 1),
      theme: (node.getAttribute('data-lc-theme') as Theme | null) ?? undefined,
      signInUrl: node.getAttribute('data-lc-sign-in-url') ?? undefined,
      lazy: node.hasAttribute('data-lc-lazy'),
      math: node.hasAttribute('data-lc-math'),
      mermaid: node.hasAttribute('data-lc-mermaid'),
      codeHighlight: !node.hasAttribute('data-lc-no-code-highlight'),
      themeVars: parseThemeAttrs(Array.from(node.attributes, (a) => [a.name, a.value] as [string, string])),
    })
  }
}
