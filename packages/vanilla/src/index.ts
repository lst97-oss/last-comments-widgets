export type { ThemeVars, WidgetTheme } from '@last-comments-widgets/client'

import type {
  Comment,
  ErrorInfo,
  LastCommentsClient,
  ModerationAction,
  ThemeVars,
  ThreadNode,
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
  canModerate,
  createClient,
  DEFAULT_EDIT_WINDOW_MINUTES,
  describeError,
  fetchViewerSession,
  isEditWindowOpen,
  loadThreadWindow,
  moderationCommentToComment,
  normalizePageUrl,
  renderMarkdown,
  safeUrl,
  signOutViewerSession,
  THEME_CSS_VARIABLES,
  themeVarsToStyle,
} from '@last-comments-widgets/client'

export type Theme = 'light' | 'dark' | 'system'

export type MountOptions = {
  site: string
  baseUrl: string
  pageUrl?: string
  // Host-known thread id: moderator mode then addresses this page directly
  // instead of matching `pageUrl` against the site's (capped) page list.
  pageId?: string
  turnstileSiteKey?: string
  limit?: number
  theme?: Theme
  themeVars?: WidgetTheme
  signInUrl?: string
  viewerUserId?: string
  viewerRole?: ViewerRole
  editWindowMinutes?: number
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
      render(el: HTMLElement, opts: Record<string, unknown>): string
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

// A local guard, not a server failure: it has nothing to retry.
const INVALID_BODY: ErrorInfo = {
  code: null,
  title: "That didn't work",
  message: 'Please write a comment first.',
  action: 'none',
}

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

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function voteButtonClass(active: boolean): string {
  return `rounded border border-border px-2 py-1 text-sm ${active ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground'}`
}

function voteButton(comment: Comment, value: VoteValue, label: string, glyph: string): string {
  const active = comment.viewerVote === value
  return `<button type="button" data-action="vote" data-comment-id="${escapeHtml(comment.id)}" data-value="${value}" aria-pressed="${active}" aria-label="${label}" class="${voteButtonClass(active)}">${glyph}</button>`
}

type RowParts = { body: string; date: string; initials: string; avatar: string | null }
// Markdown, dates and avatars only change when the row object changes: a vote
// patch or a reload creates new objects, so a WeakMap keeps repaints cheap.
const rowPartsCache = new WeakMap<Comment, RowParts>()

function commentParts(comment: Comment): RowParts {
  let parts = rowPartsCache.get(comment)
  if (!parts) {
    parts = {
      body: renderMarkdown(comment.bodyMarkdown),
      date: formatDate(comment.createdAt),
      initials: initials(comment.authorName),
      avatar: safeUrl(comment.avatarUrl) ?? null,
    }
    rowPartsCache.set(comment, parts)
  }
  return parts
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
  editingId?: string | null
  editWindowMinutes?: number
  readOnly?: boolean
  pendingModeration?: Record<string, boolean>
  submitDisabled?: boolean
  // Host-level flag (page locked); hidden/deleted rows hide votes regardless.
  hideVotes?: boolean
}

function moderationButton(comment: Comment, action: ModerationAction, label: string, pending: boolean): string {
  const destructive = action === 'delete' ? ' lc-action-destructive' : ''
  return `<button type="button" data-action="moderate" data-moderation-action="${action}" data-comment-id="${escapeHtml(comment.id)}" ${pending ? 'disabled' : ''} class="lc-action${destructive} underline-offset-4 hover:underline disabled:opacity-50">${label}</button>`
}

function blockButton(comment: Comment, pending: boolean): string {
  const blocked = Boolean(comment.userBlocked)
  return `<button type="button" data-action="block-user" data-comment-id="${escapeHtml(comment.id)}" data-blocked="${blocked}" ${pending ? 'disabled' : ''} class="lc-action underline-offset-4 hover:underline disabled:opacity-50">${blocked ? 'Unblock user' : 'Block user'}</button>`
}

export function renderCommentNode(node: ThreadNode, depth: number, options: CommentNodeOptions = {}): string {
  const { comment, children } = node
  const {
    replyTo = null,
    turnstileSiteKey,
    guest = true,
    viewerUserId,
    viewerRole,
    editingId = null,
    editWindowMinutes = DEFAULT_EDIT_WINDOW_MINUTES,
    readOnly = false,
    pendingModeration,
    submitDisabled = false,
  } = options
  const kids =
    children.length > 0
      ? `<div class="mt-3 grid gap-4">${children.map((c) => renderCommentNode(c, depth + 1, options)).join('')}</div>`
      : ''
  const replyForm =
    !readOnly && replyTo === comment.id
      ? `<div class="mt-3">${renderForm({ parentId: comment.id, turnstileSiteKey, guest, formId: `reply-${comment.id}`, submitDisabled })}</div>`
      : ''
  const isOwner = !!viewerUserId && !!comment.userId && viewerUserId === comment.userId
  const canEdit = isOwner && isEditWindowOpen(comment.createdAt, Date.now(), editWindowMinutes)
  const canReplyHere = !(viewerRole && comment.status !== 'visible')
  const moderationPending = pendingModeration?.[comment.id] ?? false
  // The host hides votes list-wide (locked page) and hidden/deleted rows never
  // offer them: voting is rejected in both cases.
  const hideVotes = Boolean(options.hideVotes) || (Boolean(viewerRole) && comment.status !== 'visible')
  const parts = commentParts(comment)
  const avatar = parts.avatar
    ? `<img src="${escapeHtml(parts.avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="lc-avatar h-8 w-8 rounded-full object-cover" />`
    : `<span class="lc-avatar flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium" aria-hidden="true">${escapeHtml(parts.initials)}</span>`
  const badges = `${comment.editedAt ? '<span class="text-xs text-muted-foreground">edited</span>' : ''}${comment.pinnedAt ? '<span class="text-xs text-muted-foreground">pinned</span>' : ''}${comment.status === 'hidden' ? '<span class="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">hidden</span>' : ''}${comment.status === 'deleted' ? '<span class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">deleted</span>' : ''}`
  const score = readOnly
    ? `<span class="text-sm text-muted-foreground">${escapeHtml(String(comment.score))}</span>`
    : `${voteButton(comment, 1, 'Upvote', '▲')}
    <span class="text-sm text-muted-foreground" aria-label="Score">${escapeHtml(String(comment.score))}</span>
    ${voteButton(comment, -1, 'Downvote', '▼')}`
  const actions =
    readOnly || editingId === comment.id
      ? ''
      : `<div class="flex flex-wrap items-center gap-3 text-sm">
    ${
      canReplyHere
        ? `<button type="button" data-action="reply" data-comment-id="${escapeHtml(comment.id)}" aria-expanded="${replyTo === comment.id}" class="lc-action font-medium underline-offset-4 hover:underline">Reply</button>`
        : ''
    }
    ${
      canEdit
        ? `<button type="button" data-action="edit" data-comment-id="${escapeHtml(comment.id)}" class="lc-action underline-offset-4 hover:underline">Edit</button>`
        : ''
    }${
      isOwner && !viewerRole
        ? `<button type="button" data-action="delete" data-comment-id="${escapeHtml(comment.id)}" class="lc-action lc-action-destructive underline-offset-4 hover:underline">Delete</button>`
        : ''
    }
  </div>`
  const moderationActions =
    viewerRole && !readOnly
      ? `<div class="mt-2 flex flex-wrap items-center gap-3 text-sm">
    ${
      comment.status === 'visible'
        ? moderationButton(comment, 'hide', 'Hide', moderationPending)
        : moderationButton(comment, 'restore', 'Restore', moderationPending)
    }
    ${
      comment.status === 'visible'
        ? comment.pinnedAt
          ? moderationButton(comment, 'unpin', 'Unpin', moderationPending)
          : moderationButton(comment, 'pin', 'Pin', moderationPending)
        : ''
    }
    ${comment.status !== 'deleted' ? moderationButton(comment, 'delete', 'Delete', moderationPending) : ''}
    ${comment.userId ? blockButton(comment, moderationPending) : ''}
  </div>`
      : ''
  const body =
    !readOnly && editingId === comment.id
      ? `<div class="my-3">${renderForm({ formId: `edit-${comment.id}`, initialBody: comment.bodyMarkdown, submitLabel: 'Save' })}
      <div class="mt-2"><button type="button" data-action="cancel-edit" class="rounded border border-border px-3 py-1 text-sm text-muted-foreground">Cancel</button></div></div>`
      : `<div class="lc-markdown my-3 font-sans text-sm">${parts.body}</div>`
  return `<article data-comment-id="${escapeHtml(comment.id)}" class="lc-comment min-w-0 ${depth > 0 ? 'lc-reply ml-6 border-l border-border' : ''}">
  <div class="flex flex-wrap items-center gap-2">
    ${avatar}
    <span class="min-w-0 break-words font-medium">${escapeHtml(comment.authorName)}</span>
    <time class="text-xs text-muted-foreground" dateTime="${escapeHtml(comment.createdAt)}">${escapeHtml(parts.date)}</time>
    ${badges}
    ${hideVotes ? '' : `<span class="lc-vote ml-auto flex items-center gap-1">${score}</span>`}
  </div>
  ${body}
  ${actions}
  ${moderationActions}
  ${replyForm}
  ${kids}
</article>`
}

export function renderCommentTree(nodes: ThreadNode[], options: CommentNodeOptions = {}): string {
  return nodes.map((n) => renderCommentNode(n, 0, options)).join('')
}

export type UiState = {
  replyTo: string | null
  editingId: string | null
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
  | { type: 'edit'; value: string | null }
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
  editingId: null,
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
  switch (action.type) {
    case 'reply':
      return { ...state, replyTo: action.value }
    case 'edit':
      return { ...state, editingId: action.value }
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
}): string {
  const guest = opts.guest ?? true
  const turnstile =
    guest && opts.turnstileSiteKey
      ? `<div class="lc-turnstile" data-turnstile-sitekey="${escapeHtml(opts.turnstileSiteKey)}"></div>`
      : ''
  const cancel = opts.parentId
    ? `<button type="button" data-action="cancel-reply" class="rounded border border-border px-3 py-2 text-sm text-muted-foreground">Cancel</button>`
    : ''
  const submitLabel = escapeHtml(opts.submitLabel ?? (opts.parentId ? 'Post reply' : 'Post comment'))
  return `<form data-lc-form="${escapeHtml(opts.formId)}" class="lc-composer rounded-xl border border-border p-3">
    ${opts.parentId ? `<input type="hidden" name="parentId" value="${escapeHtml(opts.parentId)}" />` : ''}
    <div class="mb-1 flex items-center justify-end gap-0.5">
      <div class="mr-auto flex gap-0.5">
        <button type="button" data-action="preview" aria-pressed="false" class="rounded px-2 py-1 text-sm text-muted-foreground">Preview</button>
      </div>
      <div class="flex gap-0.5" role="toolbar" aria-label="Markdown formatting">
        <button type="button" data-action="md-bold" class="rounded px-2 py-1 text-sm text-muted-foreground" title="Bold" aria-label="Bold"><b>B</b></button>
        <button type="button" data-action="md-italic" class="rounded px-2 py-1 text-sm text-muted-foreground" title="Italic" aria-label="Italic"><i>I</i></button>
        <button type="button" data-action="md-quote" class="rounded px-2 py-1 text-sm text-muted-foreground" title="Quote" aria-label="Quote">&quot;</button>
        <button type="button" data-action="md-code" class="rounded px-2 py-1 text-sm text-muted-foreground" title="Code" aria-label="Code">&lt;&gt;</button>
        <button type="button" data-action="md-link" class="rounded px-2 py-1 text-sm text-muted-foreground" title="Link" aria-label="Link">link</button>
        <button type="button" data-action="md-bullet" class="rounded px-2 py-1 text-sm text-muted-foreground" title="Bullet list" aria-label="Bullet list">•</button>
        <button type="button" data-action="md-ordered" class="rounded px-2 py-1 text-sm text-muted-foreground" title="Numbered list" aria-label="Numbered list">1.</button>
      </div>
    </div>
    <textarea name="bodyMarkdown" required maxlength="10000" rows="4" placeholder="${opts.parentId ? 'Write a reply…' : 'Your comment here…'}" aria-label="${opts.parentId ? 'Reply body' : 'Comment body'}" class="w-full border-0 bg-transparent px-1 text-sm focus-visible:ring-0">${escapeHtml(opts.initialBody ?? '')}</textarea>
    ${turnstile}
    <div class="hidden" data-lc-form-error></div>
    <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      ${opts.signInHtml ?? ''}
      ${guest ? '<input name="authorName" type="text" maxlength="80" placeholder="Anonymous" aria-label="Your name" autocomplete="nickname" class="w-32 min-w-0 border-0 bg-transparent px-1 text-sm focus-visible:ring-0 sm:w-40" />' : ''}
      <p class="hidden text-xs text-muted-foreground sm:block">Styling with <span class="font-medium text-primary">Markdown</span> is supported</p>
      <button type="submit" ${opts.submitDisabled ? 'disabled' : ''} class="ml-auto rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">${submitLabel}</button>
      ${cancel}
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

// One card per expected comment; 3 on a first load, 2 while the next page of
// rows is fetched.
function skeletonBlock(count: number): string {
  const card = `<div class="rounded-lg border border-border p-4">
      <div class="flex items-center gap-3">
        <div class="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted"></div>
        <div class="h-4 w-32 lc-skeleton animate-pulse bg-muted"></div>
      </div>
      <div class="mt-3 space-y-2">
        <div class="h-4 w-full lc-skeleton animate-pulse bg-muted"></div>
        <div class="h-4 w-4/5 lc-skeleton animate-pulse bg-muted"></div>
      </div>
      <div class="mt-3 flex gap-2">
        <div class="h-6 w-16 lc-skeleton animate-pulse bg-muted"></div>
        <div class="h-6 w-20 lc-skeleton animate-pulse bg-muted"></div>
      </div>
    </div>`
  return `<div role="status" aria-busy="true" class="grid gap-3">
    <span class="sr-only">Loading comments…</span>
    <div class="grid gap-3" aria-hidden="true">${card.repeat(count)}</div>
  </div>`
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
  // The tree is derived from the row cache: reuse it while both inputs hold.
  let treeKey: { comments: Comment[]; votes: VotePatch } | null = null
  let treeCache: ThreadNode[] = []
  let status: 'loading' | 'ready' | 'error' = 'loading'
  let error: ErrorInfo | null = null
  let hasMore = true
  // `comments` is the accumulated row cache; a page shows `limit` threads cut
  // from the tree built over it.
  let page = 1
  let loadingPage = false
  let destroyed = false
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

  const { apply: applyTheme, cleanup: cleanupTheme } = setupTheme(el, theme, options)
  // Theme variables are instance state: apply at mount and on media changes,
  // never on every paint.
  applyTheme()

  // First child of the composer form: which identity the comment posts as,
  // plus sign-in/sign-out. The panel is hand-rolled HTML driven by
  // `identityOpen` so a re-render keeps it consistent with the row.
  function signInRow(): string {
    // Moderators post as themselves through the moderation endpoint: the
    // anonymous/account switcher does not apply.
    if (moderator) return ''
    const { signed, label } = composerIdentity()
    const signInUrl = safeUrl(options.signInUrl)
    // The identity is unknown until the session request settles; showing a
    // guess here (or letting a post through) would pick the wrong wire flag.
    const trigger =
      sessionStatus === 'loading'
        ? '<span class="block h-4 w-16 animate-pulse rounded bg-muted"></span>'
        : `${escapeHtml(commentAs === 'anonymous' || !signed ? 'Anonymous' : label)} ▾`
    // A signed-out visitor has no account to be checked, so Anonymous is the
    // selected item even before they touch the menu.
    const anonymousSelected = commentAs === 'anonymous' || !signed
    const anonymous = `<button type="button" role="menuitemradio" aria-checked="${anonymousSelected}" data-action="identity-anonymous" data-selected="${anonymousSelected}" class="lc-identity-item block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent">Anonymous</button>`
    const account = signed
      ? `<button type="button" role="menuitemradio" aria-checked="${commentAs === 'account'}" data-action="identity-account" data-selected="${commentAs === 'account'}" class="lc-identity-item block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent">${escapeHtml(label)} (you)</button>`
      : signInUrl
        ? `<a role="menuitem" href="${escapeHtml(signInUrl)}" class="lc-identity-item block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent">Sign in…</a>`
        : `<button type="button" role="menuitem" data-action="signin" ${ui.signInPending ? 'disabled' : ''} class="lc-identity-item block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50">${ui.signInPending ? 'Signing in…' : 'Sign in…'}</button>`
    const signOut = session
      ? `<div role="separator" class="my-1 border-t border-border"></div>
      <button type="button" role="menuitem" data-action="signout" ${ui.signOutPending ? 'disabled' : ''} class="lc-identity-item block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50">${ui.signOutPending ? 'Signing out…' : 'Sign out'}</button>`
      : ''
    const panel = ui.identityOpen
      ? `<div role="menu" class="lc-identity-menu absolute left-0 top-full mt-1 max-w-[calc(var(--spacing)*8)] min-w-40 rounded-md border border-border bg-card p-1">${anonymous}${account}${signOut}</div>`
      : ''
    const alert = ui.identityError
      ? `<div class="w-full">${errorMarkup(ui.identityError.info, { retryAction: ui.identityError.retry })}</div>`
      : ''
    return `<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span class="text-xs text-muted-foreground">Comment as</span>
      <div class="relative">
        <button type="button" data-action="identity" aria-haspopup="menu" aria-expanded="${ui.identityOpen}" ${sessionStatus === 'loading' || ui.signInPending || ui.signOutPending ? 'disabled' : ''} class="lc-identity-trigger max-w-[calc(var(--spacing)*40)] truncate rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50">${trigger}</button>
        ${panel}
      </div>
    </div>${alert}`
  }

  function refreshSignInRow() {
    const host = el.querySelector('[data-lc-signin]')
    if (host) host.innerHTML = signInRow()
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
    ui = transition(ui, { type: 'identity/open', value: false })
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
    ui = transition(ui, { type: 'identity/open', value: false })
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
  // menu must be tested against its pre-click state here.
  function onDocumentClick(ev: Event) {
    if (!ui.identityOpen) return
    const host = el.querySelector('[data-lc-signin]')
    if (ev.target instanceof Node && host?.contains(ev.target)) return
    ui = transition(ui, { type: 'identity/open', value: false })
    refreshSignInRow()
  }

  function onDocumentKeydown(ev: KeyboardEvent) {
    if (ev.key !== 'Escape' || !ui.identityOpen) return
    ui = transition(ui, { type: 'identity/open', value: false })
    refreshSignInRow()
  }

  async function signIn() {
    ui = transition(ui, { type: 'signin/pending', value: true })
    ui = transition(ui, { type: 'identity/error', value: null })
    ui = transition(ui, { type: 'identity/open', value: false })
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
    if (!treeKey || treeKey.comments !== comments || treeKey.votes !== votes) {
      treeKey = { comments, votes }
      treeCache = buildCommentTree(applyVotes(comments, votes))
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
    if (page > 1 && roots.length <= (page - 1) * limit) page = Math.max(1, Math.ceil(roots.length / limit))
    const tree = renderCommentTree(roots.slice((page - 1) * limit, page * limit), {
      replyTo: ui.replyTo,
      turnstileSiteKey: options.turnstileSiteKey,
      guest,
      viewerUserId,
      viewerRole,
      editingId: ui.editingId,
      editWindowMinutes: options.editWindowMinutes ?? DEFAULT_EDIT_WINDOW_MINUTES,
      pendingModeration: ui.pendingModeration,
      submitDisabled: sessionStatus === 'loading',
      hideVotes: Boolean(viewerRole) && Boolean(pageLock?.locked),
    })
    const signIn = ui.needsSignIn
      ? `<p class="rounded-lg border border-border bg-card p-5 text-sm">Please sign in to vote. ${signInUrl ? `<a href="${escapeHtml(signInUrl)}" class="underline">Sign in</a>` : ''}</p>`
      : ''
    const pager = pagerMarkup(page, limit, roots.length, hasMore, loadingPage)
    return `${lockBar}${actionBanner}${signIn}<div class="space-y-3">${tree}</div>${loadingPage ? `<div class="mt-3">${skeletonBlock(2)}</div>` : ''}<div class="mt-3">${pager}</div>`
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
    })
  }

  // Identity-only repaint: the top composer keeps focus, selection and drafts.
  function renderComposer() {
    const composer = el.querySelector<HTMLElement>('[data-lc-composer]')
    if (!composer) return
    clearTurnstileWidgets(composer)
    composer.innerHTML = composerHtml()
    hydrateTurnstile()
  }

  // List-only repaint: the composer is never touched.
  function renderList() {
    const list = el.querySelector<HTMLElement>('[data-lc-list]')
    if (!list) return
    clearTurnstileWidgets(list)
    const drafts = captureDrafts(list)
    list.innerHTML = listBody()
    restoreDrafts(list, drafts)
    wrapMarkdownTables(list)
    hydrateTurnstile()
  }

  function render() {
    if (destroyed) return
    clearTurnstileWidgets(el)
    el.innerHTML = `<section aria-label="Comments" class="space-y-4"><div data-lc-composer>${composerHtml()}</div><div data-lc-list>${listBody()}</div></section>`
    wrapMarkdownTables(el)
    hydrateTurnstile()
  }

  // Both regions exist after the first paint; later paints only refresh the list.
  function paint() {
    if (el.querySelector('[data-lc-composer]')) renderList()
    else render()
  }

  function hydrateTurnstile() {
    if (!options.turnstileSiteKey || !composerIdentity().guest) return
    void ensureTurnstile().then(() => {
      if (destroyed || !window.turnstile) return
      for (const box of el.querySelectorAll<HTMLElement>('.lc-turnstile')) {
        const form = box.closest('form')
        const formId = form?.getAttribute('data-lc-form') ?? 'top'
        if (widgetIds.has(formId)) continue
        try {
          const id = window.turnstile.render(box, {
            sitekey: options.turnstileSiteKey,
            callback: (token: string) => {
              tokens.set(formId, token)
            },
          })
          widgetIds.set(formId, id)
        } catch {
          // Turnstile unavailable; server will report a distinct error.
        }
      }
    })
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
    page = 1
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
      const result = moderator ? await fillModeration((page + 1) * limit, seq) : await loadWindow(page + 1, seq)
      if (destroyed || result === 'stale' || seq !== loadSeq) return
    } catch (err) {
      if (destroyed || seq !== loadSeq) return
      loadFailure(err, false)
    }
    loadingPage = false
    if (currentTree().length > page * limit) page += 1
    renderList()
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
    const body = new FormData(form).get('bodyMarkdown')
    const name = new FormData(form).get('authorName')
    const parent = new FormData(form).get('parentId')
    const bodyMarkdown = typeof body === 'string' ? body.trim() : ''
    if (!bodyMarkdown) {
      fail(INVALID_BODY)
      return
    }
    // Anonymous posts always carry a name; the field is optional, so a blank
    // one posts as "Anonymous".
    const authorName = typeof name === 'string' ? name.trim() || 'Anonymous' : ''
    // Posting from the guest composer must never send the session cookie, so
    // the wire flag is the same derivation that gates the guest fields.
    const anonymous = composerIdentity().guest
    try {
      const isTopLevel = typeof parent !== 'string' || !parent
      // Moderators post through the moderation endpoint: the public create path
      // checks the site's origin allow-list, which a dashboard origin is not on.
      if (moderator && threadPageId) {
        await client.createModerationComment({
          pageId: threadPageId,
          bodyMarkdown,
          ...(typeof parent === 'string' && parent ? { parentId: parent } : {}),
        })
      } else {
        await client.postComment({
          url: pageUrl,
          bodyMarkdown,
          anonymous,
          ...(isTopLevel && typeof document !== 'undefined' ? { title: document.title } : {}),
          ...(authorName ? { authorName } : {}),
          ...(typeof parent === 'string' && parent ? { parentId: parent } : {}),
          ...(tokens.get(formId) ? { verificationToken: tokens.get(formId) } : {}),
        })
      }
      resetTurnstile(formId)
      // The composer stays mounted, so clear the submitted fields by hand.
      const area = form.querySelector<HTMLTextAreaElement>('textarea[name="bodyMarkdown"]')
      if (area) area.value = ''
      const nameInput = form.querySelector<HTMLInputElement>('input[name="authorName"]')
      if (nameInput) nameInput.value = ''
      ui = transition(ui, { type: 'reply', value: null })
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
      if (hadNotice) {
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
    const score = header.querySelector('[aria-label="Score"]')
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

  function togglePreview(button: HTMLElement, show: boolean) {
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
    button.setAttribute('aria-pressed', String(show))
  }

  async function saveEdit(commentId: string) {
    const article = el.querySelector(`[data-comment-id="${CSS.escape(commentId)}"]`)
    const form = article?.querySelector<HTMLFormElement>('form[data-lc-form]')
    if (!article || !form) return
    const raw = String(new FormData(form).get('bodyMarkdown') ?? '').trim()
    const errBox = article.querySelector('[data-lc-form-error]')
    ui = transition(ui, { type: 'error', value: null })
    if (!raw) {
      if (errBox) {
        errBox.innerHTML = errorMarkup(INVALID_BODY)
        errBox.classList.remove('hidden')
      }
      return
    }
    try {
      // Moderators edit through the moderation endpoint for the same reason they
      // post through it: the public PATCH checks the site's origins.
      const updated = moderator
        ? await client.editModerationComment({ commentId, bodyMarkdown: raw })
        : await client.editOwnComment({ commentId, bodyMarkdown: raw })
      comments = comments.map((c) => (c.id === commentId ? updated : c))
      ui = transition(ui, { type: 'edit', value: null })
    } catch (err) {
      const info = describeError(err, { title: "Your edit wasn't saved" })
      // The editor stays open (including when the window expired, so the copy
      // can still be copied out): the row's own slot is the one place to show
      // the failure, and re-rendering would wipe both it and the draft.
      if (errBox) {
        errBox.innerHTML = errorMarkup(info)
        errBox.classList.remove('hidden')
        return
      }
      ui = transition(ui, { type: 'error', value: info })
      renderList()
      return
    }
    renderList()
  }

  async function removeComment(commentId: string) {
    if (typeof confirm !== 'undefined' && !confirm('Delete this comment?')) return
    ui = transition(ui, { type: 'error', value: null })
    try {
      await client.deleteOwnComment(commentId)
      comments = comments.filter((c) => c.id !== commentId)
      if (ui.editingId === commentId) ui = transition(ui, { type: 'edit', value: null })
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
    if (action === 'preview') togglePreview(target, target.getAttribute('aria-pressed') !== 'true')
    else if (action === 'error-retry') void initialLoad()
    else if (action === 'error-sign-in') void signIn()
    else if (action === 'signin') void signIn()
    else if (action === 'identity') {
      ui = transition(ui, { type: 'identity/open', value: !ui.identityOpen })
      refreshSignInRow()
    } else if (action === 'identity-anonymous') setIdentity('anonymous')
    else if (action === 'identity-account') setIdentity('account')
    else if (action === 'signout') void signOut()
    else if (action === 'page-prev') {
      if (page > 1 && !loadingPage) {
        page -= 1
        renderList()
      }
    } else if (action === 'page-next') void nextPage()
    else if (action === 'reply') {
      ui = transition(ui, { type: 'reply', value: target.getAttribute('data-comment-id') })
      renderList()
    } else if (action === 'cancel-reply') {
      ui = transition(ui, { type: 'reply', value: null })
      renderList()
    } else if (action === 'vote') {
      const id = target.getAttribute('data-comment-id')
      const value = Number(target.getAttribute('data-value')) as VoteValue
      if (id && (value === 1 || value === -1)) void vote(id, value)
    } else if (action === 'edit') {
      ui = transition(ui, { type: 'edit', value: target.getAttribute('data-comment-id') })
      renderList()
    } else if (action === 'cancel-edit') {
      ui = transition(ui, { type: 'edit', value: null })
      renderList()
    } else if (action === 'delete') {
      const id = target.getAttribute('data-comment-id')
      if (id) void removeComment(id)
    } else if (action === 'moderate') {
      const id = target.getAttribute('data-comment-id')
      const moderationAction = target.getAttribute('data-moderation-action') as ModerationAction | null
      if (id && moderationAction) {
        if (moderationAction === 'delete' && typeof confirm !== 'undefined' && !confirm('Delete this comment?')) return
        void moderate(id, moderationAction)
      }
    } else if (action === 'toggle-lock') {
      void toggleLock()
    } else if (action === 'block-user') {
      const id = target.getAttribute('data-comment-id')
      const blocked = target.getAttribute('data-blocked') === 'true'
      if (id) void blockUser(id, !blocked)
    } else if (action?.startsWith('md-')) {
      const form = target.closest('form')
      if (form instanceof HTMLFormElement) onToolbar(form, action)
    }
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
  el.addEventListener('submit', onSubmit)
  document.addEventListener('click', onDocumentClick, true)
  document.addEventListener('keydown', onDocumentKeydown)
  if (theme === 'system' && typeof window !== 'undefined') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', applyTheme)
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
      // Both were rendered disabled while the identity was unknown.
      for (const button of el.querySelectorAll<HTMLButtonElement>('form[data-lc-form] button[type="submit"]'))
        button.disabled = false
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
      mediaQuery?.removeEventListener('change', applyTheme)
      cleanupTheme()
      el.removeEventListener('click', onClick)
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
  let treeKey: Comment[] | null = null
  let treeCache: ThreadNode[] = []
  let page = 1
  let hasMore = true
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
    if (treeKey !== rows) {
      treeKey = rows
      treeCache = buildCommentTree(rows)
    }
    return treeCache
  }

  function paint() {
    if (destroyed) return
    const roots = currentTree()
    const body =
      status === 'loading'
        ? skeletonBlock(3)
        : // The read-only viewer has no sign-in path, so its only remedy is a reload.
          status === 'error'
          ? errorMarkup(failure.action === 'sign-in' ? { ...failure, action: 'retry' } : failure)
          : roots.length === 0
            ? `<p class="text-sm text-muted-foreground">No comments yet.</p>`
            : `<div class="grid gap-4">${renderCommentTree(roots.slice((page - 1) * limit, page * limit), { readOnly: true })}</div>`
    const pager = pagerMarkup(page, limit, roots.length, hasMore, loadingPage)
    const pending = loadingPage && status === 'ready' ? `<div>${skeletonBlock(2)}</div>` : ''
    el.innerHTML = `<section aria-label="Comments" class="grid gap-4">${body}${pending}${pager}</section>`
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
    else if (action === 'page-prev') {
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
  const vars: ThemeVars = {}
  const dark: ThemeVars = {}
  for (const [name, value] of attrs) {
    const light = name.startsWith('data-lc-theme-var-')
    const darkAttr = name.startsWith('data-lc-theme-dark-var-')
    if (!light && !darkAttr) continue
    const key = THEME_ATTR_KEYS.get(name.slice((light ? 'data-lc-theme-var-' : 'data-lc-theme-dark-var-').length))
    if (!key) continue
    ;(light ? vars : dark)[key] = value
  }
  if (Object.keys(vars).length === 0 && Object.keys(dark).length === 0) return undefined
  return { vars, dark }
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
      limit: limitRaw ? Number(limitRaw) : undefined,
      theme: (node.getAttribute('data-lc-theme') as Theme | null) ?? undefined,
      signInUrl: node.getAttribute('data-lc-sign-in-url') ?? undefined,
      viewerUserId: node.getAttribute('data-lc-viewer-user-id') ?? undefined,
      viewerRole: viewerRoleAttr === 'admin' || viewerRoleAttr === 'moderator' ? viewerRoleAttr : undefined,
      editWindowMinutes: node.hasAttribute('data-lc-edit-window-minutes')
        ? Number.parseFloat(node.getAttribute('data-lc-edit-window-minutes') ?? '')
        : undefined,
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
