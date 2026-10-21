export type { ThemeVars, WidgetTheme } from '@last-comments-widgets/client'

import type {
  Comment,
  ErrorInfo,
  LastCommentsClient,
  ModerationAction,
  ThemeVars,
  ThreadGuideItem,
  ThreadNode,
  ThreadSort,
  ViewerOptions,
  ViewerRole,
  ViewerSession,
  VoteValue,
  WidgetTheme,
} from '@last-comments-widgets/client'
import {
  ApiError,
  beginOAuthSignIn,
  buildCommentTree,
  buildThreadGuidePath,
  canModerate,
  collectThreadParticipants,
  createClient,
  DEFAULT_ANON_EDIT_WINDOW_MINUTES,
  DEFAULT_BODY_LIMIT,
  describeError,
  EDIT_WINDOW_CLOSED,
  fetchViewerSession,
  foldReplySummary,
  forgetEditKey,
  formatRelativeTime,
  getEditKey,
  isEditWindowOpen,
  loadThreadWindow,
  moderationCommentToComment,
  normalizePageUrl,
  renderMarkdown,
  resolveEditWindow,
  safeUrl,
  saveEditKey,
  signOutViewerSession,
  sortCommentRoots,
  THEME_CSS_VARIABLES,
  THEME_VAR_VALUES,
  themeVarsToStyle,
} from '@last-comments-widgets/client'

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
export function resolveTurnstileConfig(dark: boolean, options?: TurnstileOptions): TurnstileRenderConfig {
  const config: TurnstileRenderConfig = { theme: options?.theme ?? (dark ? 'dark' : 'light') }
  if (options?.size !== undefined) config.size = options.size
  if (options?.appearance !== undefined) config.appearance = options.appearance
  if (options?.language !== undefined) config.language = options.language
  return config
}

export type MountOptions = {
  site: string
  baseUrl: string
  pageUrl?: string
  // Host-known thread id: moderator mode then addresses this page directly
  // instead of matching `pageUrl` against the site's (capped) page list.
  pageId?: string
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
  viewerUserId?: string
  viewerRole?: ViewerRole
  // Guest-authored comments may be edited for this many minutes from this
  // browser (default 10; 0 = unlimited). Signed-in authors have no window.
  anonEditWindowMinutes?: number
  // Reply/action rendering, default 'icon-text'.
  actionMode?: ActionMode
  // Max body characters, counted before trimming to match the server routes.
  bodyLimit?: number
  /** Embed below the fold: fetch only once the widget scrolls into view. */
  lazy?: boolean
  fetchImpl?: typeof fetch
  /** Fires after a successful moderation action, lock change or moderator post. */
  onModerated?: () => void
}

export type WidgetHandle = {
  destroy(): void
  refresh(): Promise<void>
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

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// The one error block for every surface; copy comes from the client's
// describeError, this only owns the markup.
const ERROR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mt-px size-4 shrink-0"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`

// Local guards, not server failures: they have nothing to retry.
const INVALID_BODY: ErrorInfo = {
  code: null,
  title: "That didn't work",
  message: 'Please write a comment first.',
  action: 'none',
}
const INVALID_REPLY: ErrorInfo = { ...INVALID_BODY, message: 'Please write a reply first.' }

export function errorMarkup(info: ErrorInfo, opts: { signInUrl?: string; retryAction?: string } = {}): string {
  const signInUrl = safeUrl(opts.signInUrl)
  const action =
    info.action === 'retry'
      ? `<button type="button" data-action="${escapeHtml(opts.retryAction ?? 'error-retry')}" class="rounded-md border border-border px-2.5 py-1 text-sm font-medium hover:bg-accent">Try again</button>`
      : info.action === 'sign-in'
        ? signInUrl
          ? `<a href="${escapeHtml(signInUrl)}" class="rounded-md bg-primary px-2.5 py-1 text-sm font-medium text-primary-foreground">Sign in</a>`
          : '<button type="button" data-action="error-sign-in" class="rounded-md bg-primary px-2.5 py-1 text-sm font-medium text-primary-foreground">Sign in</button>'
        : ''
  return `<div role="alert" data-lc-error data-error-code="${escapeHtml(info.code ?? '')}" class="lc-error flex items-start gap-2 rounded-lg border bg-card px-2.5 py-2 text-left text-sm text-destructive">
  ${ERROR_ICON}
  <div class="min-w-0 flex-1">
    <p class="font-medium">${escapeHtml(info.title)}</p>
    <p class="mt-0.5 text-destructive/90">${escapeHtml(info.message)}</p>
    ${action ? `<div class="mt-2 flex flex-wrap items-center gap-2">${action}</div>` : ''}
  </div>
</div>`
}

// Lucide path data, inlined: the vanilla port ships no icon dependency.
// The paths are the upstream lucide ones, so every port draws the same glyph.
const ICONS: Record<string, string> = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  'ellipsis-vertical': '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  'pen-line':
    '<path d="M13 21h8"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  trash:
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':
    '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  'pin-off':
    '<path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/><path d="m2 2 20 20"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="M4.929 4.929 19.07 19.071"/>',
  'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
  reply: '<path d="M20 18v-2a4 4 0 0 0-4-4H4"/><path d="m9 17-5-5 5-5"/>',
  'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  'arrow-down': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  bold: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
  italic:
    '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
  quote:
    '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  'code-xml': '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
  link: '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
  list: '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
  'list-ordered':
    '<path d="M11 5h10"/><path d="M11 12h10"/><path d="M11 19h10"/><path d="M4 4h1v5"/><path d="M4 9h2"/><path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-up': '<path d="m18 15-6-6-6 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
}

function icon(name: string, className = ''): string {
  // The width/height attributes mirror lucide's own output, so an icon that
  // carries no size class still paints at the same 24px box as the other ports.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${className ? ` class="${className}"` : ''}>${ICONS[name] ?? ''}</svg>`
}

// React's `buttonVariants`, spelled out: BASE plus the variants and sizes this
// port renders. React merges the base icon size away with cva/tailwind-merge,
// so a caller here puts the size class on the icon itself.
const BTN =
  "lc-button group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
const BTN_PRIMARY = 'bg-primary text-primary-foreground hover:bg-primary/80'
const BTN_GHOST =
  'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50'
const BTN_OUTLINE =
  'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50'
const BTN_SECONDARY =
  'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground'
const BTN_DEFAULT = 'h-8 gap-1.5 px-2.5'
const BTN_ICON_XS = 'size-6 rounded-[min(var(--radius-md),10px)]'
const BTN_ICON_SM = 'size-7 rounded-[min(var(--radius-md),12px)]'
const BTN_XS = 'h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs'
const BTN_SM = 'h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[length:calc(var(--lc-font-size,1rem)*0.8)]'

const MENU_ITEM_CLASS =
  "lc-action flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
// Destructive entries (delete) take the alarm colour instead of the action tone.
const MENU_ITEM_DESTRUCTIVE_CLASS = `${MENU_ITEM_CLASS} lc-action-destructive`
// React's PopoverContent: a dialog panel (not a menu), portaled into the root.
const ACTIONS_MENU_CLASS =
  'lc-actions-menu fixed z-50 flex w-auto min-w-36 flex-col rounded-lg bg-popover p-1 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none'
// React's DropdownMenuContent: a menu panel, also portaled into the root.
const IDENTITY_MENU_CLASS =
  'lc-identity-menu fixed z-50 min-w-32 overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none'
const IDENTITY_ITEM_COMMON =
  "lc-identity-item relative flex cursor-default items-center gap-1.5 rounded-md text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
const IDENTITY_RADIO_ITEM_CLASS = `${IDENTITY_ITEM_COMMON} py-1 pr-8 pl-1.5`
const IDENTITY_ITEM_CLASS = `${IDENTITY_ITEM_COMMON} px-1.5 py-1`

const BADGE =
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all [&>svg]:pointer-events-none [&>svg]:size-3!'
const BADGE_VARIANTS = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  destructive: 'bg-destructive/10 text-destructive',
  outline: 'border-border text-foreground',
} as const

function badge(variant: keyof typeof BADGE_VARIANTS, className: string, inner: string): string {
  return `<span class="${BADGE} ${BADGE_VARIANTS[variant]}${className ? ` ${className}` : ''}">${inner}</span>`
}

// Mirror of the React editGate: signed-in owners edit any time; a guest owns the
// comment only while this browser still holds its key, inside the anon window.
export function canEditComment(
  comment: { userId?: string | null; createdAt: string },
  viewerUserId?: string,
  options: { anonWindowMinutes?: number; hasEditKey?: boolean } = {},
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

function voteButtonClass(active: boolean): string {
  return `${BTN} ${BTN_SM} ${active ? BTN_PRIMARY : BTN_GHOST}`
}

function voteButton(comment: Comment, value: VoteValue, label: string, glyph: string): string {
  const active = comment.viewerVote === value
  return `<button type="button" data-action="vote" data-comment-id="${escapeHtml(comment.id)}" data-value="${value}" aria-pressed="${active}" aria-label="${label}" class="${voteButtonClass(active)}">${icon(glyph, 'size-3.5')}</button>`
}

type RowParts = { body: string; initials: string; avatar: string | null }
// Markdown and avatars only change when the row object changes: a vote patch or
// a reload creates new objects, so a WeakMap keeps repaints cheap.
const rowPartsCache = new WeakMap<Comment, RowParts>()

function commentParts(comment: Comment): RowParts {
  let parts = rowPartsCache.get(comment)
  if (!parts) {
    parts = {
      body: renderMarkdown(comment.bodyMarkdown),
      initials: initials(comment.authorName),
      avatar: safeUrl(comment.avatarUrl) ?? null,
    }
    rowPartsCache.set(comment, parts)
  }
  return parts
}

function avatarMarkup(name: string, avatarUrl: string | null, size: 'sm' | 'default' = 'sm'): string {
  const box = size === 'sm' ? 'size-6' : 'size-8'
  const fallback = size === 'sm' ? 'text-xs' : 'text-sm'
  const image = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="aspect-square size-full rounded-full object-cover" />`
    : `<span class="flex size-full items-center justify-center rounded-full bg-muted ${fallback} text-muted-foreground" aria-hidden="true">${escapeHtml(initials(name))}</span>`
  return `<span data-slot="avatar" data-size="${size}" class="lc-avatar relative flex ${box} shrink-0 rounded-full select-none">${image}</span>`
}

// Folded-group summary: who is inside the group, so a hidden group still shows
// its participants. Moderated authors are counted in the label, not marked here.
function replyStack(children: ThreadNode[]): string {
  const participants = collectThreadParticipants(children)
  const visible = participants.slice(0, 3)
  const extra = participants.length - visible.length
  const discs = visible
    .map((participant) => avatarMarkup(participant.name, safeUrl(participant.avatarUrl) ?? null))
    .join('')
  const count =
    extra > 0
      ? `<span data-slot="avatar-group-count" class="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground ring-2 ring-background">+${extra}</span>`
      : ''
  return `<div data-slot="avatar-group" class="lc-reply-stack flex -space-x-2 [&>*]:ring-2 [&>*]:ring-background">${discs}${count}</div>`
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

// Pure text transforms so bun test covers the toolbar without a browser.
export function insertWrap(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder = 'text',
): { value: string; start: number; end: number } {
  const selected = value.slice(start, end) || placeholder
  return {
    value: `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`,
    start: start + before.length,
    end: start + before.length + selected.length,
  }
}

export function insertPrefix(
  value: string,
  start: number,
  end: number,
  prefix: string,
  placeholder = 'item',
): { value: string; start: number; end: number } {
  const selected = value.slice(start, end) || placeholder
  const lines = selected.split('\n')
  const inserted = `${prefix}${lines.join(`\n${prefix}`)}`
  return {
    value: `${value.slice(0, start)}${inserted}${value.slice(end)}`,
    start: start + prefix.length,
    end: start + inserted.length,
  }
}

export type CommentNodeOptions = {
  replyTo?: string | null
  turnstileSiteKey?: string
  guest?: boolean
  viewerUserId?: string
  viewerRole?: ViewerRole
  // Per-row slot state (editor, reply, collapse), keyed by comment id.
  items?: Record<string, ItemState>
  anonWindowMinutes?: number
  actionMode?: ActionMode
  bodyLimit?: number
  readOnly?: boolean
  pendingModeration?: Record<string, boolean>
  submitDisabled?: boolean
  // Host-level flag (page locked); hidden/deleted rows hide votes regardless.
  hideVotes?: boolean
  parentAuthorName?: string
}

// The ⋮ menu: secondary actions live behind it so a comment reads as content
// first. Reply stays outside — it is the one action worth a permanent target.
// React renders the panel as a dialog popover portaled into the widget root, so
// the entries keep no menu role and the panel is mounted only while open.
function actionEntries(
  comment: Comment,
  ctx: {
    canEdit: boolean
    editing: boolean
    isOwn: boolean
    viewerRole?: ViewerRole
    pending: boolean
  },
): string[] {
  const { canEdit, editing, isOwn, viewerRole, pending } = ctx
  const id = escapeHtml(comment.id)
  const entry = (attrs: string, iconName: string, label: string, destructive = false) =>
    `<button type="button" ${attrs} class="${destructive ? MENU_ITEM_DESTRUCTIVE_CLASS : MENU_ITEM_CLASS}">${icon(iconName)}${label}</button>`
  const entries: string[] = []
  if (canEdit && !editing) entries.push(entry(`data-action="menu-edit" data-comment-id="${id}"`, 'pencil', 'Edit'))
  // Delete is soft (status 'deleted', restorable by a moderator), so the menu
  // entry acts immediately instead of asking for confirmation.
  if (isOwn && !viewerRole && !editing)
    entries.push(entry(`data-action="delete" data-comment-id="${id}"`, 'trash', 'Delete', true))
  if (viewerRole) {
    const disabled = pending ? ' disabled' : ''
    entries.push(
      comment.status === 'visible'
        ? entry(
            `data-action="moderate" data-moderation-action="hide" data-comment-id="${id}"${disabled}`,
            'eye-off',
            'Hide',
          )
        : entry(
            `data-action="moderate" data-moderation-action="restore" data-comment-id="${id}"${disabled}`,
            'eye',
            'Restore',
          ),
    )
    if (comment.status === 'visible')
      entries.push(
        comment.pinnedAt
          ? entry(
              `data-action="moderate" data-moderation-action="unpin" data-comment-id="${id}"${disabled}`,
              'pin-off',
              'Unpin',
            )
          : entry(
              `data-action="moderate" data-moderation-action="pin" data-comment-id="${id}"${disabled}`,
              'pin',
              'Pin',
            ),
      )
    if (comment.status !== 'deleted')
      entries.push(
        entry(
          `data-action="moderate" data-moderation-action="delete" data-comment-id="${id}"${disabled}`,
          'trash',
          'Delete',
          true,
        ),
      )
    if (comment.userId)
      entries.push(
        comment.userBlocked
          ? entry(`data-action="block-user" data-comment-id="${id}"${disabled}`, 'circle-check', 'Unblock user')
          : entry(`data-action="block-user" data-comment-id="${id}"${disabled}`, 'ban', 'Block user'),
      )
  }
  return entries
}

function actionsTrigger(comment: Comment, entries: string[]): string {
  if (entries.length === 0) return ''
  return `<button type="button" data-action="menu-toggle" data-comment-id="${escapeHtml(comment.id)}" aria-haspopup="dialog" aria-expanded="false" aria-label="More actions" class="lc-action lc-actions-trigger ${BTN} ${BTN_GHOST} ${BTN_ICON_XS}">${icon('ellipsis-vertical', 'size-3')}</button>`
}

// The popover panel's entries. React mounts the panel only while it is open,
// so the vanilla port builds it on demand too: the row keeps just the trigger.
export function actionsMenuMarkup(
  comment: Comment,
  ctx: {
    canEdit: boolean
    editing: boolean
    isOwn: boolean
    viewerRole?: ViewerRole
    pending: boolean
  },
): string {
  return actionEntries(comment, ctx).join('')
}

// Reply group: hand-rolled disclosure (no popover/`@starting-style` in the
// supported baseline) whose panel keeps the `data-slot` the guide measurement
// clips rows against.
function replyGroup(node: ThreadNode, depth: number, options: CommentNodeOptions): string {
  const { comment, children } = node
  const summary = foldReplySummary(children)
  const label = `${summary.count} ${summary.count === 1 ? 'reply' : 'replies'}`
  // Statuses only exist for moderators: the public list returns visible rows.
  const states = options.viewerRole
    ? [
        summary.pinned > 0 ? `${summary.pinned} pinned` : '',
        summary.hidden > 0 ? `${summary.hidden} hidden` : '',
        summary.deleted > 0 ? `${summary.deleted} deleted` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
  const panelId = `lc-replies-${comment.id}`
  const nested = children
    .map((child) => renderCommentNode(child, depth + 1, { ...options, parentAuthorName: comment.authorName }))
    .join('')
  return `<div class="mt-2 flex w-full flex-col" data-lc-replies="">
      <div class="border-0">
        <div style="padding-inline-start: 16px">
          <button type="button" data-action="replies-toggle" aria-expanded="true" aria-controls="${escapeHtml(panelId)}" class="lc-replies-trigger relative flex w-full items-center justify-between rounded-lg border border-transparent py-1 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <span data-lc-replies-folded class="hidden"><span class="flex min-w-0 items-center gap-2">${replyStack(children)}<span class="truncate text-xs">${label}</span>${states ? `<span class="hidden truncate text-xs sm:inline">${states}</span>` : ''}</span></span>
            <span data-lc-replies-open class="text-xs">Hide ${label}</span>
            ${icon('chevron-down', 'ml-auto hidden size-4 shrink-0 text-muted-foreground')}${icon('chevron-up', 'ml-auto size-4 shrink-0 text-muted-foreground')}
          </button>
          <div id="${escapeHtml(panelId)}" data-slot="accordion-content" data-state="open" class="grid grid-rows-[1fr]">
            <div class="min-h-0 overflow-clip"><div class="grid grid-cols-1 gap-4 pt-1">${nested}</div></div>
          </div>
        </div>
      </div>
    </div>`
}

// A removed comment keeps its place in the thread: a deleted row is anonymised
// like Reddit, a hidden row says it is under review. Replies stay visible.
function renderPlaceholder(node: ThreadNode, depth: number, options: CommentNodeOptions): string {
  const { comment, children } = node
  const deleted = comment.status === 'deleted'
  const id = escapeHtml(comment.id)
  const author = deleted
    ? '<span class="text-sm text-muted-foreground">[deleted]</span>'
    : `${avatarMarkup(comment.authorName, safeUrl(comment.avatarUrl) ?? null)}<span class="min-w-0 truncate font-medium">${escapeHtml(comment.authorName)}</span>`
  const caption =
    depth > 0 && options.parentAuthorName && !deleted
      ? `<p class="mt-1 text-xs text-muted-foreground">Replying to <span class="font-medium text-foreground">@${escapeHtml(options.parentAuthorName)}</span></p>`
      : ''
  const body = deleted ? '[deleted]' : 'This comment is under review.'
  return `<article class="lc-comment${depth > 0 ? ' lc-reply' : ''}" data-depth="${depth}" data-comment-id="${id}" data-comment-depth="${depth}" data-lc-placeholder="${deleted ? 'deleted' : 'under-review'}">
  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
    ${author}
    <time datetime="${escapeHtml(comment.createdAt)}" title="${escapeHtml(new Date(comment.createdAt).toLocaleString())}" class="text-xs text-muted-foreground">${escapeHtml(formatRelativeTime(comment.createdAt))}</time>
  </div>
  ${caption}
  <p class="my-3 text-sm text-muted-foreground">${body}</p>
  ${children.length > 0 ? replyGroup(node, depth, options) : ''}
</article>`
}

export function renderCommentNode(node: ThreadNode, depth: number, options: CommentNodeOptions = {}): string {
  const { comment, children } = node
  const {
    replyTo = null,
    turnstileSiteKey,
    guest = true,
    viewerUserId,
    viewerRole,
    items = {},
    anonWindowMinutes,
    actionMode = 'icon-text',
    bodyLimit = DEFAULT_BODY_LIMIT,
    readOnly = false,
    pendingModeration,
    submitDisabled = false,
    parentAuthorName,
  } = options
  // Removed comments read as placeholders in the normal view; moderators keep
  // the body so they can still judge a restore.
  if (!viewerRole && comment.status !== 'visible') return renderPlaceholder(node, depth, options)
  const item = items[comment.id] ?? ITEM_INITIAL
  const { editing, saving, editError, replying, replyError, collapsedOverride } = item
  const id = escapeHtml(comment.id)
  const isOwn = Boolean(viewerUserId && comment.userId && viewerUserId === comment.userId)
  const canEdit = canEditComment(comment, viewerUserId, {
    anonWindowMinutes,
    hasEditKey: getEditKey(comment.id) !== null,
  })
  const moderationPending = pendingModeration?.[comment.id] ?? false
  const canReplyHere = !(viewerRole && comment.status !== 'visible')
  // The host hides votes list-wide (locked page) and hidden/deleted rows never
  // offer them: voting is rejected in both cases.
  const hideVotes = Boolean(options.hideVotes) || (Boolean(viewerRole) && comment.status !== 'visible')
  // Negative net score collapses in every sort mode; 0 stays expanded.
  const collapsed = collapsedOverride ?? comment.score < 0
  const parts = commentParts(comment)
  const score = readOnly
    ? `<span class="text-sm text-muted-foreground">${escapeHtml(String(comment.score))}</span>`
    : `${voteButton(comment, 1, 'Upvote', 'arrow-up')}
      <span class="min-w-6 text-center text-sm text-muted-foreground" aria-live="polite">${escapeHtml(String(comment.score))}</span>
      ${voteButton(comment, -1, 'Downvote', 'arrow-down')}`
  const flags = [
    comment.editedAt
      ? `<span class="text-xs text-muted-foreground" title="${escapeHtml(new Date(comment.editedAt).toLocaleString())}">edited</span>`
      : '',
    comment.pinnedAt ? '<span class="text-xs text-muted-foreground">pinned</span>' : '',
    comment.status === 'hidden' ? badge('destructive', '', 'hidden') : '',
    comment.status === 'deleted' ? badge('secondary', '', 'deleted') : '',
  ].join('')
  const editor =
    !readOnly && editing
      ? `<div class="my-3">${renderForm({
          formId: `edit-${comment.id}`,
          initialBody: comment.bodyMarkdown,
          submitLabel: 'Save',
          bodyLimit,
          pending: saving,
          error: editError,
          cancelLabel: 'Cancel',
        })}</div>`
      : ''
  const replyForm =
    !readOnly && !editing && replyTo === comment.id
      ? `<div class="my-3">${renderForm({
          parentId: comment.id,
          turnstileSiteKey,
          guest,
          formId: `reply-${comment.id}`,
          bodyLimit,
          pending: replying,
          error: replyError,
          submitDisabled,
        })}</div>`
      : ''
  // One slot at a time: the editor replaces the body, and so does an open reply.
  const body =
    editing || (!readOnly && replyTo === comment.id)
      ? ''
      : `<div class="lc-markdown my-3 font-sans text-sm">${parts.body}</div>`
  const replyAction =
    readOnly || !canReplyHere
      ? ''
      : `<button type="button" data-action="reply" data-comment-id="${id}" aria-expanded="${replyTo === comment.id}" ${actionMode === 'icon' ? 'aria-label="Reply"' : ''} class="lc-action ${BTN} ${BTN_GHOST} ${actionMode === 'icon' ? BTN_ICON_XS : BTN_XS}">${actionMode !== 'text' ? icon('reply', 'size-3') : ''}<span class="${actionMode === 'icon' ? 'sr-only' : ''}">Reply</span></button>`
  const folded =
    children.length > 0
      ? (() => {
          const summary = foldReplySummary(children)
          const label = `${summary.count} ${summary.count === 1 ? 'reply' : 'replies'}`
          const states = viewerRole
            ? [
                summary.pinned > 0 ? `${summary.pinned} pinned` : '',
                summary.hidden > 0 ? `${summary.hidden} hidden` : '',
                summary.deleted > 0 ? `${summary.deleted} deleted` : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : ''
          return `${replyStack(children)}<span class="truncate">${label}</span>${states ? `<span class="hidden truncate sm:inline">${states}</span>` : ''}`
        })()
      : `<span>comment hidden</span><span class="truncate">${escapeHtml(comment.bodyMarkdown.replace(/\s+/g, ' ').trim())}</span>`
  const caption =
    depth > 0 && parentAuthorName
      ? `<p class="mt-1 text-xs text-muted-foreground">Replying to <span class="font-medium text-foreground">@${escapeHtml(parentAuthorName)}</span></p>`
      : ''
  const expanded = `${caption}
  ${editor}${replyForm}${body}
  ${readOnly ? '' : `<div class="flex flex-wrap items-center gap-1 text-sm">${replyAction}</div>`}
  ${children.length > 0 ? replyGroup(node, depth, options) : ''}`
  return `<article class="lc-comment${depth > 0 ? ' lc-reply' : ''}" data-depth="${depth}" data-comment-id="${id}" data-comment-depth="${depth}">
  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
    <button type="button" data-action="collapse" data-comment-id="${id}" aria-expanded="${!collapsed}" aria-label="${collapsed ? 'Expand' : 'Collapse'} comment by ${escapeHtml(comment.authorName)}" class="lc-action lc-collapse ${BTN} ${BTN_GHOST} ${BTN_ICON_XS}">${icon(collapsed ? 'plus' : 'minus', 'size-3')}</button>
    ${avatarMarkup(comment.authorName, parts.avatar)}
    <span class="min-w-0 truncate font-medium${comment.authorRole === 'admin' ? ' text-primary' : ''}">${escapeHtml(comment.authorName)}</span>
    ${comment.authorRole === 'admin' ? badge('default', 'lc-admin-badge', 'Admin') : ''}
    ${comment.userBlocked ? badge('outline', 'lc-blocked-badge', `${icon('ban')}blocked`) : ''}
    <time dateTime="${escapeHtml(comment.createdAt)}" title="${escapeHtml(new Date(comment.createdAt).toLocaleString())}" class="text-xs text-muted-foreground">${escapeHtml(formatRelativeTime(comment.createdAt))}</time>
    ${flags}
    ${readOnly ? '' : actionsTrigger(comment, actionEntries(comment, { canEdit, editing, isOwn, viewerRole, pending: moderationPending }))}
    ${hideVotes ? '' : `<span class="ml-auto"><div class="lc-vote flex items-center gap-0.5">${score}</div></span>`}
  </div>
  ${collapsed ? `<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-lc-collapsed="">${folded}</div>` : expanded}
</article>`
}

export function renderCommentTree(nodes: ThreadNode[], options: CommentNodeOptions = {}): string {
  return nodes.map((n) => renderCommentNode(n, 0, options)).join('')
}

// One row owns three mutually-exclusive UI slots (editor, reply composer,
// body) plus their pending/error flags — the same item state as React.
export type ItemState = {
  editing: boolean
  saving: boolean
  editError: ErrorInfo | null
  replying: boolean
  replyError: ErrorInfo | null
  collapsedOverride: boolean | null
}

export const ITEM_INITIAL: ItemState = {
  editing: false,
  saving: false,
  editError: null,
  replying: false,
  replyError: null,
  collapsedOverride: null,
}

export type UiState = {
  replyTo: string | null
  sort: ThreadSort
  page: number
  // Per-row slot state, keyed by comment id.
  items: Record<string, ItemState>
  identityOpen: boolean
  needsSignIn: boolean
  actionError: ErrorInfo | null
  pendingModeration: Record<string, boolean>
  lockPending: boolean
  signInPending: boolean
  signOutPending: boolean
  // The identity error plus the flow its own retry button must re-run.
  identityError: { info: ErrorInfo; retry: 'signin' | 'signout' } | null
}

export type UiAction =
  | { type: 'reply'; value: string | null }
  | { type: 'edit/open'; id: string }
  | { type: 'edit/close'; id: string }
  | { type: 'edit/settle'; id: string; error: ErrorInfo | null }
  | { type: 'saving/set'; id: string; saving: boolean }
  | { type: 'reply/submit'; id: string }
  | { type: 'reply/settle'; id: string; error: ErrorInfo | null }
  | { type: 'replying/set'; id: string; replying: boolean }
  | { type: 'collapse/toggle'; id: string; value: boolean }
  | { type: 'sort/set'; value: ThreadSort }
  | { type: 'page/set'; value: number }
  | { type: 'identity/open'; value: boolean }
  | { type: 'identity/error'; value: UiState['identityError'] }
  | { type: 'signin/pending'; value: boolean }
  | { type: 'signout/pending'; value: boolean }
  | { type: 'signin/needed'; value: boolean }
  | { type: 'error'; value: ErrorInfo | null }
  | { type: 'moderation/pending'; id: string; value: boolean }
  | { type: 'lock/pending'; value: boolean }

export const UI_INITIAL: UiState = {
  replyTo: null,
  sort: 'newest',
  page: 1,
  items: {},
  identityOpen: false,
  needsSignIn: false,
  actionError: null,
  pendingModeration: {},
  lockPending: false,
  signInPending: false,
  signOutPending: false,
  identityError: null,
}

// Pure so bun test covers every transition without a browser.
export function transition(state: UiState, action: UiAction): UiState {
  const patchItem = (id: string, patch: Partial<ItemState>): UiState => ({
    ...state,
    items: { ...state.items, [id]: { ...(state.items[id] ?? ITEM_INITIAL), ...patch } },
  })
  switch (action.type) {
    case 'reply':
      return { ...state, replyTo: action.value }
    case 'edit/open':
      return patchItem(action.id, { editing: true })
    case 'edit/close':
      return patchItem(action.id, { editing: false, editError: null })
    // A failed save keeps the editor (and its draft) open; Cancel is the way out.
    case 'edit/settle':
      return patchItem(action.id, {
        editError: action.error,
        editing: action.error === null ? false : (state.items[action.id] ?? ITEM_INITIAL).editing,
      })
    case 'saving/set':
      return patchItem(action.id, { saving: action.saving })
    case 'reply/submit':
      return patchItem(action.id, { replying: true })
    case 'reply/settle':
      return patchItem(action.id, { replyError: action.error })
    case 'replying/set':
      return patchItem(action.id, { replying: action.replying })
    case 'collapse/toggle':
      return patchItem(action.id, { collapsedOverride: action.value })
    // Window boundaries follow the new order, so a sort change starts at page 1.
    case 'sort/set':
      return { ...state, sort: action.value, page: 1 }
    case 'page/set':
      return { ...state, page: action.value }
    case 'identity/open':
      return { ...state, identityOpen: action.value }
    case 'identity/error':
      return { ...state, identityError: action.value }
    case 'signin/pending':
      return { ...state, signInPending: action.value }
    case 'signout/pending':
      return { ...state, signOutPending: action.value }
    case 'signin/needed':
      return { ...state, needsSignIn: action.value }
    case 'error':
      return { ...state, actionError: action.value }
    case 'moderation/pending':
      return {
        ...state,
        pendingModeration: { ...state.pendingModeration, [action.id]: action.value },
      }
    case 'lock/pending':
      return { ...state, lockPending: action.value }
    default:
      throw new Error(`Unknown UI action: ${JSON.stringify(action)}`)
  }
}

type ObserverCtor = typeof IntersectionObserver

// One-shot viewport gate shared by the list and the viewer; split out so the
// three branches are testable without a DOM.
export function observeInView(
  element: Element | null,
  lazy: boolean,
  observerCtor: ObserverCtor | undefined,
  onEnter: () => void,
): (() => void) | undefined {
  if (!lazy || !observerCtor) {
    onEnter()
    return
  }
  if (!element) return
  const observer = new observerCtor(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        onEnter()
        observer.disconnect()
      }
    },
    { rootMargin: '200px' },
  )
  observer.observe(element)
  return () => observer.disconnect()
}

export function pagerMarkup(page: number, limit: number, threads: number, hasMore: boolean, loading: boolean): string {
  // `threads > limit` keeps the nav reachable after Prev returns to an
  // exhausted page 1 (hasMore false), else Next is stranded.
  if (!(page > 1 || hasMore || threads > limit)) return ''
  const canPrev = page > 1 && !loading
  const canNext = !loading && (hasMore || threads > page * limit)
  return `<nav aria-label="Comments pagination" class="flex flex-wrap items-center justify-between gap-2 text-sm">
      <button type="button" data-action="page-prev" ${canPrev ? '' : 'disabled'} class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"><span aria-hidden="true">&lsaquo;</span> Previous</button>
      <span class="text-muted-foreground">Page <span aria-current="page" class="font-medium text-foreground">${page}</span></span>
      <button type="button" data-action="page-next" ${canNext ? '' : 'disabled'} class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50">Next <span aria-hidden="true">&rsaquo;</span></button>
    </nav>`
}

export function sortToggleMarkup(value: ThreadSort): string {
  const button = (sort: ThreadSort, label: string) =>
    `<button type="button" data-action="sort" data-sort="${sort}" aria-pressed="${value === sort}" class="${BTN} ${BTN_SM} ${value === sort ? BTN_SECONDARY : BTN_GHOST}">${label}</button>`
  return `<div class="flex items-center gap-1" role="toolbar" aria-label="Sort comments">
      <span class="mr-1 text-xs text-muted-foreground">Sort</span>
      ${button('newest', 'Newest')}
      ${button('oldest', 'Oldest')}
      ${button('best', 'Best')}
    </div>`
}

// Reply panels clip their contents while they fold, so measurement follows them.
const PANEL_SELECTOR = '[data-slot="accordion-content"]'
// Rails ride the middle of the 1rem gutters (the list's and each reply group's),
// so a line never crosses a comment's content.
export const GUTTER_INSET = 8
// Reading slice for the scroll spy: a comment is often taller than the Fumadocs
// TOC's top 20%, so this points at the middle of the viewport.
export const READING_POINT = 0.45

export type GuideRow = {
  depth: number
  // All coordinates are px in the list's own (padding-box) space.
  left: number
  top: number
  bottom: number
  paddingLeft: number
  hasReplies: boolean
  // Band of a folded reply group, so hidden replies still show as a stub.
  stub?: { top: number; bottom: number }
}

// The guide path for a measured page. Each thread head resets the path: a
// top-level comment carries no line, and one thread's line never runs across
// the rows of the next.
export function guidePath(rows: GuideRow[]): { d: string; width: number; height: number } {
  const items: ThreadGuideItem[] = []
  let started = false
  for (const row of rows) {
    const head = row.depth === 0
    if (head) started = false
    if (row.bottom > row.top && (!head || row.hasReplies)) {
      items.push({ x: row.left - GUTTER_INSET, top: row.top, bottom: row.bottom, break: !started })
      started = true
    }
    if (row.stub) {
      // Start one gutter below the junction: with the cubic's ±4px controls that
      // leaves a bend radius, so the join reads as round as the level changes.
      const top = row.stub.top + GUTTER_INSET * 2
      const bottom = row.stub.bottom
      if (bottom > top) {
        items.push({ x: row.left + row.paddingLeft + GUTTER_INSET, top, bottom, break: !started })
        started = true
      }
    }
  }
  return buildThreadGuidePath(items)
}

// The comment nearest the top of the reading slice is the current one; nothing
// reached yet means the first row reads as current.
export function pickActive(spans: Iterable<[string, [number, number]]>, band: number): string | null {
  let current: string | null = null
  let first: string | null = null
  for (const [id, span] of spans) {
    if (first === null) first = id
    if (span[0] <= band) current = id
  }
  return current ?? first
}

export type GuidesSession = { measure(): void; destroy(): void }

let guideSeq = 0

function contentTop(list: HTMLElement): number {
  const rect = list.getBoundingClientRect()
  return rect.top + list.clientTop - list.scrollTop
}

// The list's overlay origin: the padding box, in the coordinates the guides are
// measured against. shortcut: left-to-right only — the widget ships no RTL
// styles, so under `dir="rtl"` rails would stack on the wrong edge.
function contentLeft(list: HTMLElement): number {
  const rect = list.getBoundingClientRect()
  return rect.left + list.clientLeft - list.scrollLeft
}

// Measures the rendered rows and paints the Fumadocs-style guide line. The
// scroll spy writes to the clip rectangle, never to state, so scrolling never
// re-renders the thread.
export function renderGuides(list: HTMLElement): GuidesSession {
  const clipId = `lc-thread-guide-${++guideSeq}`
  const spans = new Map<string, [number, number]>()
  let overlay: HTMLElement | null = null
  let clip: SVGRectElement | null = null
  let active: string | null = null
  let frame = 0
  let dead = false
  let spy: IntersectionObserver | null = null
  let observer: ResizeObserver | null = null

  function paint() {
    if (!clip) return
    const span = active ? spans.get(active) : undefined
    clip.setAttribute('y', String(span?.[0] ?? 0))
    clip.setAttribute('height', String(span ? Math.max(0, span[1] - span[0]) : 0))
  }

  function pick() {
    active = pickActive(spans, window.innerHeight * READING_POINT - contentTop(list))
    paint()
  }

  function draw(guide: { d: string; width: number; height: number }) {
    if (guide.d === '') {
      overlay?.remove()
      overlay = null
      clip = null
      return
    }
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.className = 'lc-thread-overlay'
      overlay.setAttribute('aria-hidden', 'true')
      list.prepend(overlay)
    }
    overlay.style.width = `${guide.width}px`
    overlay.innerHTML = `<svg viewBox="0 0 ${guide.width} ${guide.height}" width="${guide.width}" height="${guide.height}" aria-hidden="true"><defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="${guide.width}" height="0"></rect></clipPath></defs><path class="track" d="${guide.d}"></path><path class="thumb" d="${guide.d}" clip-path="url(#${clipId})"></path></svg>`
    clip = overlay.querySelector<SVGRectElement>('rect')
  }

  function measure() {
    // A repaint may land between a queued frame and this call.
    if (dead) return
    const baseY = contentTop(list)
    const baseX = contentLeft(list)
    const rows: GuideRow[] = []
    const articles: HTMLElement[] = []
    spans.clear()
    for (const article of list.querySelectorAll<HTMLElement>('article.lc-comment[data-comment-depth]')) {
      const rect = article.getBoundingClientRect()
      const style = getComputedStyle(article)
      const paddingTop = Number.parseFloat(style.paddingTop) || 0
      const paddingBottom = Number.parseFloat(style.paddingBottom) || 0
      const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
      const left = rect.left - baseX
      // Measure only the slice of the comment its reply panels leave visible.
      let visibleTop = rect.top
      let visibleBottom = rect.bottom
      for (let node = article.parentElement; node && node !== list; node = node.parentElement) {
        if (!node.matches(PANEL_SELECTOR)) continue
        const panel = node.getBoundingClientRect()
        visibleTop = Math.max(visibleTop, panel.top)
        visibleBottom = Math.min(visibleBottom, panel.bottom)
      }
      const top = visibleTop - baseY + paddingTop
      // A rail spans the comment's own rows and stops where its reply group starts.
      const group = article.querySelector<HTMLElement>('[data-lc-replies]')
      const ownBottom = group ? Math.min(group.getBoundingClientRect().top, visibleBottom) : visibleBottom
      const bottom = ownBottom - baseY - paddingBottom
      // A folded group keeps a stub beside its trigger, so hidden replies still
      // show in the guide instead of vanishing with them.
      const folded = group?.querySelector<HTMLElement>(PANEL_SELECTOR)?.dataset.state === 'closed'
      const band = folded && group ? group.getBoundingClientRect() : null
      rows.push({
        depth: Number(article.dataset.commentDepth) || 0,
        left,
        top,
        bottom,
        paddingLeft,
        hasReplies: Boolean(group),
        ...(band ? { stub: { top: band.top - baseY, bottom: band.bottom - baseY } } : {}),
      })
      const id = article.dataset.commentId
      if (id) spans.set(id, [top, bottom])
      articles.push(article)
    }
    draw(guidePath(rows))
    if (typeof IntersectionObserver !== 'undefined') {
      spy ??= new IntersectionObserver(pick, { rootMargin: '-40% 0px -55% 0px' })
      spy.disconnect()
      for (const article of articles) spy.observe(article)
    }
    pick()
  }

  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      // Folding a reply group resizes the list every frame: measure once a frame.
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    })
    observer.observe(list)
  }
  // Webfonts move the rows after the first paint.
  void document.fonts?.ready.then(() => measure()).catch(() => {})

  return {
    measure,
    destroy() {
      dead = true
      observer?.disconnect()
      spy?.disconnect()
      cancelAnimationFrame(frame)
      frame = 0
      overlay?.remove()
      overlay = null
      clip = null
    },
  }
}

export type VotePatch = Record<string, { score: number; viewerVote: VoteValue | null }>

// Vote results overlay the row cache: untouched rows keep their object, so
// their cached markdown/date reuse on the next repaint.
export function applyVotes(comments: Comment[], votes: VotePatch): Comment[] {
  if (Object.keys(votes).length === 0) return comments
  let changed = false
  const next = comments.map((comment) => {
    const patch = votes[comment.id]
    if (!patch) return comment
    changed = true
    return { ...comment, score: patch.score, viewerVote: patch.viewerVote }
  })
  return changed ? next : comments
}

function renderForm(opts: {
  parentId?: string
  turnstileSiteKey?: string
  guest?: boolean
  formId: string
  initialBody?: string
  submitLabel?: string
  signInHtml?: string
  submitDisabled?: boolean
  bodyLimit?: number
  pending?: boolean
  error?: ErrorInfo | null
  // Standalone editor (edit slot) cancels from the bottom row; a reply cancels
  // from its header.
  cancelLabel?: string
}): string {
  const guest = opts.guest ?? true
  const bodyLimit = opts.bodyLimit ?? DEFAULT_BODY_LIMIT
  const counterId = `lc-count-${opts.formId}`
  const turnstile =
    guest && opts.turnstileSiteKey
      ? `<div class="lc-turnstile" data-turnstile-sitekey="${escapeHtml(opts.turnstileSiteKey)}"></div>`
      : ''
  const header = opts.parentId
    ? `<div class="mb-2 flex items-center justify-between text-xs text-muted-foreground">
      <span>Replying to this comment</span>
      <button type="button" data-action="cancel-reply" class="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-accent">Cancel</button>
    </div>`
    : ''
  const cancel =
    !opts.parentId && opts.cancelLabel
      ? `<button type="button" data-action="cancel-edit" class="rounded border border-border px-2 py-1 text-sm text-muted-foreground">${escapeHtml(opts.cancelLabel)}</button>`
      : ''
  const submitLabel = escapeHtml(opts.submitLabel ?? (opts.parentId ? 'Post reply' : 'Post comment'))
  return `<form data-lc-form="${escapeHtml(opts.formId)}" class="lc-composer rounded-xl border border-border p-3">
    ${opts.parentId ? `<input type="hidden" name="parentId" value="${escapeHtml(opts.parentId)}" />` : ''}
    ${header}
    <div class="mb-1 flex flex-wrap items-center justify-end gap-0.5">
      <div class="mr-auto flex gap-0.5">
        <button type="button" data-action="write" aria-pressed="true" class="${BTN} ${BTN_SM} ${BTN_SECONDARY}">${icon('pen-line', 'size-3.5')}<span>Write</span></button>
        <button type="button" data-action="preview" aria-pressed="false" class="${BTN} ${BTN_SM} ${BTN_GHOST}">${icon('eye', 'size-3.5')}<span>Preview</span></button>
      </div>
      <div class="flex gap-0.5" role="toolbar" aria-label="Markdown formatting">
        <button type="button" data-action="md-bold" class="${BTN} ${BTN_ICON_SM} ${BTN_GHOST}" title="Bold" aria-label="Bold">${icon('bold')}</button>
        <button type="button" data-action="md-italic" class="${BTN} ${BTN_ICON_SM} ${BTN_GHOST}" title="Italic" aria-label="Italic">${icon('italic')}</button>
        <button type="button" data-action="md-quote" class="${BTN} ${BTN_ICON_SM} ${BTN_GHOST}" title="Quote" aria-label="Quote">${icon('quote')}</button>
        <button type="button" data-action="md-code" class="${BTN} ${BTN_ICON_SM} ${BTN_GHOST}" title="Code" aria-label="Code">${icon('code')}</button>
        <button type="button" data-action="md-link" class="${BTN} ${BTN_ICON_SM} ${BTN_GHOST}" title="Link" aria-label="Link">${icon('link')}</button>
        <button type="button" data-action="md-bullet" class="${BTN} ${BTN_ICON_SM} ${BTN_GHOST}" title="Bullet list" aria-label="Bullet list">${icon('list')}</button>
        <button type="button" data-action="md-ordered" class="${BTN} ${BTN_ICON_SM} ${BTN_GHOST}" title="Numbered list" aria-label="Numbered list">${icon('list-ordered')}</button>
      </div>
    </div>
    <textarea name="bodyMarkdown" required rows="4" placeholder="${opts.parentId ? 'Write a reply…' : 'Your comment here…'}" aria-label="${opts.parentId ? 'Reply body' : 'Comment body'}" aria-describedby="${escapeHtml(counterId)}" class="flex field-sizing-content min-h-16 w-full rounded-lg border-0 border-input bg-transparent px-1 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-0 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40">${escapeHtml(opts.initialBody ?? '')}</textarea>
    <p id="${escapeHtml(counterId)}" data-lc-char-count class="mt-1 text-right text-xs text-muted-foreground tabular-nums"><span data-lc-char-used>${(opts.initialBody ?? '').length.toLocaleString()}</span> / ${bodyLimit.toLocaleString()}</p>
    ${turnstile}
    ${opts.error ? `<div class="mt-2">${errorMarkup(opts.error)}</div>` : ''}
    <div class="hidden" data-lc-form-error></div>
    <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      ${opts.signInHtml ?? ''}
      ${guest ? '<input name="authorName" type="text" maxlength="80" placeholder="Anonymous" aria-label="Your name" autocomplete="nickname" class="w-32 min-w-0 border-0 bg-transparent px-1 text-sm focus-visible:ring-0 sm:w-40" />' : ''}
      <div class="ml-auto flex flex-wrap items-center gap-x-2 gap-y-1">
        <p class="hidden text-xs text-muted-foreground sm:block">Styling with <span class="font-medium text-primary">Markdown</span> is supported</p>
        ${cancel}
        <button type="submit" ${opts.submitDisabled || opts.pending ? 'disabled' : ''} class="${BTN} ${BTN_DEFAULT} ${BTN_PRIMARY}">${opts.pending ? 'Posting…' : submitLabel}</button>
      </div>
    </div>
  </form>`
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
let turnstileLoad: Promise<void> | null = null

function ensureTurnstile(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (!turnstileLoad) {
    const { promise, resolve } = Promise.withResolvers<void>()
    turnstileLoad = promise
    const script = document.createElement('script')
    script.src = TURNSTILE_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => resolve()
    document.head.appendChild(script)
  }
  return turnstileLoad
}

// One row per expected comment; 3 on a first load, 2 while the next page of
// rows is fetched. The viewer variant omits the interactive slots the real
// read-only row never renders (menu, vote buttons, Reply).
function skeletonBlock(count: number, readOnly = false): string {
  const nameWidths = ['w-24', 'w-32', 'w-20']
  const bodyWidths = ['w-3/4', 'w-2/3', 'w-4/5']
  const rows = Array.from({ length: count }, (_, index) => {
    const actions = readOnly
      ? '<div class="ml-auto h-4 w-6 lc-skeleton animate-pulse bg-muted"></div>'
      : `<div class="ml-auto size-6 rounded-md lc-skeleton animate-pulse bg-muted"></div>
          <div class="h-6 w-20 rounded-full lc-skeleton animate-pulse bg-muted"></div>`
    return `<div class="lc-comment-skeleton" data-lc-skeleton>
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div class="size-6 rounded-md lc-skeleton animate-pulse bg-muted"></div>
        <div class="size-6 rounded-full lc-skeleton animate-pulse bg-muted"></div>
        <div class="h-4 ${nameWidths[index % nameWidths.length]} lc-skeleton animate-pulse bg-muted"></div>
        <div class="h-3 w-10 lc-skeleton animate-pulse bg-muted"></div>
        ${actions}
      </div>
      <div class="my-3 space-y-2">
        <div class="h-4 w-full lc-skeleton animate-pulse bg-muted"></div>
        <div class="h-4 ${bodyWidths[index % bodyWidths.length]} lc-skeleton animate-pulse bg-muted"></div>
      </div>
      ${readOnly ? '' : '<div class="h-7 w-16 rounded-md lc-skeleton animate-pulse bg-muted"></div>'}
    </div>`
  }).join('')
  return `<div role="status" aria-busy="true">
    <span class="sr-only">Loading comments…</span>
    <div class="grid ${readOnly ? 'gap-4' : 'gap-3'}" aria-hidden="true">${rows}</div>
  </div>`
}

// Small attribution footer shared by the comments list and the read-only viewer.
function attributionMarkup(): string {
  return `<footer class="lc-footer mt-2 text-right text-xs text-muted-foreground">Powered by <a class="underline underline-offset-4 hover:text-foreground" href="https://github.com/lst97-oss/last-comments" target="_blank" rel="noreferrer">last-comments</a></footer>`
}

// Restore host-owned inline values and classes when a widget releases its root.
function setupTheme(el: HTMLElement, theme: Theme, options: Pick<MountOptions, 'themeVars'>) {
  const hadRoot = el.classList.contains('lc-comments')
  const wasDark = el.classList.contains('dark')
  const original = new Map<string, { value: string; priority: string }>(
    Object.values(THEME_CSS_VARIABLES).map((key) => [
      key,
      { value: el.style.getPropertyValue(key), priority: el.style.getPropertyPriority(key) },
    ]),
  )
  const touched = new Set<string>()
  let applied: Record<string, string> = {}
  const restore = (key: string) => {
    const saved = original.get(key)
    if (saved?.value) el.style.setProperty(key, saved.value, saved.priority)
    else el.style.removeProperty(key)
  }
  el.classList.add('lc-comments')
  return {
    apply() {
      const dark =
        theme === 'dark' ||
        (theme === 'system' &&
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches)
      el.classList.toggle('dark', dark)
      const next = themeVarsToStyle(options.themeVars, dark)
      for (const key of Object.keys(applied)) {
        if (!(key in next)) restore(key)
      }
      for (const [key, value] of Object.entries(next)) {
        touched.add(key)
        el.style.setProperty(key, value)
      }
      applied = next
    },
    cleanup() {
      for (const key of touched) restore(key)
      el.classList.toggle('lc-comments', hadRoot)
      el.classList.toggle('dark', wasDark)
    },
  }
}

export function mountComments(el: HTMLElement, options: MountOptions): WidgetHandle {
  const limit = options.limit ?? 20
  const theme = options.theme ?? 'system'
  const client: LastCommentsClient = createClient({
    baseUrl: options.baseUrl,
    site: options.site,
    fetchImpl: options.fetchImpl,
  })
  const pageUrl = options.pageUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
  const viewerRole = options.viewerRole
  const moderator = canModerate(viewerRole)
  // Thread the moderator UI is pointed at: the `pageId` option, or the page the
  // URL matched. Rows and moderator posts both address it.
  let threadPageId: string | null = null

  let comments: Comment[] = []
  // Pending vote results, merged over the row cache on every paint.
  let votes: VotePatch = {}
  // The tree is derived from the row cache: reuse it while its inputs hold.
  let treeKey: { comments: Comment[]; votes: VotePatch; sort: ThreadSort } | null = null
  let treeCache: ThreadNode[] = []
  let status: 'loading' | 'ready' | 'error' = 'loading'
  let error: ErrorInfo | null = null
  let hasMore = true
  let loadingPage = false
  let destroyed = false
  // The guide measurement session for the current list DOM; a repaint replaces
  // it wholesale, so each paint gets a fresh one.
  let guides: GuidesSession | null = null
  const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT
  const actionMode = options.actionMode ?? 'icon-text'
  let pageLock: { pageId: string; locked: boolean } | null = null
  let session: ViewerSession | null = null
  let sessionStatus: 'loading' | 'ready' = 'loading'
  let commentAs: 'account' | 'anonymous' = 'account'
  // UI flags live in one immutable record; reads go through the current value.
  let ui: UiState = UI_INITIAL
  // Shared by every render path so the composer, the turnstile box and the
  // nested reply forms never disagree about who is posting.
  function composerIdentity() {
    const signed = Boolean(session) || Boolean(options.viewerUserId)
    return {
      signed,
      guest: !signed || commentAs === 'anonymous',
      label: session?.name || 'Your account',
      viewerUserId: options.viewerUserId ?? session?.userId,
    }
  }
  const tokens = new Map<string, string>()
  const widgetIds = new Map<string, string>()
  // Load generation: a response from an older load never commits.
  let loadSeq = 0
  let mediaQuery: MediaQueryList | null = null
  // One open popover/menu at a time; both live at the widget root, never in a row.
  let identityPanel: HTMLElement | null = null
  let actionsMenu: { panel: HTMLElement; trigger: HTMLElement } | null = null

  const { apply: applyTheme, cleanup: cleanupTheme } = setupTheme(el, theme, options)
  // Theme variables are instance state: apply at mount and on media changes,
  // never on every paint.
  applyTheme()

  // First child of the composer form: which identity the comment posts as,
  // plus sign-in/sign-out. React portals the menu into the widget root, so the
  // trigger stays a bare flex child of this row and the panel is mounted on
  // demand by openIdentityMenu.
  function signInRow(): string {
    // Moderators post as themselves through the moderation endpoint: the
    // anonymous/account switcher does not apply.
    if (moderator) return ''
    const { signed, label } = composerIdentity()
    // The identity is unknown until the session request settles; showing a
    // guess here (or letting a post through) would pick the wrong wire flag.
    const trigger =
      sessionStatus === 'loading'
        ? '<span class="block h-4 w-16 animate-pulse rounded bg-muted"></span>'
        : `<span class="label max-w-[10rem] truncate">${escapeHtml(commentAs === 'anonymous' || !signed ? 'Anonymous' : label)}</span>${icon('chevron-down', 'size-3.5')}`
    const alert = ui.identityError
      ? `<div class="w-full">${errorMarkup(ui.identityError.info, { retryAction: ui.identityError.retry })}</div>`
      : ''
    return `<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span class="text-xs text-muted-foreground">Comment as</span>
      <button type="button" data-action="identity" aria-haspopup="menu" aria-expanded="${ui.identityOpen}" ${sessionStatus === 'loading' || ui.signInPending || ui.signOutPending ? 'disabled' : ''} class="lc-identity-trigger ${BTN} ${BTN_OUTLINE} ${BTN_SM}">${trigger}</button>
    </div>${alert}`
  }

  // React's DropdownMenuRadioItem/DropdownMenuItem: divs, so the theme's
  // control radius/min-height for buttons never apply to them.
  function identityItems(): string {
    const { signed, label } = composerIdentity()
    const signInUrl = safeUrl(options.signInUrl)
    // A signed-out visitor has no account to be checked, so Anonymous is the
    // selected item even before they touch the menu.
    const anonymousSelected = commentAs === 'anonymous' || !signed
    const accountSelected = commentAs === 'account'
    const check = `<span class="pointer-events-none absolute right-2 flex items-center justify-center">${icon('check')}</span>`
    const radio = (action: string, checked: boolean, inner: string) =>
      `<div role="menuitemradio" aria-checked="${checked}" data-action="${action}" data-selected="${checked}" tabindex="-1" class="${IDENTITY_RADIO_ITEM_CLASS}">${checked ? check : ''}${inner}</div>`
    const anonymous = radio('identity-anonymous', anonymousSelected, 'Anonymous')
    const account = signed
      ? radio('identity-account', accountSelected, `${escapeHtml(label)} (you)`)
      : signInUrl
        ? `<a role="menuitem" href="${escapeHtml(signInUrl)}" tabindex="-1" class="${IDENTITY_ITEM_CLASS}">Sign in…</a>`
        : `<div role="menuitem" data-action="signin" tabindex="-1" ${ui.signInPending ? 'aria-disabled="true" data-disabled="true"' : ''} class="${IDENTITY_ITEM_CLASS}">${ui.signInPending ? 'Signing in…' : 'Sign in…'}</div>`
    const signOut = session
      ? `<div role="separator" class="-mx-1 my-1 h-px bg-border"></div>
      <div role="menuitem" data-action="signout" tabindex="-1" ${ui.signOutPending ? 'aria-disabled="true" data-disabled="true"' : ''} class="${IDENTITY_ITEM_CLASS}">${ui.signOutPending ? 'Signing out…' : 'Sign out'}</div>`
      : ''
    return `${anonymous}${account}${signOut}`
  }

  function refreshSignInRow() {
    closeIdentityMenu()
    const host = el.querySelector('[data-lc-signin]')
    if (host) host.innerHTML = signInRow()
  }

  // Panels mount into the widget root (React portals them there) and are
  // measured against the trigger, so the row markup stays a plain flex row.
  function placePanel(panel: HTMLElement, trigger: HTMLElement, align: 'start' | 'end') {
    const rect = trigger.getBoundingClientRect()
    panel.style.top = `${rect.bottom + 4}px`
    if (align === 'start') panel.style.left = `${rect.left}px`
    else panel.style.right = `${Math.max(0, document.documentElement.clientWidth - rect.right)}px`
  }

  function openIdentityMenu(trigger: HTMLElement) {
    closeActionsMenu()
    closeIdentityMenu()
    const panel = document.createElement('div')
    panel.className = IDENTITY_MENU_CLASS
    panel.setAttribute('role', 'menu')
    panel.setAttribute('tabindex', '-1')
    panel.innerHTML = identityItems()
    el.appendChild(panel)
    placePanel(panel, trigger, 'start')
    identityPanel = panel
    ui = transition(ui, { type: 'identity/open', value: true })
    trigger.setAttribute('aria-expanded', 'true')
    // React's menu focuses the popup on pointer open; items stay unfocused
    // until an arrow key moves the highlight.
    panel.focus()
  }

  function closeIdentityMenu(returnFocus = false) {
    if (!identityPanel) return
    const trigger = el.querySelector<HTMLElement>('.lc-identity-trigger')
    identityPanel.remove()
    identityPanel = null
    ui = transition(ui, { type: 'identity/open', value: false })
    trigger?.setAttribute('aria-expanded', 'false')
    if (returnFocus) trigger?.focus()
  }

  function closeActionsMenu(returnFocus = false) {
    if (!actionsMenu) return
    const { panel, trigger } = actionsMenu
    panel.remove()
    actionsMenu = null
    trigger.setAttribute('aria-expanded', 'false')
    if (returnFocus) trigger.focus()
  }

  function openActionsMenu(trigger: HTMLElement) {
    const commentId = trigger.getAttribute('data-comment-id')
    const comment = comments.find((c) => c.id === commentId)
    if (!comment) return
    closeIdentityMenu()
    closeActionsMenu()
    const viewerUserId = composerIdentity().viewerUserId
    const entries = actionEntries(comment, {
      canEdit: canEditComment(comment, viewerUserId, {
        anonWindowMinutes: options.anonEditWindowMinutes ?? DEFAULT_ANON_EDIT_WINDOW_MINUTES,
        hasEditKey: getEditKey(comment.id) !== null,
      }),
      editing: (ui.items[comment.id] ?? ITEM_INITIAL).editing,
      isOwn: Boolean(viewerUserId && comment.userId && viewerUserId === comment.userId),
      viewerRole,
      pending: ui.pendingModeration[comment.id] ?? false,
    })
    if (entries.length === 0) return
    const panel = document.createElement('div')
    panel.className = ACTIONS_MENU_CLASS
    panel.setAttribute('role', 'dialog')
    panel.innerHTML = entries.join('')
    el.appendChild(panel)
    placePanel(panel, trigger, 'end')
    actionsMenu = { panel, trigger }
    trigger.setAttribute('aria-expanded', 'true')
    panel.querySelector('button')?.focus()
  }

  // A wide markdown table would otherwise widen the page (overflow is ignored
  // on a display:table box); scroll it inside its own box, which keeps the
  // table's own full-width layout intact on wide viewports.
  function wrapMarkdownTables(root: ParentNode) {
    for (const table of root.querySelectorAll<HTMLTableElement>('.lc-markdown table')) {
      const wrap = document.createElement('div')
      wrap.className = 'w-full overflow-x-auto'
      table.parentElement?.insertBefore(wrap, table)
      wrap.appendChild(table)
    }
  }

  // A region repaint replaces its forms, so what the visitor already typed is
  // restored afterwards; the top composer itself is never remounted.
  function captureDrafts(root: ParentNode): Map<string, { body?: string; name?: string }> {
    const drafts = new Map<string, { body?: string; name?: string }>()
    for (const form of root.querySelectorAll<HTMLFormElement>('form[data-lc-form]')) {
      const id = form.getAttribute('data-lc-form')
      if (!id) continue
      const body = form.querySelector<HTMLTextAreaElement>('textarea[name="bodyMarkdown"]')?.value
      const name = form.querySelector<HTMLInputElement>('input[name="authorName"]')?.value
      if (body !== undefined || name !== undefined) drafts.set(id, { body, name })
    }
    return drafts
  }

  function restoreDrafts(root: ParentNode, drafts: Map<string, { body?: string; name?: string }>) {
    for (const [id, draft] of drafts) {
      const form = root.querySelector<HTMLFormElement>(`form[data-lc-form="${CSS.escape(id)}"]`)
      const area = form?.querySelector<HTMLTextAreaElement>('textarea[name="bodyMarkdown"]')
      const input = form?.querySelector<HTMLInputElement>('input[name="authorName"]')
      if (area && draft.body !== undefined) area.value = draft.body
      if (input && draft.name !== undefined) input.value = draft.name
    }
  }

  // Turnstile ids key DOM that a region repaint is about to remove.
  function clearTurnstileWidgets(root: ParentNode) {
    for (const form of root.querySelectorAll<HTMLFormElement>('form[data-lc-form]')) {
      const formId = form.getAttribute('data-lc-form') ?? 'top'
      const id = widgetIds.get(formId)
      if (id === undefined) continue
      try {
        window.turnstile?.remove?.(id)
      } catch {
        // Already gone with its DOM.
      }
      widgetIds.delete(formId)
      tokens.delete(formId)
    }
  }

  function setIdentity(next: 'account' | 'anonymous') {
    closeIdentityMenu()
    if (commentAs !== next) {
      commentAs = next
      // A token minted for the previous identity must not be posted with this one.
      resetTurnstile('top')
      renderComposer()
      renderList()
      return
    }
    refreshSignInRow()
  }

  async function signOut() {
    ui = transition(ui, { type: 'signout/pending', value: true })
    ui = transition(ui, { type: 'identity/error', value: null })
    closeIdentityMenu()
    refreshSignInRow()
    try {
      await signOutViewerSession({ baseUrl: options.baseUrl, fetchImpl: options.fetchImpl })
      session = null
      commentAs = 'anonymous'
    } catch (err) {
      ui = transition(ui, {
        type: 'identity/error',
        value: { info: describeError(err, { title: "Sign-out didn't work" }), retry: 'signout' },
      })
    } finally {
      ui = transition(ui, { type: 'signout/pending', value: false })
    }
    renderComposer()
    renderList()
  }

  // Capture phase: the delegated click handler below runs on bubble, so the
  // panels must be tested against their pre-click state here.
  function onDocumentClick(ev: Event) {
    const target = ev.target
    if (!(target instanceof Node)) return
    if (actionsMenu && !actionsMenu.panel.contains(target) && !actionsMenu.trigger.contains(target))
      closeActionsMenu(false)
    const identityTrigger = el.querySelector<HTMLElement>('.lc-identity-trigger')
    if (identityPanel && !identityPanel.contains(target) && !identityTrigger?.contains(target)) closeIdentityMenu(false)
  }

  function onDocumentKeydown(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      if (actionsMenu) {
        ev.preventDefault()
        closeActionsMenu(true)
        return
      }
      if (identityPanel) {
        ev.preventDefault()
        closeIdentityMenu(true)
      }
      return
    }
    // React's identity menu is a menu: arrows rove between its items.
    if (!identityPanel) return
    const target = ev.target instanceof HTMLElement ? ev.target : null
    if (!target || !identityPanel.contains(target)) return
    const items = [...identityPanel.querySelectorAll<HTMLElement>('.lc-identity-item')]
    const current = items.indexOf(target)
    const moves: Record<string, number | 'first' | 'last'> = {
      ArrowDown: 1,
      ArrowUp: -1,
      Home: 'first',
      End: 'last',
    }
    const move = moves[ev.key]
    if (move === undefined || items.length === 0) return
    ev.preventDefault()
    const index =
      move === 'first'
        ? 0
        : move === 'last'
          ? items.length - 1
          : ((current < 0 ? 0 : current) + move + items.length) % items.length
    items[index].focus()
  }

  async function signIn() {
    ui = transition(ui, { type: 'signin/pending', value: true })
    ui = transition(ui, { type: 'identity/error', value: null })
    closeIdentityMenu()
    refreshSignInRow()
    try {
      const url = await beginOAuthSignIn({ baseUrl: options.baseUrl, pageUrl, fetchImpl: options.fetchImpl })
      window.location.assign(url)
    } catch (err) {
      ui = transition(ui, {
        type: 'identity/error',
        value: { info: describeError(err, { title: "Sign-in didn't start" }), retry: 'signin' },
      })
    } finally {
      ui = transition(ui, { type: 'signin/pending', value: false })
    }
    refreshSignInRow()
  }

  function currentTree(): ThreadNode[] {
    if (!treeKey || treeKey.comments !== comments || treeKey.votes !== votes || treeKey.sort !== ui.sort) {
      treeKey = { comments, votes, sort: ui.sort }
      // Overlay before sorting: `best` must re-rank on a vote.
      treeCache = sortCommentRoots(buildCommentTree(applyVotes(comments, votes)), ui.sort)
    }
    return treeCache
  }

  function listBody(): string {
    const signInUrl = safeUrl(options.signInUrl)
    const { guest, viewerUserId } = composerIdentity()
    const lockBar =
      moderator && pageLock
        ? `<div class="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
        <span class="text-muted-foreground">${pageLock.locked ? 'Comments are locked on this page.' : 'Comments are open on this page.'}</span>
        <button type="button" data-action="toggle-lock" ${ui.lockPending ? 'disabled' : ''} class="ml-auto rounded border border-border px-3 py-1 text-sm disabled:opacity-50">${pageLock.locked ? 'Unlock' : 'Lock'}</button>
      </div>`
        : ''
    const actionBanner = ui.actionError ? errorMarkup(ui.actionError, { signInUrl }) : ''
    if (status === 'loading' && comments.length === 0) return skeletonBlock(3)
    if (status === 'error' && comments.length === 0 && error) return errorMarkup(error, { signInUrl })
    if (status === 'ready' && comments.length === 0)
      return `${lockBar}${actionBanner}<p class="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">No comments yet.</p>`
    // A page is a window over ROOTS: cutting rows would split a thread and
    // render its replies as phantom top-level comments.
    const roots = currentTree()
    // A local vote/edit/delete empties the window without a refetch; fall back
    // to the last page that still has a thread instead of a blank list.
    if (ui.page > 1 && roots.length <= (ui.page - 1) * limit)
      ui = transition(ui, { type: 'page/set', value: Math.max(1, Math.ceil(roots.length / limit)) })
    const pageRoots = roots.slice((ui.page - 1) * limit, ui.page * limit)
    const tree = renderCommentTree(pageRoots, {
      replyTo: ui.replyTo,
      turnstileSiteKey: options.turnstileSiteKey,
      guest,
      viewerUserId,
      viewerRole,
      items: ui.items,
      anonWindowMinutes: options.anonEditWindowMinutes ?? DEFAULT_ANON_EDIT_WINDOW_MINUTES,
      actionMode,
      bodyLimit,
      pendingModeration: ui.pendingModeration,
      submitDisabled: sessionStatus === 'loading',
      hideVotes: Boolean(viewerRole) && Boolean(pageLock?.locked),
    })
    const signIn = ui.needsSignIn
      ? `<p class="rounded-lg border border-border bg-card p-5 text-sm">Please sign in to vote. ${signInUrl ? `<a href="${escapeHtml(signInUrl)}" class="underline">Sign in</a>` : ''}</p>`
      : ''
    const sortBar = status !== 'error' && roots.length > 0 ? sortToggleMarkup(ui.sort) : ''
    const list =
      pageRoots.length > 0
        ? `<section aria-label="Comments" data-lc-thread-list class="lc-thread-guides relative grid grid-cols-1 gap-3">${tree}</section>`
        : ''
    const pager = pagerMarkup(ui.page, limit, roots.length, hasMore, loadingPage)
    return `${lockBar}${actionBanner}${signIn}${sortBar}${list}${loadingPage ? `<div class="mt-3">${skeletonBlock(2)}</div>` : ''}${pager ? `<div class="mt-3">${pager}</div>` : ''}${attributionMarkup()}`
  }

  function composerHtml(): string {
    const { guest } = composerIdentity()
    const signInHtml = `<div data-lc-signin>${signInRow()}</div>`
    return renderForm({
      turnstileSiteKey: options.turnstileSiteKey,
      guest,
      formId: 'top',
      signInHtml,
      submitDisabled: sessionStatus === 'loading',
      bodyLimit,
    })
  }

  // Identity-only repaint: the top composer keeps focus, selection and drafts.
  function renderComposer() {
    closeIdentityMenu()
    const composer = el.querySelector<HTMLElement>('[data-lc-composer]')
    if (!composer) return
    clearTurnstileWidgets(composer)
    composer.innerHTML = composerHtml()
    hydrateTurnstile()
  }

  // Guides measure the list DOM that a repaint replaces; drop the old session
  // and start a fresh one against the new rows.
  function attachGuides() {
    guides?.destroy()
    guides = null
    const list = el.querySelector<HTMLElement>('[data-lc-thread-list]')
    if (list) guides = renderGuides(list)
  }

  // List-only repaint: the composer is never touched.
  function renderList() {
    closeActionsMenu()
    const list = el.querySelector<HTMLElement>('[data-lc-list]')
    if (!list) return
    clearTurnstileWidgets(list)
    const drafts = captureDrafts(list)
    list.innerHTML = listBody()
    restoreDrafts(list, drafts)
    wrapMarkdownTables(list)
    hydrateTurnstile()
    attachGuides()
  }

  function render() {
    if (destroyed) return
    closeActionsMenu()
    closeIdentityMenu()
    clearTurnstileWidgets(el)
    el.innerHTML = `<section aria-label="Comments" class="space-y-4"><div data-lc-composer>${composerHtml()}</div><div data-lc-list class="flex flex-col gap-4">${listBody()}</div></section>`
    wrapMarkdownTables(el)
    hydrateTurnstile()
    attachGuides()
  }

  // Both regions exist after the first paint; later paints only refresh the list.
  function paint() {
    if (el.querySelector('[data-lc-composer]')) renderList()
    else render()
  }

  function hydrateTurnstile() {
    const siteKey = options.turnstileSiteKey
    if (!siteKey || !composerIdentity().guest) return
    const config = resolveTurnstileConfig(el.classList.contains('dark'), options.turnstileOptions)
    void ensureTurnstile().then(() => {
      if (destroyed || !window.turnstile) return
      for (const box of el.querySelectorAll<HTMLElement>('.lc-turnstile')) {
        const form = box.closest('form')
        const formId = form?.getAttribute('data-lc-form') ?? 'top'
        if (widgetIds.has(formId)) continue
        try {
          const id = window.turnstile.render(box, {
            sitekey: siteKey,
            ...config,
            callback: (token: string) => {
              tokens.set(formId, token)
            },
            'expired-callback': () => {
              tokens.delete(formId)
            },
            'error-callback': () => {
              tokens.delete(formId)
            },
          })
          if (id) widgetIds.set(formId, id)
        } catch {
          // Turnstile unavailable; server will report a distinct error.
        }
      }
    })
  }

  // A system light/dark flip changes the class on the root, so the challenge
  // has to be re-rendered with the new theme (ids and tokens do not survive it).
  function handleSystemThemeChange() {
    applyTheme()
    if (!el.querySelector('.lc-turnstile')) return
    clearTurnstileWidgets(el)
    hydrateTurnstile()
  }

  function resetTurnstile(formId: string) {
    tokens.delete(formId)
    const id = widgetIds.get(formId)
    widgetIds.delete(formId)
    try {
      window.turnstile?.reset(id)
    } catch {
      // ignore
    }
  }

  // Replies consume rows, so one `limit`-row fetch can yield fewer than `limit`
  // threads: the shared loader keeps fetching until `pages` windows are full or
  // the stream ends. `existing` continues from the cache (Next never refetches
  // page 1).
  // Known limit of this API: a reply created after its thread's page is passed
  // stays hidden until more rows load (the list endpoint has no per-thread
  // query).
  async function loadWindow(pages: number, seq: number): Promise<'ok' | 'stale'> {
    const window = await loadThreadWindow({
      site: options.site,
      baseUrl: options.baseUrl,
      pageUrl,
      limit,
      fetchImpl: options.fetchImpl,
      pages,
      ...(pages > 1 ? { existing: comments } : {}),
    })
    if (seq !== loadSeq) return 'stale'
    comments = window.comments
    hasMore = window.hasMore
    return 'ok'
  }

  // Moderator branch: resolve this page from the site's page list, then read
  // its thread including hidden/deleted rows. `total` is exact, so the window
  // is filled by row count.
  async function loadModeration(offset: number, seq: number): Promise<'ok' | 'stale'> {
    // A host-supplied `pageId` wins over the URL match: the page list is
    // capped, so a match can miss on a busy site.
    const overview = await client.listModeration({ limit: 1 })
    if (seq !== loadSeq) return 'stale'
    const normalized = normalizePageUrl(pageUrl)
    const match = options.pageId
      ? (overview.pages.find((p) => p.id === options.pageId) ?? null)
      : (overview.pages.find((p) => normalizePageUrl(p.canonicalUrl) === normalized) ?? null)
    // Unknown lock state stays unknown: the lock bar is hidden rather than
    // claiming the thread is open.
    pageLock = match ? { pageId: match.id, locked: match.isLocked } : null
    threadPageId = options.pageId ?? match?.id ?? null
    if (!threadPageId) {
      if (offset === 0) comments = []
      hasMore = false
      status = 'ready'
      return 'ok'
    }
    const list = await client.listModeration({ pageId: threadPageId, limit, offset })
    if (seq !== loadSeq) return 'stale'
    const rows = list.comments.map(moderationCommentToComment)
    comments = offset === 0 ? rows : [...comments, ...rows]
    hasMore = comments.length < list.total
    status = 'ready'
    return 'ok'
  }

  async function fillModeration(target: number, seq: number): Promise<'ok' | 'stale'> {
    let before = comments.length
    while (hasMore && currentTree().length < target) {
      if ((await loadModeration(comments.length, seq)) === 'stale') return 'stale'
      if (comments.length === before) break
      before = comments.length
    }
    return 'ok'
  }

  // A failed page fetch keeps the cache on screen; only a failed first load
  // replaces the list with the error panel.
  function loadFailure(err: unknown, first: boolean) {
    // Moderation must be same-origin, so a transport failure there is not a
    // dead baseUrl: it means the request never got CORS or was blocked.
    error =
      moderator && !(err instanceof ApiError)
        ? {
            code: null,
            title: 'Moderation is unavailable',
            message: 'Moderation is only available when the comments API is served from this origin.',
            action: 'retry',
          }
        : describeError(err, { title: 'Comments failed to load' })
    status = first ? 'error' : 'ready'
  }

  // Fill the first window before showing it, so page 1 renders `limit` threads
  // whenever the stream holds them. Every reload goes through here (page = 1);
  // `preserveDraft` is for reloads the user triggered while a failure was on
  // screen, which must not take a half-written comment with them.
  async function initialLoad() {
    const seq = ++loadSeq
    loadingPage = true
    ui = transition(ui, { type: 'page/set', value: 1 })
    status = 'loading'
    error = null
    ui = transition(ui, { type: 'error', value: null })
    paint()
    try {
      const result = moderator
        ? (await loadModeration(0, seq)) === 'stale'
          ? 'stale'
          : await fillModeration(limit, seq)
        : await loadWindow(1, seq)
      if (destroyed || result === 'stale' || seq !== loadSeq) return
      status = 'ready'
      // A committed reload supersedes every pending vote patch.
      votes = {}
    } catch (err) {
      if (destroyed || seq !== loadSeq) return
      loadFailure(err, true)
    }
    loadingPage = false
    paint()
  }

  async function nextPage() {
    if (loadingPage) return
    const seq = ++loadSeq
    loadingPage = true
    renderList()
    // Fill the DESTINATION window before rendering it.
    try {
      const result = moderator ? await fillModeration((ui.page + 1) * limit, seq) : await loadWindow(ui.page + 1, seq)
      if (destroyed || result === 'stale' || seq !== loadSeq) return
    } catch (err) {
      if (destroyed || seq !== loadSeq) return
      loadFailure(err, false)
    }
    loadingPage = false
    if (currentTree().length > ui.page * limit) ui = transition(ui, { type: 'page/set', value: ui.page + 1 })
    renderList()
  }

  // Shared by the top composer and the inline reply slots: the moderation vs
  // public wire branch lives here once.
  async function postOne(input: {
    formId: string
    parentId: string | null
    bodyMarkdown: string
    authorName: string
  }): Promise<void> {
    const { guest } = composerIdentity()
    // Moderators post through the moderation endpoint: the public create path
    // checks the site's origin allow-list, which a dashboard origin is not on.
    const created =
      moderator && threadPageId
        ? await client.createModerationComment({
            pageId: threadPageId,
            bodyMarkdown: input.bodyMarkdown,
            ...(input.parentId ? { parentId: input.parentId } : {}),
          })
        : await client.postComment({
            url: pageUrl,
            bodyMarkdown: input.bodyMarkdown,
            anonymous: guest,
            ...(input.parentId || typeof document === 'undefined' ? {} : { title: document.title }),
            ...(input.authorName ? { authorName: input.authorName } : {}),
            ...(input.parentId ? { parentId: input.parentId } : {}),
            ...(tokens.get(input.formId) ? { verificationToken: tokens.get(input.formId) } : {}),
          })
    // The server returns the guest edit key exactly once.
    if (created.editKey) saveEditKey(created.id, created.editKey)
  }

  async function submit(form: HTMLFormElement) {
    const formId = form.getAttribute('data-lc-form') ?? 'top'
    const errBox = form.querySelector('[data-lc-form-error]')
    const fail = (info: ErrorInfo) => {
      if (errBox) {
        errBox.innerHTML = errorMarkup(info, { signInUrl: options.signInUrl })
        errBox.classList.remove('hidden')
      }
    }
    const area = form.querySelector<HTMLTextAreaElement>('textarea[name="bodyMarkdown"]')
    // The counter blocks the submit button; the guard keeps a stale DOM from
    // posting a body the server would reject. Raw length, never the trimmed one.
    if (area && area.value.length > bodyLimit) return
    const body = new FormData(form).get('bodyMarkdown')
    const name = new FormData(form).get('authorName')
    const parent = new FormData(form).get('parentId')
    const bodyMarkdown = typeof body === 'string' ? body.trim() : ''
    // Anonymous posts always carry a name; the field is optional, so a blank
    // one posts as "Anonymous".
    const authorName = typeof name === 'string' ? name.trim() || 'Anonymous' : ''
    const parentId = typeof parent === 'string' && parent ? parent : null
    if (parentId) {
      // The inline reply slot owns its pending/error state, so failures land in
      // the row instead of the page-level composer block.
      if (!bodyMarkdown) {
        ui = transition(ui, { type: 'reply/settle', id: parentId, error: INVALID_REPLY })
        renderList()
        return
      }
      ui = transition(ui, { type: 'reply/submit', id: parentId })
      renderList()
      try {
        await postOne({ formId, parentId, bodyMarkdown, authorName })
        resetTurnstile(formId)
        ui = transition(ui, { type: 'reply/settle', id: parentId, error: null })
        ui = transition(ui, { type: 'reply', value: null })
        ui = transition(ui, { type: 'replying/set', id: parentId, replying: false })
        await initialLoad()
        if (moderator) options.onModerated?.()
        return
      } catch (err) {
        resetTurnstile(formId)
        ui = transition(ui, {
          type: 'reply/settle',
          id: parentId,
          error: describeError(err, { title: "Your reply wasn't posted" }),
        })
      }
      ui = transition(ui, { type: 'replying/set', id: parentId, replying: false })
      renderList()
      return
    }
    if (!bodyMarkdown) {
      fail(INVALID_BODY)
      return
    }
    try {
      await postOne({ formId, parentId: null, bodyMarkdown, authorName })
      resetTurnstile(formId)
      // The composer stays mounted, so clear the submitted fields by hand.
      if (area) area.value = ''
      const nameInput = form.querySelector<HTMLInputElement>('input[name="authorName"]')
      if (nameInput) nameInput.value = ''
      await initialLoad()
      if (moderator) options.onModerated?.()
    } catch (err) {
      resetTurnstile(formId)
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED' && options.signInUrl) {
        ui = transition(ui, { type: 'signin/needed', value: true })
        renderList()
        return
      }
      fail(describeError(err, { title: "Your comment wasn't posted" }))
      hydrateTurnstile()
    }
  }

  async function vote(commentId: string, value: VoteValue) {
    const current = comments.find((c) => c.id === commentId)
    ui = transition(ui, { type: 'error', value: null })
    try {
      // Moderators vote through the moderation endpoint: the public vote route
      // checks the site's origin allow-list, which a dashboard origin is not on.
      const clear = current?.viewerVote === value
      const summary = moderator
        ? await client.setModerationVote({ commentId, value: clear ? null : value })
        : clear
          ? await client.clearVote(commentId)
          : await client.castVote(commentId, value)
      // Only the voted row changes: patch its DOM instead of repainting the
      // list (a full repaint would drop composer focus and every draft).
      const hadNotice = ui.needsSignIn || ui.actionError !== null
      votes = { ...votes, [commentId]: { score: summary.score, viewerVote: summary.viewerVote } }
      ui = transition(ui, { type: 'signin/needed', value: false })
      ui = transition(ui, { type: 'error', value: null })
      // `best` ranks by score, so a vote re-orders the rows: repaint to re-rank.
      if (hadNotice || ui.sort === 'best') {
        renderList()
        return
      }
      patchVoteRow(commentId)
      return
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') {
        ui = transition(ui, { type: 'signin/needed', value: true })
      } else {
        ui = transition(ui, {
          type: 'error',
          value: describeError(err, { title: "Your vote wasn't saved" }),
        })
      }
    }
    renderList()
  }

  function patchVoteRow(commentId: string) {
    const patch = votes[commentId]
    const article = el.querySelector(`article[data-comment-id="${CSS.escape(commentId)}"]`)
    const header = article?.firstElementChild
    if (!patch || !header) return
    const score = header.querySelector('[aria-live="polite"]')
    if (score) score.textContent = String(patch.score)
    // `firstElementChild` scopes this to the row's own headline, never a nested reply.
    for (const button of header.querySelectorAll<HTMLElement>('button[data-action="vote"]')) {
      const active = patch.viewerVote === Number(button.getAttribute('data-value'))
      button.setAttribute('aria-pressed', String(active))
      button.className = voteButtonClass(active)
    }
  }

  function applyTextEdit(
    form: HTMLFormElement,
    kind: 'wrap' | 'prefix',
    before: string,
    after: string,
    placeholder: string,
  ) {
    const area = form.querySelector<HTMLTextAreaElement>('textarea[name="bodyMarkdown"]')
    if (!area) return
    const start = area.selectionStart ?? area.value.length
    const end = area.selectionEnd ?? area.value.length
    const next =
      kind === 'wrap'
        ? insertWrap(area.value, start, end, before, after, placeholder)
        : insertPrefix(area.value, start, end, before, placeholder)
    area.value = next.value
    area.focus()
    area.selectionStart = next.start
    area.selectionEnd = next.end
  }

  function onToolbar(form: HTMLFormElement, action: string | null) {
    if (action === 'md-bold') applyTextEdit(form, 'wrap', '**', '**', 'bold')
    else if (action === 'md-italic') applyTextEdit(form, 'wrap', '*', '*', 'italic')
    else if (action === 'md-quote') applyTextEdit(form, 'prefix', '> ', '', 'quote')
    else if (action === 'md-code') applyTextEdit(form, 'wrap', '`', '`', 'code')
    else if (action === 'md-link') applyTextEdit(form, 'wrap', '[', '](url)', 'link')
    else if (action === 'md-bullet') applyTextEdit(form, 'prefix', '- ', '', 'item')
    else if (action === 'md-ordered') applyTextEdit(form, 'prefix', '1. ', '', 'item')
  }

  function setPreview(button: HTMLElement, show: boolean) {
    const form = button.closest('form')
    const area = form?.querySelector<HTMLTextAreaElement>('textarea[name="bodyMarkdown"]')
    if (!form || !area) return
    form.querySelector('[data-lc-preview]')?.remove()
    if (show) {
      const html = renderMarkdown(area.value) || '<p class="text-muted-foreground">Nothing to preview.</p>'
      const div = document.createElement('div')
      div.setAttribute('data-lc-preview', '')
      div.className = 'lc-markdown min-h-24 px-1 py-2 font-sans text-sm'
      div.innerHTML = html
      wrapMarkdownTables(div)
      area.insertAdjacentElement('beforebegin', div)
      area.classList.add('hidden')
    } else {
      area.classList.remove('hidden')
    }
    for (const toggle of form.querySelectorAll<HTMLElement>('[data-action="write"], [data-action="preview"]')) {
      const active = (toggle.getAttribute('data-action') === 'preview') === show
      toggle.setAttribute('aria-pressed', String(active))
      toggle.classList.toggle(BTN_SECONDARY, active)
      toggle.classList.toggle(BTN_GHOST, !active)
    }
  }

  // Counts what the author typed: the server caps the same raw length, and the
  // over-limit body never leaves the browser.
  function syncCounter(form: HTMLFormElement) {
    const area = form.querySelector<HTMLTextAreaElement>('textarea[name="bodyMarkdown"]')
    if (!area) return
    const over = area.value.length > bodyLimit
    const used = form.querySelector<HTMLElement>('[data-lc-char-used]')
    if (used) {
      used.textContent = area.value.length.toLocaleString()
      used.classList.toggle('text-destructive', over)
    }
    if (over) area.setAttribute('aria-invalid', 'true')
    else area.removeAttribute('aria-invalid')
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (submit) submit.disabled = over || sessionStatus === 'loading'
  }

  // Hand-rolled disclosure: no popover API / `@starting-style` in the supported
  // baseline, so the folded labels and the panel's row size move by hand.
  function toggleReplies(trigger: HTMLElement) {
    const open = trigger.getAttribute('aria-expanded') !== 'true'
    const panel = trigger.closest('[data-lc-replies]')?.querySelector<HTMLElement>(PANEL_SELECTOR)
    if (!panel) return
    trigger.setAttribute('aria-expanded', String(open))
    panel.dataset.state = open ? 'open' : 'closed'
    panel.classList.toggle('grid-rows-[1fr]', open)
    panel.classList.toggle('grid-rows-[0fr]', !open)
    trigger.querySelector('[data-lc-replies-folded]')?.classList.toggle('hidden', open)
    trigger.querySelector('[data-lc-replies-open]')?.classList.toggle('hidden', !open)
    const [down, up] = trigger.querySelectorAll<HTMLElement>('svg')
    down?.classList.toggle('hidden', open)
    up?.classList.toggle('hidden', !open)
    if (open) panel.removeAttribute('inert')
    else panel.setAttribute('inert', '')
    guides?.measure()
  }

  async function saveEdit(commentId: string) {
    const article = el.querySelector(`article[data-comment-id="${CSS.escape(commentId)}"]`)
    const area = article?.querySelector<HTMLTextAreaElement>('textarea[name="bodyMarkdown"]')
    if (!area) return
    const raw = area.value
    ui = transition(ui, { type: 'error', value: null })
    if (!raw.trim()) {
      ui = transition(ui, { type: 'edit/settle', id: commentId, error: INVALID_BODY })
      renderList()
      return
    }
    ui = transition(ui, { type: 'saving/set', id: commentId, saving: true })
    try {
      // Moderators edit through the moderation endpoint for the same reason they
      // post through it: the public PATCH checks the site's origins.
      const editKey = moderator ? null : getEditKey(commentId)
      const updated = moderator
        ? await client.editModerationComment({ commentId, bodyMarkdown: raw })
        : await client.editOwnComment({ commentId, bodyMarkdown: raw, ...(editKey ? { editKey } : {}) })
      comments = comments.map((c) =>
        c.id === commentId
          ? { ...c, ...updated, score: updated.score ?? c.score, viewerVote: updated.viewerVote ?? c.viewerVote }
          : c,
      )
      ui = transition(ui, { type: 'edit/settle', id: commentId, error: null })
    } catch (err) {
      // The editor stays open (including when the window expired, so the copy
      // can still be copied out) with the failure in its own slot.
      ui = transition(ui, {
        type: 'edit/settle',
        id: commentId,
        error: describeError(err, { title: "Your edit wasn't saved" }),
      })
    }
    ui = transition(ui, { type: 'saving/set', id: commentId, saving: false })
    renderList()
  }

  async function removeComment(commentId: string) {
    ui = transition(ui, { type: 'error', value: null })
    try {
      await client.deleteOwnComment(commentId)
      // Keep the row as a tombstone: the thread keeps its shape and the normal
      // view renders the deleted placeholder instead of the body.
      comments = comments.map((c) => (c.id === commentId ? { ...c, status: 'deleted' } : c))
      forgetEditKey(commentId)
      ui = transition(ui, { type: 'edit/close', id: commentId })
    } catch (err) {
      ui = transition(ui, {
        type: 'error',
        value: describeError(err, { title: "Your comment wasn't deleted" }),
      })
    }
    renderList()
  }

  async function moderate(commentId: string, action: ModerationAction) {
    ui = transition(ui, { type: 'moderation/pending', id: commentId, value: true })
    ui = transition(ui, { type: 'error', value: null })
    renderList()
    try {
      const patch = await client.moderateComment({ commentId, action })
      comments = comments.map((c) =>
        c.id === commentId ? { ...c, status: patch.status, pinnedAt: patch.pinnedAt } : c,
      )
      options.onModerated?.()
    } catch (err) {
      ui = transition(ui, {
        type: 'error',
        value: describeError(err, { title: 'That moderation action failed' }),
      })
    } finally {
      ui = transition(ui, { type: 'moderation/pending', id: commentId, value: false })
    }
    renderList()
  }

  async function blockUser(commentId: string, blocked: boolean) {
    const userId = comments.find((c) => c.id === commentId)?.userId
    if (!userId) return
    ui = transition(ui, { type: 'moderation/pending', id: commentId, value: true })
    ui = transition(ui, { type: 'error', value: null })
    renderList()
    try {
      await client.setUserBlocked({ userId, blocked })
      comments = comments.map((c) => (c.userId === userId ? { ...c, userBlocked: blocked } : c))
      options.onModerated?.()
    } catch (err) {
      ui = transition(ui, {
        type: 'error',
        value: describeError(err, { title: 'That moderation action failed' }),
      })
    } finally {
      ui = transition(ui, { type: 'moderation/pending', id: commentId, value: false })
    }
    renderList()
  }

  async function toggleLock() {
    if (!pageLock) return
    ui = transition(ui, { type: 'lock/pending', value: true })
    ui = transition(ui, { type: 'error', value: null })
    renderList()
    try {
      const next = await client.setPageLocked({ pageId: pageLock.pageId, locked: !pageLock.locked })
      pageLock = { pageId: next.id, locked: next.isLocked }
      options.onModerated?.()
    } catch (err) {
      ui = transition(ui, {
        type: 'error',
        value: describeError(err, { title: 'That moderation action failed' }),
      })
    } finally {
      ui = transition(ui, { type: 'lock/pending', value: false })
    }
    renderList()
  }

  function onClick(ev: Event) {
    const target = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null
    if (!target || !el.contains(target)) return
    const action = target.getAttribute('data-action')
    const commentId = target.getAttribute('data-comment-id')
    // Clicking a popover entry runs its action and unmounts the panel first.
    if (actionsMenu?.panel.contains(target)) closeActionsMenu(false)
    if (action === 'preview' || action === 'write') setPreview(target, action === 'preview')
    else if (action === 'error-retry') void initialLoad()
    else if (action === 'error-sign-in') void signIn()
    else if (action === 'signin') void signIn()
    else if (action === 'identity') {
      if (identityPanel) closeIdentityMenu(true)
      else openIdentityMenu(target)
    } else if (action === 'identity-anonymous') setIdentity('anonymous')
    else if (action === 'identity-account') setIdentity('account')
    else if (action === 'signout') void signOut()
    else if (action === 'sort') {
      const next = target.getAttribute('data-sort')
      if (next === 'newest' || next === 'oldest' || next === 'best') {
        ui = transition(ui, { type: 'sort/set', value: next })
        renderList()
      }
    } else if (action === 'page-prev') {
      if (ui.page > 1 && !loadingPage) {
        ui = transition(ui, { type: 'page/set', value: ui.page - 1 })
        renderList()
      }
    } else if (action === 'page-next') void nextPage()
    else if (action === 'menu-toggle') {
      if (actionsMenu) closeActionsMenu(true)
      else openActionsMenu(target)
    } else if (action === 'collapse') {
      if (!commentId) return
      const item = ui.items[commentId] ?? ITEM_INITIAL
      // A folded row has no override yet; its seed is the negative score.
      const score = comments.find((c) => c.id === commentId)?.score ?? 0
      ui = transition(ui, { type: 'collapse/toggle', id: commentId, value: !(item.collapsedOverride ?? score < 0) })
      renderList()
    } else if (action === 'replies-toggle') toggleReplies(target)
    else if (action === 'reply') {
      ui = transition(ui, { type: 'reply', value: ui.replyTo === commentId ? null : commentId })
      renderList()
    } else if (action === 'cancel-reply') {
      ui = transition(ui, { type: 'reply', value: null })
      const parentId = target.closest('form')?.querySelector('input[name="parentId"]')?.getAttribute('value')
      if (parentId) ui = transition(ui, { type: 'reply/settle', id: parentId, error: null })
      renderList()
    } else if (action === 'vote') {
      const value = Number(target.getAttribute('data-value')) as VoteValue
      if (commentId && (value === 1 || value === -1)) void vote(commentId, value)
    } else if (action === 'menu-edit') {
      if (!commentId) return
      ui = transition(ui, { type: 'reply', value: null })
      ui = transition(ui, { type: 'edit/open', id: commentId })
      renderList()
    } else if (action === 'cancel-edit') {
      const formId = target.closest('form')?.getAttribute('data-lc-form') ?? ''
      const id = commentId ?? (formId.startsWith('edit-') ? formId.slice('edit-'.length) : '')
      if (!id) return
      ui = transition(ui, { type: 'edit/close', id })
      renderList()
    } else if (action === 'delete') {
      if (commentId) void removeComment(commentId)
    } else if (action === 'moderate') {
      const moderationAction = target.getAttribute('data-moderation-action') as ModerationAction | null
      if (commentId && moderationAction) void moderate(commentId, moderationAction)
    } else if (action === 'toggle-lock') {
      void toggleLock()
    } else if (action === 'block-user') {
      const blocked = comments.find((c) => c.id === commentId)?.userBlocked === true
      if (commentId) void blockUser(commentId, !blocked)
    } else if (action?.startsWith('md-')) {
      const form = target.closest('form')
      if (form instanceof HTMLFormElement) onToolbar(form, action)
    }
  }

  function onInput(ev: Event) {
    const area = ev.target
    if (!(area instanceof HTMLTextAreaElement) || area.name !== 'bodyMarkdown') return
    const form = area.closest('form')
    if (form) syncCounter(form)
  }

  function onSubmit(ev: Event) {
    const form = ev.target as HTMLElement
    if (form instanceof HTMLFormElement && form.hasAttribute('data-lc-form') && el.contains(form)) {
      ev.preventDefault()
      const formId = form.getAttribute('data-lc-form') ?? ''
      if (formId.startsWith('edit-')) void saveEdit(formId.slice('edit-'.length))
      else void submit(form)
    }
  }

  el.addEventListener('click', onClick)
  el.addEventListener('input', onInput)
  el.addEventListener('submit', onSubmit)
  document.addEventListener('click', onDocumentClick, true)
  document.addEventListener('keydown', onDocumentKeydown)
  if (theme === 'system' && typeof window !== 'undefined') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', handleSystemThemeChange)
  }
  // Both requests hang off this: a below-the-fold embed should reach the
  // network only once it is scrolled near.
  function startLoading() {
    void fetchViewerSession({ baseUrl: options.baseUrl, fetchImpl: options.fetchImpl }).then((next) => {
      sessionStatus = 'ready'
      if (destroyed) return
      const wasGuest = composerIdentity().guest
      if (next) session = next
      // Only the composer's guest fields move without an identity change, and
      // rebuilding the whole widget would drop what was typed while we waited.
      if (composerIdentity().guest !== wasGuest) {
        renderComposer()
        renderList()
        return
      }
      refreshSignInRow()
      // Every form was rendered disabled while the identity was unknown.
      for (const form of el.querySelectorAll<HTMLFormElement>('form[data-lc-form]')) syncCounter(form)
    })
    void initialLoad()
  }
  // Paint the placeholder so a zero-height root still has an intersection to
  // report, then fetch on the first hit only.
  if (options.lazy && typeof IntersectionObserver !== 'undefined') render()
  const stopObserver = observeInView(
    el,
    Boolean(options.lazy),
    typeof IntersectionObserver === 'undefined' ? undefined : IntersectionObserver,
    startLoading,
  )

  return {
    destroy() {
      destroyed = true
      stopObserver?.()
      mediaQuery?.removeEventListener('change', handleSystemThemeChange)
      cleanupTheme()
      guides?.destroy()
      guides = null
      el.removeEventListener('click', onClick)
      el.removeEventListener('input', onInput)
      el.removeEventListener('submit', onSubmit)
      document.removeEventListener('click', onDocumentClick, true)
      document.removeEventListener('keydown', onDocumentKeydown)
      el.innerHTML = ''
    },
    refresh() {
      return initialLoad()
    },
  }
}
export function renderCommentViewer(el: HTMLElement, options: ViewerOptions): WidgetHandle {
  const theme = options.theme ?? 'system'
  const limit = options.limit ?? 20
  const pageUrl = options.pageUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
  // Read-only twin of the list's window model: `rows` is the accumulated row
  // cache, a page shows `limit` threads cut from the tree built over it.
  let rows: Comment[] = []
  // The tree is derived from the row cache: reuse it while the cache holds.
  let treeKey: { rows: Comment[]; sort: ThreadSort } | null = null
  let treeCache: ThreadNode[] = []
  let page = 1
  let sort: ThreadSort = 'newest'
  let hasMore = true
  let guides: GuidesSession | null = null
  let loadingPage = false
  let status: 'loading' | 'ready' | 'error' = 'loading'
  // Replaced by the real failure before `status` reaches 'error'.
  let failure: ErrorInfo = {
    code: null,
    title: 'Comments failed to load',
    message: 'Try again in a moment.',
    action: 'retry',
  }
  let destroyed = false
  let mediaQuery: MediaQueryList | null = null
  // Load generation: a response from an older load never commits.
  let loadSeq = 0

  const { apply: applyTheme, cleanup: cleanupTheme } = setupTheme(el, theme, options)
  applyTheme()

  function currentTree(): ThreadNode[] {
    if (!treeKey || treeKey.rows !== rows || treeKey.sort !== sort) {
      treeKey = { rows, sort }
      treeCache = sortCommentRoots(buildCommentTree(rows), sort)
    }
    return treeCache
  }

  function paint() {
    if (destroyed) return
    guides?.destroy()
    guides = null
    const roots = currentTree()
    const pageRoots = roots.slice((page - 1) * limit, page * limit)
    const body =
      status === 'loading'
        ? skeletonBlock(3, true)
        : // The read-only viewer has no sign-in path, so its only remedy is a reload.
          status === 'error'
          ? errorMarkup(failure.action === 'sign-in' ? { ...failure, action: 'retry' } : failure)
          : roots.length === 0
            ? `<p class="text-sm text-muted-foreground">No comments yet.</p>`
            : ''
    const sortBar = status !== 'error' && roots.length > 0 ? sortToggleMarkup(sort) : ''
    const list =
      pageRoots.length > 0
        ? `<section aria-label="Comments" data-lc-thread-list class="lc-thread-guides relative grid gap-4">${renderCommentTree(pageRoots, { readOnly: true })}</section>`
        : ''
    const pager = pagerMarkup(page, limit, roots.length, hasMore, loadingPage)
    const pending = loadingPage && status === 'ready' ? `<div>${skeletonBlock(2, true)}</div>` : ''
    el.innerHTML = `<section aria-label="Comments" class="grid gap-4">${body}${sortBar}${list}${pending}${pager}${attributionMarkup()}</section>`
    const threadList = el.querySelector<HTMLElement>('[data-lc-thread-list]')
    if (threadList) guides = renderGuides(threadList)
  }

  // Same shared loader as the list, so the viewer cannot drift from it.
  async function loadWindow(pages: number, seq: number): Promise<'ok' | 'stale'> {
    const window = await loadThreadWindow({
      site: options.site,
      baseUrl: options.baseUrl,
      pageUrl,
      limit,
      fetchImpl: options.fetchImpl,
      pages,
      ...(pages > 1 ? { existing: rows } : {}),
    })
    if (seq !== loadSeq) return 'stale'
    rows = window.comments
    hasMore = window.hasMore
    return 'ok'
  }

  async function load() {
    const seq = ++loadSeq
    loadingPage = true
    page = 1
    status = 'loading'
    paint()
    try {
      if ((await loadWindow(1, seq)) === 'stale' || destroyed || seq !== loadSeq) return
      status = 'ready'
    } catch (err) {
      if (destroyed || seq !== loadSeq) return
      status = 'error'
      failure = describeError(err, { title: 'Comments failed to load' })
    }
    loadingPage = false
    paint()
  }

  async function nextPage() {
    if (loadingPage) return
    const seq = ++loadSeq
    loadingPage = true
    paint()
    try {
      if ((await loadWindow(page + 1, seq)) === 'stale' || destroyed || seq !== loadSeq) return
    } catch {
      if (destroyed || seq !== loadSeq) return
      // Keep the loaded page; the nav simply stays put.
    }
    loadingPage = false
    if (currentTree().length > page * limit) page += 1
    paint()
  }

  function onClick(ev: Event) {
    const target = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null
    if (!target || !el.contains(target)) return
    const action = target.getAttribute('data-action')
    if (action === 'error-retry') void load()
    else if (action === 'sort') {
      const next = target.getAttribute('data-sort')
      if (next === 'newest' || next === 'oldest' || next === 'best') {
        sort = next
        // Window boundaries follow the new order, so start from its first page.
        page = 1
        paint()
      }
    } else if (action === 'page-prev') {
      if (page > 1 && !loadingPage) {
        page -= 1
        paint()
      }
    } else if (action === 'page-next') void nextPage()
  }

  el.addEventListener('click', onClick)
  if (theme === 'system' && typeof window !== 'undefined') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', applyTheme)
  }
  // Paint the placeholder so a zero-height root still has an intersection to
  // report, then fetch on the first hit only.
  if (options.lazy && typeof IntersectionObserver !== 'undefined') paint()
  const stopObserver = observeInView(
    el,
    Boolean(options.lazy),
    typeof IntersectionObserver === 'undefined' ? undefined : IntersectionObserver,
    () => void load(),
  )

  return {
    destroy() {
      destroyed = true
      stopObserver?.()
      guides?.destroy()
      guides = null
      mediaQuery?.removeEventListener('change', applyTheme)
      cleanupTheme()
      el.removeEventListener('click', onClick)
      el.innerHTML = ''
    },
    refresh() {
      return load()
    },
  }
}

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

// Host attributes are untrusted: an unparsable number leaves the option unset
// so the documented default applies.
function readNumber(node: HTMLElement, attr: string, parse: (raw: string) => number): number | undefined {
  const raw = node.getAttribute(attr)
  if (raw === null) return undefined
  const value = parse(raw)
  return Number.isFinite(value) && value >= 0 ? value : undefined
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

function autoMount() {
  if (typeof document === 'undefined') return
  for (const node of document.querySelectorAll<HTMLElement>('[data-lc-comments]')) {
    if (node.hasAttribute('data-lc-mounted')) continue
    const site = node.getAttribute('data-lc-site') ?? document.currentScript?.getAttribute('data-lc-site') ?? ''
    const baseUrl = node.getAttribute('data-lc-base-url') ?? ''
    if (!site || !baseUrl) continue
    const limitRaw = node.getAttribute('data-lc-limit')
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
      limit: limitRaw ? Number(limitRaw) : undefined,
      theme: (node.getAttribute('data-lc-theme') as Theme | null) ?? undefined,
      signInUrl: node.getAttribute('data-lc-sign-in-url') ?? undefined,
      viewerUserId: node.getAttribute('data-lc-viewer-user-id') ?? undefined,
      viewerRole: viewerRoleAttr === 'admin' || viewerRoleAttr === 'moderator' ? viewerRoleAttr : undefined,
      anonEditWindowMinutes: readNumber(node, 'data-lc-anon-edit-window-minutes', Number.parseFloat),
      actionMode: readActionMode(node),
      bodyLimit: readNumber(node, 'data-lc-body-limit', Number.parseInt),
      lazy: node.hasAttribute('data-lc-lazy'),
      themeVars: parseThemeAttrs(Array.from(node.attributes, (a) => [a.name, a.value] as [string, string])),
    })
  }

  for (const node of document.querySelectorAll<HTMLElement>('[data-lc-viewer]')) {
    if (node.hasAttribute('data-lc-mounted')) continue
    const site = node.getAttribute('data-lc-site') ?? document.currentScript?.getAttribute('data-lc-site') ?? ''
    const baseUrl = node.getAttribute('data-lc-base-url') ?? ''
    if (!site || !baseUrl) continue
    const limitRaw = node.getAttribute('data-lc-limit')
    node.setAttribute('data-lc-mounted', 'true')
    renderCommentViewer(node, {
      site,
      baseUrl,
      pageUrl: node.getAttribute('data-lc-page-url') ?? undefined,
      limit: limitRaw ? Number(limitRaw) : undefined,
      theme: (node.getAttribute('data-lc-theme') as Theme | null) ?? undefined,
      lazy: node.hasAttribute('data-lc-lazy'),
      themeVars: parseThemeAttrs(Array.from(node.attributes, (a) => [a.name, a.value] as [string, string])),
    })
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount, { once: true })
  else autoMount()
}
