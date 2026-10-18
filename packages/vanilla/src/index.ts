export type { ThemeVars, WidgetTheme } from '@lst97-oss/client'

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
} from '@lst97-oss/client'
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
} from '@lst97-oss/client'

export type Theme = 'light' | 'dark' | 'system'

export type MountOptions = {
  site: string
  baseUrl: string
  pageUrl?: string
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

function voteButton(comment: Comment, value: VoteValue, label: string, glyph: string): string {
  const active = comment.viewerVote === value
  return `<button type="button" data-action="vote" data-comment-id="${escapeHtml(comment.id)}" data-value="${value}" aria-pressed="${active}" aria-label="${label}" class="rounded border border-border px-2 py-1 text-sm ${active ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground'}">${glyph}</button>`
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
}

function moderationButton(comment: Comment, action: ModerationAction, label: string, pending: boolean): string {
  return `<button type="button" data-action="moderate" data-moderation-action="${action}" data-comment-id="${escapeHtml(comment.id)}" ${pending ? 'disabled' : ''} class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50">${label}</button>`
}

function blockButton(comment: Comment, pending: boolean): string {
  const blocked = Boolean(comment.userBlocked)
  return `<button type="button" data-action="block-user" data-comment-id="${escapeHtml(comment.id)}" data-blocked="${blocked}" ${pending ? 'disabled' : ''} class="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50">${blocked ? 'Unblock user' : 'Block user'}</button>`
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
  const hideVotes = Boolean(viewerRole)
  const avatarUrl = safeUrl(comment.avatarUrl)
  const avatar = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="h-8 w-8 rounded-full object-cover" />`
    : `<span class="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium" aria-hidden="true">${escapeHtml(initials(comment.authorName))}</span>`
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
        ? `<button type="button" data-action="reply" data-comment-id="${escapeHtml(comment.id)}" aria-expanded="${replyTo === comment.id}" class="font-medium text-primary underline-offset-4 hover:underline">Reply</button>`
        : ''
    }
    ${
      canEdit
        ? `<button type="button" data-action="edit" data-comment-id="${escapeHtml(comment.id)}" class="text-muted-foreground underline-offset-4 hover:underline">Edit</button>`
        : ''
    }${
      isOwner && !viewerRole
        ? `<button type="button" data-action="delete" data-comment-id="${escapeHtml(comment.id)}" class="text-muted-foreground underline-offset-4 hover:underline">Delete</button>`
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
      : `<div class="lc-markdown my-3 font-sans text-sm">${renderMarkdown(comment.bodyMarkdown)}</div>`
  return `<article data-comment-id="${escapeHtml(comment.id)}" class="lc-comment min-w-0 ${depth > 0 ? 'lc-reply ml-6 border-l border-border pl-4' : ''}">
  <div class="flex flex-wrap items-center gap-2">
    ${avatar}
    <span class="min-w-0 break-words font-medium">${escapeHtml(comment.authorName)}</span>
    <time class="text-xs text-muted-foreground" dateTime="${escapeHtml(comment.createdAt)}">${escapeHtml(formatDate(comment.createdAt))}</time>
    ${badges}
    ${hideVotes ? '' : `<span class="ml-auto flex items-center gap-1">${score}</span>`}
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
  return `<form data-lc-form="${escapeHtml(opts.formId)}" class="lc-composer rounded-xl border border-border bg-muted/60 p-3">
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
        <div class="h-4 w-32 animate-pulse rounded bg-muted"></div>
      </div>
      <div class="mt-3 space-y-2">
        <div class="h-4 w-full animate-pulse rounded bg-muted"></div>
        <div class="h-4 w-4/5 animate-pulse rounded bg-muted"></div>
      </div>
      <div class="mt-3 flex gap-2">
        <div class="h-6 w-16 animate-pulse rounded bg-muted"></div>
        <div class="h-6 w-20 animate-pulse rounded bg-muted"></div>
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

  let comments: Comment[] = []
  let status: 'loading' | 'ready' | 'error' = 'loading'
  let error: ErrorInfo | null = null
  let hasMore = true
  // `comments` is the accumulated row cache; a page shows `limit` threads cut
  // from the tree built over it.
  let page = 1
  let loadingPage = false
  let replyTo: string | null = null
  let needsSignIn = false
  let editingId: string | null = null
  let destroyed = false
  let pageLock: { pageId: string; locked: boolean } | null = null
  let lockPending = false
  let pendingModeration: Record<string, boolean> = {}
  let actionError: ErrorInfo | null = null
  let signInPending = false
  // The identity error plus the flow its own retry button must re-run.
  let identityError: { info: ErrorInfo; retry: 'signin' | 'signout' } | null = null
  let signOutPending = false
  let session: ViewerSession | null = null
  let sessionStatus: 'loading' | 'ready' = 'loading'
  let commentAs: 'account' | 'anonymous' = 'account'
  let identityOpen = false
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
  let mediaQuery: MediaQueryList | null = null
  let observer: IntersectionObserver | null = null

  const { apply: applyTheme, cleanup: cleanupTheme } = setupTheme(el, theme, options)

  // First child of the composer form: which identity the comment posts as,
  // plus sign-in/sign-out. The panel is hand-rolled HTML driven by
  // `identityOpen` so a re-render keeps it consistent with the row.
  function signInRow(): string {
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
        : `<button type="button" role="menuitem" data-action="signin" ${signInPending ? 'disabled' : ''} class="lc-identity-item block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50">${signInPending ? 'Signing in…' : 'Sign in…'}</button>`
    const signOut = session
      ? `<div role="separator" class="my-1 border-t border-border"></div>
      <button type="button" role="menuitem" data-action="signout" ${signOutPending ? 'disabled' : ''} class="lc-identity-item block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50">${signOutPending ? 'Signing out…' : 'Sign out'}</button>`
      : ''
    const panel = identityOpen
      ? `<div role="menu" class="lc-identity-menu absolute left-0 top-full z-10 mt-1 max-w-[calc(100vw-2rem)] min-w-40 rounded-md border border-border bg-card p-1 shadow-md">${anonymous}${account}${signOut}</div>`
      : ''
    const alert = identityError
      ? `<div class="w-full">${errorMarkup(identityError.info, { retryAction: identityError.retry })}</div>`
      : ''
    return `<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span class="text-xs text-muted-foreground">Comment as</span>
      <div class="relative">
        <button type="button" data-action="identity" aria-haspopup="menu" aria-expanded="${identityOpen}" ${sessionStatus === 'loading' || signInPending || signOutPending ? 'disabled' : ''} class="lc-identity-trigger max-w-[10rem] truncate rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50">${trigger}</button>
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
  function wrapMarkdownTables(root: HTMLElement) {
    for (const table of root.querySelectorAll<HTMLTableElement>('.lc-markdown table')) {
      const wrap = document.createElement('div')
      wrap.className = 'w-full overflow-x-auto'
      table.parentElement?.insertBefore(wrap, table)
      wrap.appendChild(table)
    }
  }

  // Switching identity toggles the guest name input, the turnstile box and any
  // open reply forms, so the composer must be rebuilt — but from HTML, so put
  // back whatever the visitor already typed in every composer.
  function renderPreservingComposer() {
    const drafts = new Map<string, { body?: string; name?: string }>()
    for (const form of el.querySelectorAll<HTMLFormElement>('form[data-lc-form]')) {
      const id = form.getAttribute('data-lc-form')
      if (!id) continue
      const body = form.querySelector<HTMLTextAreaElement>('textarea[name="bodyMarkdown"]')?.value
      const name = form.querySelector<HTMLInputElement>('input[name="authorName"]')?.value
      if (body !== undefined || name !== undefined) drafts.set(id, { body, name })
    }
    render()
    for (const [id, draft] of drafts) {
      const form = el.querySelector<HTMLFormElement>(`form[data-lc-form="${CSS.escape(id)}"]`)
      const area = form?.querySelector<HTMLTextAreaElement>('textarea[name="bodyMarkdown"]')
      const input = form?.querySelector<HTMLInputElement>('input[name="authorName"]')
      if (area && draft.body !== undefined) area.value = draft.body
      if (input && draft.name !== undefined) input.value = draft.name
    }
  }

  function setIdentity(next: 'account' | 'anonymous') {
    identityOpen = false
    if (commentAs !== next) {
      commentAs = next
      // A token minted for the previous identity must not be posted with this one.
      resetTurnstile('top')
      renderPreservingComposer()
      return
    }
    refreshSignInRow()
  }

  async function signOut() {
    signOutPending = true
    identityError = null
    identityOpen = false
    refreshSignInRow()
    try {
      await signOutViewerSession({ baseUrl: options.baseUrl, fetchImpl: options.fetchImpl })
      session = null
      commentAs = 'anonymous'
    } catch (err) {
      identityError = { info: describeError(err, { title: "Sign-out didn't work" }), retry: 'signout' }
    } finally {
      signOutPending = false
    }
    renderPreservingComposer()
  }

  // Capture phase: the delegated click handler below runs on bubble, so the
  // menu must be tested against its pre-click state here.
  function onDocumentClick(ev: Event) {
    if (!identityOpen) return
    const host = el.querySelector('[data-lc-signin]')
    if (ev.target instanceof Node && host?.contains(ev.target)) return
    identityOpen = false
    refreshSignInRow()
  }

  function onDocumentKeydown(ev: KeyboardEvent) {
    if (ev.key !== 'Escape' || !identityOpen) return
    identityOpen = false
    refreshSignInRow()
  }

  async function signIn() {
    signInPending = true
    identityError = null
    identityOpen = false
    refreshSignInRow()
    try {
      const url = await beginOAuthSignIn({ baseUrl: options.baseUrl, pageUrl, fetchImpl: options.fetchImpl })
      window.location.assign(url)
    } catch (err) {
      identityError = { info: describeError(err, { title: "Sign-in didn't start" }), retry: 'signin' }
    } finally {
      signInPending = false
    }
    refreshSignInRow()
  }

  function listBody(): string {
    const signInUrl = safeUrl(options.signInUrl)
    const { guest, viewerUserId } = composerIdentity()
    const lockBar =
      moderator && pageLock
        ? `<div class="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
        <span class="text-muted-foreground">${pageLock.locked ? 'Comments are locked on this page.' : 'Comments are open on this page.'}</span>
        <button type="button" data-action="toggle-lock" ${lockPending ? 'disabled' : ''} class="ml-auto rounded border border-border px-3 py-1 text-sm disabled:opacity-50">${pageLock.locked ? 'Unlock' : 'Lock'}</button>
      </div>`
        : ''
    const actionBanner = actionError ? errorMarkup(actionError, { signInUrl }) : ''
    if (status === 'loading' && comments.length === 0) return skeletonBlock(3)
    if (status === 'error' && comments.length === 0 && error) return errorMarkup(error, { signInUrl })
    if (status === 'ready' && comments.length === 0)
      return `${lockBar}${actionBanner}<p class="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">No comments yet.</p>`
    // A page is a window over ROOTS: cutting rows would split a thread and
    // render its replies as phantom top-level comments.
    const roots = buildCommentTree(comments)
    // A local vote/edit/delete empties the window without a refetch; fall back
    // to the last page that still has a thread instead of a blank list.
    if (page > 1 && roots.length <= (page - 1) * limit) page = Math.max(1, Math.ceil(roots.length / limit))
    const tree = renderCommentTree(roots.slice((page - 1) * limit, page * limit), {
      replyTo,
      turnstileSiteKey: options.turnstileSiteKey,
      guest,
      viewerUserId,
      viewerRole,
      editingId,
      editWindowMinutes: options.editWindowMinutes ?? DEFAULT_EDIT_WINDOW_MINUTES,
      pendingModeration,
      submitDisabled: sessionStatus === 'loading',
    })
    const signIn = needsSignIn
      ? `<p class="rounded-lg border border-border bg-card p-5 text-sm">Please sign in to vote. ${signInUrl ? `<a href="${escapeHtml(signInUrl)}" class="underline">Sign in</a>` : ''}</p>`
      : ''
    const canPrev = page > 1 && !loadingPage
    const canNext = !loadingPage && (hasMore || roots.length > page * limit)
    // `roots.length > limit` keeps the nav reachable after Prev returns to an
    // exhausted page 1 (hasMore false), else Next is stranded.
    const pager =
      page > 1 || hasMore || roots.length > limit
        ? `<nav aria-label="Comments pagination" class="flex flex-wrap items-center justify-between gap-2 text-sm">
      <button type="button" data-action="page-prev" ${canPrev ? '' : 'disabled'} class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"><span aria-hidden="true">&lsaquo;</span> Previous</button>
      <span class="text-muted-foreground">Page <span aria-current="page" class="font-medium text-foreground">${page}</span></span>
      <button type="button" data-action="page-next" ${canNext ? '' : 'disabled'} class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50">Next <span aria-hidden="true">&rsaquo;</span></button>
    </nav>`
        : ''
    return `${lockBar}${actionBanner}${signIn}<div class="space-y-3">${tree}</div>${loadingPage ? `<div class="mt-3">${skeletonBlock(2)}</div>` : ''}<div class="mt-3">${pager}</div>`
  }

  function render() {
    if (destroyed) return
    applyTheme()
    const { guest } = composerIdentity()
    const signInHtml = `<div data-lc-signin>${signInRow()}</div>`
    el.innerHTML = `<section aria-label="Comments" class="space-y-4">${renderForm({ turnstileSiteKey: options.turnstileSiteKey, guest, formId: 'top', signInHtml, submitDisabled: sessionStatus === 'loading' })}${listBody()}</section>`
    wrapMarkdownTables(el)
    hydrateTurnstile()
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
  async function loadWindow(pages: number) {
    const window = await loadThreadWindow({
      site: options.site,
      baseUrl: options.baseUrl,
      pageUrl,
      limit,
      fetchImpl: options.fetchImpl,
      pages,
      ...(pages > 1 ? { existing: comments } : {}),
    })
    comments = window.comments
    hasMore = window.hasMore
  }

  // Moderator branch: resolve this page from the site's page list, then read
  // its thread including hidden/deleted rows. `total` is exact, so the window
  // is filled by row count.
  async function loadModeration(offset: number) {
    const overview = await client.listModeration({ limit: 1 })
    const normalized = normalizePageUrl(pageUrl)
    const match = overview.pages.find((p) => normalizePageUrl(p.canonicalUrl) === normalized) ?? null
    pageLock = match ? { pageId: match.id, locked: match.isLocked } : null
    if (!match) {
      if (offset === 0) comments = []
      hasMore = false
      status = 'ready'
      return
    }
    const list = await client.listModeration({ pageId: match.id, limit, offset })
    const rows = list.comments.map(moderationCommentToComment)
    comments = offset === 0 ? rows : [...comments, ...rows]
    hasMore = comments.length < list.total
    status = 'ready'
  }

  async function fillModeration(target: number) {
    let before = comments.length
    while (hasMore && buildCommentTree(comments).length < target) {
      await loadModeration(comments.length)
      if (comments.length === before) break
      before = comments.length
    }
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
  async function initialLoad(preserveDraft = false) {
    const repaint = preserveDraft ? renderPreservingComposer : render
    loadingPage = true
    page = 1
    status = 'loading'
    error = null
    actionError = null
    repaint()
    try {
      if (moderator) {
        await loadModeration(0)
        await fillModeration(limit)
      } else {
        await loadWindow(1)
      }
      status = 'ready'
    } catch (err) {
      if (destroyed) return
      loadFailure(err, true)
    }
    loadingPage = false
    repaint()
  }

  async function nextPage() {
    if (loadingPage) return
    loadingPage = true
    renderPreservingComposer()
    // Fill the DESTINATION window before rendering it.
    try {
      if (moderator) await fillModeration((page + 1) * limit)
      else await loadWindow(page + 1)
    } catch (err) {
      if (destroyed) return
      loadFailure(err, false)
    }
    loadingPage = false
    if (buildCommentTree(comments).length > page * limit) page += 1
    renderPreservingComposer()
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
      await client.postComment({
        url: pageUrl,
        bodyMarkdown,
        anonymous,
        ...(isTopLevel && typeof document !== 'undefined' ? { title: document.title } : {}),
        ...(authorName ? { authorName } : {}),
        ...(typeof parent === 'string' && parent ? { parentId: parent } : {}),
        ...(tokens.get(formId) ? { verificationToken: tokens.get(formId) } : {}),
      })
      resetTurnstile(formId)
      replyTo = null
      await initialLoad()
    } catch (err) {
      resetTurnstile(formId)
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED' && options.signInUrl) {
        needsSignIn = true
        renderPreservingComposer()
        return
      }
      fail(describeError(err, { title: "Your comment wasn't posted" }))
      hydrateTurnstile()
    }
  }

  async function vote(commentId: string, value: VoteValue) {
    const current = comments.find((c) => c.id === commentId)
    actionError = null
    try {
      const summary =
        current?.viewerVote === value ? await client.clearVote(commentId) : await client.castVote(commentId, value)
      comments = comments.map((c) =>
        c.id === commentId ? { ...c, score: summary.score, viewerVote: summary.viewerVote } : c,
      )
      needsSignIn = false
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') {
        needsSignIn = true
      } else {
        actionError = describeError(err, { title: "Your vote wasn't saved" })
      }
    }
    renderPreservingComposer()
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
    actionError = null
    if (!raw) {
      if (errBox) {
        errBox.innerHTML = errorMarkup(INVALID_BODY)
        errBox.classList.remove('hidden')
      }
      return
    }
    try {
      const updated = await client.editOwnComment({ commentId, bodyMarkdown: raw })
      comments = comments.map((c) => (c.id === commentId ? updated : c))
      editingId = null
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
      actionError = info
      renderPreservingComposer()
      return
    }
    renderPreservingComposer()
  }

  async function removeComment(commentId: string) {
    if (typeof confirm !== 'undefined' && !confirm('Delete this comment?')) return
    actionError = null
    try {
      await client.deleteOwnComment(commentId)
      comments = comments.filter((c) => c.id !== commentId)
      if (editingId === commentId) editingId = null
    } catch (err) {
      actionError = describeError(err, { title: "Your comment wasn't deleted" })
    }
    renderPreservingComposer()
  }

  async function moderate(commentId: string, action: ModerationAction) {
    pendingModeration = { ...pendingModeration, [commentId]: true }
    actionError = null
    renderPreservingComposer()
    try {
      const patch = await client.moderateComment({ commentId, action })
      comments = comments.map((c) =>
        c.id === commentId ? { ...c, status: patch.status, pinnedAt: patch.pinnedAt } : c,
      )
    } catch (err) {
      actionError = describeError(err, { title: 'That moderation action failed' })
    } finally {
      pendingModeration = { ...pendingModeration, [commentId]: false }
    }
    renderPreservingComposer()
  }

  async function blockUser(commentId: string, blocked: boolean) {
    const userId = comments.find((c) => c.id === commentId)?.userId
    if (!userId) return
    pendingModeration = { ...pendingModeration, [commentId]: true }
    actionError = null
    renderPreservingComposer()
    try {
      await client.setUserBlocked({ userId, blocked })
      comments = comments.map((c) => (c.userId === userId ? { ...c, userBlocked: blocked } : c))
    } catch (err) {
      actionError = describeError(err, { title: 'That moderation action failed' })
    } finally {
      pendingModeration = { ...pendingModeration, [commentId]: false }
    }
    renderPreservingComposer()
  }

  async function toggleLock() {
    if (!pageLock) return
    lockPending = true
    actionError = null
    renderPreservingComposer()
    try {
      const next = await client.setPageLocked({ pageId: pageLock.pageId, locked: !pageLock.locked })
      pageLock = { pageId: next.id, locked: next.isLocked }
    } catch (err) {
      actionError = describeError(err, { title: 'That moderation action failed' })
    } finally {
      lockPending = false
    }
    renderPreservingComposer()
  }

  function onClick(ev: Event) {
    const target = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null
    if (!target || !el.contains(target)) return
    const action = target.getAttribute('data-action')
    if (action === 'preview') togglePreview(target, target.getAttribute('aria-pressed') !== 'true')
    else if (action === 'error-retry') void initialLoad(true)
    else if (action === 'error-sign-in') void signIn()
    else if (action === 'signin') void signIn()
    else if (action === 'identity') {
      identityOpen = !identityOpen
      refreshSignInRow()
    } else if (action === 'identity-anonymous') setIdentity('anonymous')
    else if (action === 'identity-account') setIdentity('account')
    else if (action === 'signout') void signOut()
    else if (action === 'page-prev') {
      if (page > 1 && !loadingPage) {
        page -= 1
        renderPreservingComposer()
      }
    } else if (action === 'page-next') void nextPage()
    else if (action === 'reply') {
      replyTo = target.getAttribute('data-comment-id')
      renderPreservingComposer()
    } else if (action === 'cancel-reply') {
      replyTo = null
      renderPreservingComposer()
    } else if (action === 'vote') {
      const id = target.getAttribute('data-comment-id')
      const value = Number(target.getAttribute('data-value')) as VoteValue
      if (id && (value === 1 || value === -1)) void vote(id, value)
    } else if (action === 'edit') {
      editingId = target.getAttribute('data-comment-id')
      renderPreservingComposer()
    } else if (action === 'cancel-edit') {
      editingId = null
      renderPreservingComposer()
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
        renderPreservingComposer()
        return
      }
      refreshSignInRow()
      // Both were rendered disabled while the identity was unknown.
      for (const button of el.querySelectorAll<HTMLButtonElement>('form[data-lc-form] button[type="submit"]'))
        button.disabled = false
    })
    void initialLoad()
  }
  if (!options.lazy || typeof IntersectionObserver === 'undefined') {
    startLoading()
  } else {
    // Paint the placeholder so a zero-height root still has an intersection
    // to report, then fetch on the first hit only.
    render()
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer?.disconnect()
        observer = null
        startLoading()
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
  }

  return {
    destroy() {
      destroyed = true
      observer?.disconnect()
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
  let observer: IntersectionObserver | null = null

  const { apply: applyTheme, cleanup: cleanupTheme } = setupTheme(el, theme, options)

  function paint() {
    if (destroyed) return
    applyTheme()
    const roots = buildCommentTree(rows)
    const body =
      status === 'loading'
        ? skeletonBlock(3)
        : // The read-only viewer has no sign-in path, so its only remedy is a reload.
          status === 'error'
          ? errorMarkup(failure.action === 'sign-in' ? { ...failure, action: 'retry' } : failure)
          : roots.length === 0
            ? `<p class="text-sm text-muted-foreground">No comments yet.</p>`
            : `<div class="grid gap-4">${renderCommentTree(roots.slice((page - 1) * limit, page * limit), { readOnly: true })}</div>`
    const canPrev = page > 1 && !loadingPage
    const canNext = !loadingPage && (hasMore || roots.length > page * limit)
    // `roots.length > limit` keeps the nav reachable after Prev returns to an
    // exhausted page 1 (hasMore false), else Next is stranded.
    const pager =
      page > 1 || hasMore || roots.length > limit
        ? `<nav aria-label="Comments pagination" class="flex flex-wrap items-center justify-between gap-2 text-sm">
      <button type="button" data-action="page-prev" ${canPrev ? '' : 'disabled'} class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"><span aria-hidden="true">&lsaquo;</span> Previous</button>
      <span class="text-muted-foreground">Page <span aria-current="page" class="font-medium text-foreground">${page}</span></span>
      <button type="button" data-action="page-next" ${canNext ? '' : 'disabled'} class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50">Next <span aria-hidden="true">&rsaquo;</span></button>
    </nav>`
        : ''
    const pending = loadingPage && status === 'ready' ? `<div>${skeletonBlock(2)}</div>` : ''
    el.innerHTML = `<section aria-label="Comments" class="grid gap-4">${body}${pending}${pager}</section>`
  }

  // Same shared loader as the list, so the viewer cannot drift from it.
  async function loadWindow(pages: number) {
    const window = await loadThreadWindow({
      site: options.site,
      baseUrl: options.baseUrl,
      pageUrl,
      limit,
      fetchImpl: options.fetchImpl,
      pages,
      ...(pages > 1 ? { existing: rows } : {}),
    })
    rows = window.comments
    hasMore = window.hasMore
  }

  async function load() {
    loadingPage = true
    page = 1
    status = 'loading'
    paint()
    try {
      await loadWindow(1)
      status = 'ready'
    } catch (err) {
      if (destroyed) return
      status = 'error'
      failure = describeError(err, { title: 'Comments failed to load' })
    }
    loadingPage = false
    paint()
  }

  async function nextPage() {
    if (loadingPage) return
    loadingPage = true
    paint()
    try {
      await loadWindow(page + 1)
    } catch {
      // Keep the loaded page; the nav simply stays put.
    }
    loadingPage = false
    if (buildCommentTree(rows).length > page * limit) page += 1
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
  if (!options.lazy || typeof IntersectionObserver === 'undefined') {
    void load()
  } else {
    // Paint the placeholder so a zero-height root still has an intersection
    // to report, then fetch on the first hit only.
    paint()
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer?.disconnect()
        observer = null
        void load()
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
  }

  return {
    destroy() {
      destroyed = true
      observer?.disconnect()
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
