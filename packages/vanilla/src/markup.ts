// HTML builders for the plain-HTML widget: error and sign-in markup, comment rows and trees, pager and sort controls, the composer.

import type {
  Comment,
  ErrorInfo,
  ReactionSummary,
  ThreadNode,
  ThreadSort,
  ViewerRole,
  VoteValue,
} from '@last-comments-widgets/client'
import {
  canDeleteComment,
  collectThreadParticipants,
  DEFAULT_BODY_LIMIT,
  foldReplySummary,
  formatRelativeTime,
  getEditKey,
  renderMarkdown,
  type SignInOperation,
  safeUrl,
  signInRequired,
} from '@last-comments-widgets/client'
import { canEditComment, ITEM_INITIAL, type ItemState } from './state'
import type { ActionMode } from './types'

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
export const INVALID_BODY: ErrorInfo = {
  code: null,
  title: "That didn't work",
  message: 'Please write a comment first.',
  action: 'none',
}

export const INVALID_REPLY: ErrorInfo = { ...INVALID_BODY, message: 'Please write a reply first.' }

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

// A sign-in request, not a failure: the neutral card login and private sites show. Its colours are the
// --lc-signin-* tokens, so a host retheme reaches it.
export function signInPromptMarkup(
  info: ErrorInfo,
  context: SignInOperation,
  opts: { signInUrl?: string } = {},
): string {
  const signInUrl = safeUrl(opts.signInUrl)
  const button = signInUrl
    ? `<a href="${escapeHtml(signInUrl)}" class="lc-signin-button">Sign in</a>`
    : '<button type="button" data-action="error-sign-in" class="lc-signin-button">Sign in</button>'
  return `<div class="lc-signin" role="status" data-lc-signin data-signin-context="${context}">
  <p class="font-medium">${escapeHtml(info.title)}</p>
  <p>${escapeHtml(info.message)}</p>
  <div class="mt-2 flex flex-wrap items-center gap-2">${button}</div>
</div>`
}

// Lucide path data, inlined: the vanilla port ships no icon dependency.
// The paths are the upstream lucide ones, so every port draws the same glyph.
const ICONS: Record<string, string> = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'smile-plus':
    '<path d="M22 11v1a10 10 0 1 1-9-10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/><path d="M16 5h6"/><path d="M19 2v6"/>',
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

export function icon(name: string, className = ''): string {
  // The width/height attributes mirror lucide's own output, so an icon that
  // carries no size class still paints at the same 24px box as the other ports.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${className ? ` class="${className}"` : ''}>${ICONS[name] ?? ''}</svg>`
}

// React's `buttonVariants`, spelled out: BASE plus the variants and sizes this
// port renders. React merges the base icon size away with cva/tailwind-merge,
// so a caller here puts the size class on the icon itself.
export const BTN =
  "lc-button group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

const BTN_PRIMARY = 'bg-primary text-primary-foreground hover:bg-primary/80'

export const BTN_GHOST =
  'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50'

export const BTN_OUTLINE =
  'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50'

export const BTN_SECONDARY =
  'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground'

const BTN_DEFAULT = 'h-8 gap-1.5 px-2.5'

const BTN_ICON_XS = 'size-6 rounded-[min(var(--radius-md),10px)]'

const BTN_ICON_SM = 'size-7 rounded-[min(var(--radius-md),12px)]'

const BTN_XS = 'h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs'

export const BTN_SM =
  'h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[length:calc(var(--lc-font-size,1rem)*0.8)]'

const MENU_ITEM_CLASS =
  "lc-action flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

// Destructive entries (delete) take the alarm colour instead of the action tone.
const MENU_ITEM_DESTRUCTIVE_CLASS = `${MENU_ITEM_CLASS} lc-action-destructive`

// React's PopoverContent: a dialog panel (not a menu), portaled into the root.
export const ACTIONS_MENU_CLASS =
  'lc-actions-menu fixed z-50 flex w-auto min-w-36 flex-col rounded-lg bg-popover p-1 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none'

// React's DropdownMenuContent: a menu panel, also portaled into the root.
export const IDENTITY_MENU_CLASS =
  'lc-identity-menu fixed z-50 min-w-32 overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none'

const IDENTITY_ITEM_COMMON =
  "lc-identity-item relative flex cursor-default items-center gap-1.5 rounded-md text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

export const IDENTITY_RADIO_ITEM_CLASS = `${IDENTITY_ITEM_COMMON} py-1 pr-8 pl-1.5`

export const IDENTITY_ITEM_CLASS = `${IDENTITY_ITEM_COMMON} px-1.5 py-1`

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

export function voteButtonClass(active: boolean): string {
  return `${BTN} ${BTN_SM} ${active ? BTN_PRIMARY : BTN_GHOST}`
}

function voteButton(comment: Comment, value: VoteValue, label: string, glyph: string): string {
  const active = comment.viewerVote === value
  return `<button type="button" data-action="vote" data-comment-id="${escapeHtml(comment.id)}" data-value="${value}" aria-pressed="${active}" aria-label="${label}" class="${voteButtonClass(active)}">${icon(glyph, 'size-3.5')}</button>`
}

// Reactions: `off` renders nothing; `counts` shows the chips without a way to change them; `interactive` lets a
// signed-in visitor react.
export type ReactionMode = 'off' | 'counts' | 'interactive'

type ReactionGroup = {
  // Null for the page bar; a comment's id for the reactions under that comment.
  commentId: string | null
  mode: ReactionMode
  allowed: string[]
  reactions: ReactionSummary[]
  disabled: boolean
  picking: boolean
}

function reactionChip(emoji: string, reaction: ReactionSummary, action: string, disabled: boolean): string {
  const label = `${emoji}, ${reaction.count} ${reaction.count === 1 ? 'reaction' : 'reactions'}`
  return `<button type="button" ${action} data-emoji="${escapeHtml(emoji)}" aria-pressed="${reaction.viewerReacted}" aria-label="${escapeHtml(label)}"${disabled ? ' disabled' : ''} class="lc-reaction ${BTN} ${BTN_SM} ${BTN_GHOST}"><span aria-hidden="true">${escapeHtml(emoji)}</span>${reaction.count > 0 ? `<span class="lc-reaction-count text-xs tabular-nums">${reaction.count}</span>` : ''}</button>`
}

// The chips for one page or one row. A comment shows the reactions it has and a picker that opens the allowed set;
// the page bar is the allowed set.
export function reactionGroupMarkup(group: ReactionGroup): string {
  if (group.mode === 'off' || group.allowed.length === 0) return ''
  const picker = group.commentId !== null
  const interactive = group.mode === 'interactive'
  const shown =
    picker && !(group.picking && interactive) ? group.reactions.map((reaction) => reaction.emoji) : group.allowed
  if (shown.length === 0 && !(picker && interactive)) return ''
  const id = group.commentId === null ? '' : escapeHtml(group.commentId)
  const chips = shown
    .map((emoji) => {
      const reaction = group.reactions.find((candidate) => candidate.emoji === emoji) ?? {
        emoji,
        count: 0,
        viewerReacted: false,
      }
      const target = group.commentId === null ? '' : ` data-comment-id="${id}"`
      const action = interactive
        ? `data-action="${group.commentId === null ? 'react-page' : 'react'}"${target} data-reacted="${reaction.viewerReacted}"`
        : ''
      return reactionChip(emoji, reaction, action, group.disabled || !interactive)
    })
    .join('')
  const addButton =
    picker && interactive
      ? `<button type="button" data-action="react-picker" data-comment-id="${id}" aria-expanded="${group.picking}" aria-label="${group.picking ? 'Close reactions' : 'Add reaction'}"${group.disabled ? ' disabled' : ''} class="lc-action lc-reaction-add ${BTN} ${BTN_GHOST} ${BTN_ICON_XS}">${icon('smile-plus', 'size-3.5')}</button>`
      : ''
  const scope = group.commentId === null ? 'data-lc-page-reactions' : `data-lc-reactions data-comment-id="${id}"`
  const label = group.commentId === null ? 'Reactions to this page' : 'Reactions'
  return `<div role="group" aria-label="${label}" class="lc-reactions flex flex-wrap items-center gap-1" ${scope}>${chips}${addButton}</div>`
}

type RowParts = { body: string; initials: string; avatar: string | null }

// Markdown and avatars only change when the row object changes: a vote patch or
// a reload creates new objects, so a WeakMap keeps repaints cheap. First paint
// decides the mode, so both markdown variants are cached per comment.
const rowPartsCache = new WeakMap<Comment, { plain?: RowParts; math?: RowParts }>()

function commentParts(comment: Comment, math: boolean): RowParts {
  let cached = rowPartsCache.get(comment)
  if (!cached) {
    cached = {}
    rowPartsCache.set(comment, cached)
  }
  const key = math ? 'math' : 'plain'
  let parts = cached[key]
  if (!parts) {
    parts = {
      body: renderMarkdown(comment.bodyMarkdown, { math }),
      initials: initials(comment.authorName),
      avatar: safeUrl(comment.avatarUrl) ?? null,
    }
    cached[key] = parts
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
  // False when the site asks a visitor to sign in before writing: Reply opens the sign-in prompt, not the form.
  writeAllowed?: boolean
  signInUrl?: string
  viewerUserId?: string
  viewerRole?: ViewerRole
  // Per-row slot state (editor, reply, collapse), keyed by comment id.
  items?: Record<string, ItemState>
  anonWindowMinutes?: number
  actionMode?: ActionMode
  bodyLimit?: number
  // Render `$…$` / `$$…$$` placeholders; the caller runs the KaTeX upgrade.
  math?: boolean
  readOnly?: boolean
  pendingModeration?: Record<string, boolean>
  submitDisabled?: boolean
  // Host-level flag (page locked); hidden/deleted rows hide votes regardless.
  hideVotes?: boolean
  // The reaction control, and the host's allowed set; the in-flight and open-picker rows come from the widget.
  reactionMode?: ReactionMode
  reactionEmoji?: string[]
  reactionsLocked?: boolean
  pendingReactions?: ReadonlySet<string>
  reactionPickers?: ReadonlySet<string>
  parentAuthorName?: string
}

// The ⋮ menu: secondary actions live behind it so a comment reads as content
// first. Reply stays outside — it is the one action worth a permanent target.
// React renders the panel as a dialog popover portaled into the widget root, so
// the entries keep no menu role and the panel is mounted only while open.
export function actionEntries(
  comment: Comment,
  ctx: {
    canEdit: boolean
    editing: boolean
    canDelete: boolean
    viewerRole?: ViewerRole
    pending: boolean
  },
): string[] {
  const { canEdit, editing, canDelete, viewerRole, pending } = ctx
  const id = escapeHtml(comment.id)
  const entry = (attrs: string, iconName: string, label: string, destructive = false) =>
    `<button type="button" ${attrs} class="${destructive ? MENU_ITEM_DESTRUCTIVE_CLASS : MENU_ITEM_CLASS}">${icon(iconName)}${label}</button>`
  const entries: string[] = []
  if (canEdit && !editing) entries.push(entry(`data-action="menu-edit" data-comment-id="${id}"`, 'pencil', 'Edit'))
  // Delete is soft (status 'deleted', restorable by a moderator), so the menu
  // entry acts immediately instead of asking for confirmation.
  if (canDelete && !viewerRole && !editing)
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
    canDelete: boolean
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
    ? ''
    : `${avatarMarkup(comment.authorName, safeUrl(comment.avatarUrl) ?? null)}<span class="min-w-0 truncate font-medium">${escapeHtml(comment.authorName)}</span>`
  const caption =
    depth > 0 && options.parentAuthorName && !deleted
      ? `<p class="mt-1 text-xs text-muted-foreground">Replying to <span class="font-medium text-foreground">@${escapeHtml(options.parentAuthorName)}</span></p>`
      : ''
  const body = deleted ? '[This comment was deleted]' : 'This comment is under review.'
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
    writeAllowed = true,
    signInUrl,
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
  const canDelete = writeAllowed && canDeleteComment(comment, viewerUserId, getEditKey(comment.id) !== null)
  const canEdit =
    writeAllowed &&
    canEditComment(comment, viewerUserId, {
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
  const parts = commentParts(comment, options.math ?? false)
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
  // A signed-out visitor on a login site gets the sign-in prompt where the reply form would open.
  const replyForm =
    !readOnly && !editing && replyTo === comment.id
      ? `<div class="my-3">${
          writeAllowed
            ? renderForm({
                parentId: comment.id,
                turnstileSiteKey,
                guest,
                formId: `reply-${comment.id}`,
                bodyLimit,
                pending: replying,
                error: replyError,
                submitDisabled,
              })
            : signInPromptMarkup(signInRequired('reply'), 'reply', { signInUrl })
        }</div>`
      : ''
  // The editor replaces the body; an open reply sits below it, so the message being answered stays visible.
  const body = editing ? '' : `<div class="lc-markdown my-3 font-sans text-sm">${parts.body}</div>`
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
  // A read-only viewer sees the counts and no control.
  const reactionMode: ReactionMode =
    readOnly && options.reactionMode === 'interactive' ? 'counts' : (options.reactionMode ?? 'off')
  const reactions = reactionGroupMarkup({
    commentId: comment.id,
    mode: reactionMode,
    allowed: options.reactionEmoji ?? [],
    reactions: comment.reactions,
    disabled: (options.pendingReactions?.has(comment.id) ?? false) || (options.reactionsLocked ?? false),
    picking: options.reactionPickers?.has(comment.id) ?? false,
  })
  const expanded = `${caption}
  ${editor}${body}${reactions}${replyForm}
  ${readOnly ? '' : `<div class="flex flex-wrap items-center gap-1 text-sm">${replyAction}</div>`}
  ${children.length > 0 ? replyGroup(node, depth, options) : ''}`
  return `<article class="lc-comment${depth > 0 ? ' lc-reply' : ''}" data-depth="${depth}" data-comment-id="${id}" data-comment-depth="${depth}">
  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
    <button type="button" data-action="collapse" data-comment-id="${id}" aria-expanded="${!collapsed}" aria-label="${collapsed ? 'Expand' : 'Collapse'} comment by ${escapeHtml(comment.authorName)}" class="lc-action lc-collapse ${BTN} ${BTN_GHOST} ${BTN_ICON_XS}">${icon(collapsed ? 'plus' : 'minus', 'size-3')}</button>
    ${avatarMarkup(comment.authorName, parts.avatar)}
    <span class="min-w-0 truncate font-medium${comment.authorRole === 'admin' ? ' lc-author-admin' : ''}">${escapeHtml(comment.authorName)}</span>
    ${comment.authorRole === 'admin' ? badge('default', 'lc-admin-badge', 'Admin') : ''}
    ${comment.authorRole === 'member' ? badge('default', 'lc-member-badge', 'Member') : ''}
    ${comment.userBlocked ? badge('outline', 'lc-blocked-badge', `${icon('ban')}blocked`) : ''}
    <time dateTime="${escapeHtml(comment.createdAt)}" title="${escapeHtml(new Date(comment.createdAt).toLocaleString())}" class="text-xs text-muted-foreground">${escapeHtml(formatRelativeTime(comment.createdAt))}</time>
    ${flags}
    ${readOnly ? '' : actionsTrigger(comment, actionEntries(comment, { canEdit, editing, canDelete, viewerRole, pending: moderationPending }))}
    ${hideVotes ? '' : `<span class="ml-auto"><div class="lc-vote flex items-center gap-0.5">${score}</div></span>`}
  </div>
  ${collapsed ? `<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-lc-collapsed="">${folded}</div>` : expanded}
</article>`
}

export function renderCommentTree(nodes: ThreadNode[], options: CommentNodeOptions = {}): string {
  return nodes.map((n) => renderCommentNode(n, 0, options)).join('')
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
  return `<div class="flex items-center gap-1" role="group" aria-label="Sort comments">
      <span class="mr-1 text-xs text-muted-foreground">Sort</span>
      ${button('newest', 'Newest')}
      ${button('oldest', 'Oldest')}
      ${button('best', 'Best')}
    </div>`
}

export function renderForm(opts: {
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
  const turnstile = opts.turnstileSiteKey
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
        <button type="submit" data-lc-label="${submitLabel}" ${opts.submitDisabled || opts.pending ? 'disabled' : ''} class="${BTN} ${BTN_DEFAULT} ${BTN_PRIMARY}">${opts.pending ? 'Posting…' : submitLabel}</button>
      </div>
    </div>
  </form>`
}

// One row per expected comment; 3 on a first load, 2 while the next page of
// rows is fetched. The viewer variant omits the interactive slots the real
// read-only row never renders (menu, vote buttons, Reply).
export function skeletonBlock(count: number, readOnly = false): string {
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
export function attributionMarkup(): string {
  return `<footer class="lc-footer mt-2 text-right text-xs text-muted-foreground">Powered by <a class="underline underline-offset-4 hover:text-foreground" href="https://github.com/lst97-oss/last-comments" target="_blank" rel="noreferrer">last-comments</a></footer>`
}
