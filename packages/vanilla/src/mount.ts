// mountComments: the widget itself, its network and state flow, and the post-paint markdown upgrades.

import type {
  Comment,
  ErrorInfo,
  LastCommentsClient,
  ModerationAction,
  ReactionSummary,
  ThreadNode,
  ThreadSort,
  ViewerSession,
  VoteValue,
} from '@last-comments-widgets/client'
import {
  ApiError,
  beginOAuthSignIn,
  buildCommentTree,
  type CommentSettings,
  canDeleteComment,
  canModerate,
  createClient,
  DEFAULT_ANON_EDIT_WINDOW_MINUTES,
  DEFAULT_BODY_LIMIT,
  describeError,
  fetchCommentSettings,
  fetchViewerSession,
  forgetEditKey,
  gateFor,
  getEditKey,
  isCompleteSettings,
  loadThreadWindow,
  moderationCommentToComment,
  normalizePageUrl,
  reactionFailure,
  renderMarkdown,
  resolveSettings,
  safeUrl,
  saveEditKey,
  signInRequired,
  signOutViewerSession,
  sortCommentRoots,
  takeSignInFailure,
} from '@last-comments-widgets/client'
import {
  enhanceMath,
  enhanceMermaid,
  loadTurnstile,
  resolveTurnstileConfig,
} from '@last-comments-widgets/client/enhance'
import { type GuidesSession, observeInView, PANEL_SELECTOR, renderGuides } from './guides'
import {
  ACTIONS_MENU_CLASS,
  actionEntries,
  attributionMarkup,
  BTN,
  BTN_GHOST,
  BTN_OUTLINE,
  BTN_SECONDARY,
  BTN_SM,
  errorMarkup,
  escapeHtml,
  IDENTITY_ITEM_CLASS,
  IDENTITY_MENU_CLASS,
  IDENTITY_RADIO_ITEM_CLASS,
  INVALID_BODY,
  INVALID_REPLY,
  icon,
  insertPrefix,
  insertWrap,
  pagerMarkup,
  type ReactionMode,
  reactionGroupMarkup,
  renderCommentTree,
  renderForm,
  signInPromptMarkup,
  skeletonBlock,
  sortToggleMarkup,
  voteButtonClass,
} from './markup'
import { applyVotes, canEditComment, ITEM_INITIAL, transition, UI_INITIAL, type UiState, type VotePatch } from './state'
import { setupTheme } from './theme'
import type { MountOptions, WidgetHandle } from './types'

type MarkdownEnhanceFlags = { math?: boolean; mermaid?: boolean }

// This port bundles KaTeX's stylesheet; the import stays here so the bundle that owns the CSS requests it.
const loadKatexStyles = () => import('katex/dist/katex.min.css')

// Runs the enabled upgrades over freshly painted markup and returns one cleanup.
export function runMarkdownEnhancers(root: ParentNode, flags: MarkdownEnhanceFlags): () => void {
  const cleanups = [
    ...(flags.mermaid ? [enhanceMermaid(root)] : []),
    ...(flags.math ? [enhanceMath(root, { loadStyles: loadKatexStyles })] : []),
  ]
  return () => {
    for (const dispose of cleanups) dispose()
  }
}

/**
 * Mounts the comments widget into `el` and returns a handle to refresh or
 * destroy it. Renders the full composer, thread, votes, paging and (with
 * `viewerRole: 'admin'`) moderation; a `private` site renders one sign-in card
 * instead of the thread.
 *
 * Requires the vanilla stylesheet and a same-origin `/api/*` (see the module note).
 */
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
  // Reactions: the page bar's counts, the ids with a reaction in flight, and the rows whose picker is open.
  let pageReactions: ReactionSummary[] = []
  // Finished page presses, so a page read that started before one is dropped.
  let pageWrites = 0
  const pendingReactions = new Set<string>()
  const reactionPickers = new Set<string>()
  const PAGE_REACTIONS_KEY = 'page'
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
  let bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT
  let anonWindowMinutes = options.anonEditWindowMinutes ?? DEFAULT_ANON_EDIT_WINDOW_MINUTES
  let turnstileKey = options.turnstileSiteKey
  const actionMode = options.actionMode ?? 'icon-text'
  const math = options.math ?? false
  const mermaid = options.mermaid ?? false
  // `codeHighlight` is API parity only: Shiki lives in the React bundle today.
  let listCleanup: (() => void) | null = null
  const previewCleanups = new Map<Element, () => void>()
  function runEnhancers(root: ParentNode) {
    if (!math && !mermaid) return
    listCleanup?.()
    listCleanup = runMarkdownEnhancers(root, { math, mermaid })
  }
  function clearEnhancers() {
    listCleanup?.()
    listCleanup = null
    for (const dispose of previewCleanups.values()) dispose()
    previewCleanups.clear()
  }
  let pageLock: { pageId: string; locked: boolean } | null = null
  let session: ViewerSession | null = null
  let sessionStatus: 'loading' | 'ready' = 'loading'
  let commentAs: 'account' | 'anonymous' = 'account'
  // The site's policy, resolved once the public settings are read (or immediately, when the host
  // supplies a complete `settings` object). Reads and writes are gated on it.
  let settingsFetched: CommentSettings | null = null
  let settingsSettled = isCompleteSettings(options.settings)
  let policy: CommentSettings = resolveSettings({}, options.settings, null)
  let identityDone = false
  let loaded = false
  let refusedRead = false
  function applyPolicy() {
    policy = resolveSettings(
      {
        bodyLimit: options.bodyLimit,
        anonEditWindowMinutes: options.anonEditWindowMinutes,
        turnstileSiteKey: options.turnstileSiteKey,
      },
      options.settings,
      settingsFetched,
    )
    bodyLimit = policy.bodyLimit
    anonWindowMinutes = policy.anonEditWindowMinutes
    turnstileKey = policy.turnstileSiteKey ?? undefined
  }
  // A login or private site cannot decide who may see or write until the identity probe settles.
  function identityPendingNow(): boolean {
    return sessionStatus === 'loading' && policy.access !== 'open'
  }
  // The composer is a form while the identity is unknown (disabled) and whenever writing is allowed.
  function composerShowsForm(): boolean {
    return identityPendingNow() || writeAllowedNow()
  }
  function writeAllowedNow(): boolean {
    return gateFor(policy.access, 'write', composerIdentity().signed || moderator) === 'allow'
  }
  function readAllowedNow(): boolean {
    return gateFor(policy.access, 'read', composerIdentity().signed || moderator) === 'allow'
  }
  // UI flags live in one immutable record; reads go through the current value.
  let ui: UiState = UI_INITIAL
  // Shared by every render path so the composer, the turnstile box and the
  // nested reply forms never disagree about who is posting.
  function composerIdentity() {
    const signed = Boolean(session) || Boolean(options.viewerUserId)
    return {
      signed,
      guest: !signed || (commentAs === 'anonymous' && policy.access === 'open'),
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
    const anonymous = policy.access === 'open' ? radio('identity-anonymous', anonymousSelected, 'Anonymous') : ''
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
    const host = el.querySelector('[data-lc-identity]')
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
        anonWindowMinutes,
        hasEditKey: getEditKey(comment.id) !== null,
      }),
      editing: (ui.items[comment.id] ?? ITEM_INITIAL).editing,
      canDelete: writeAllowedNow() && canDeleteComment(comment, viewerUserId, getEditKey(comment.id) !== null),
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
          : (Math.max(current, 0) + move + items.length) % items.length
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
    if (status === 'error' && comments.length === 0 && error)
      return error.action === 'sign-in'
        ? signInPromptMarkup(error, 'read', { signInUrl })
        : errorMarkup(error, { signInUrl })
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
      turnstileSiteKey: turnstileKey,
      guest,
      writeAllowed: writeAllowedNow(),
      signInUrl,
      viewerUserId,
      viewerRole,
      items: ui.items,
      anonWindowMinutes,
      actionMode,
      bodyLimit,
      math,
      pendingModeration: ui.pendingModeration,
      submitDisabled: sessionStatus === 'loading',
      hideVotes: !policy.features.votes || (Boolean(viewerRole) && Boolean(pageLock?.locked)),
      reactionMode: reactionModeFor(policy.features.commentReactions),
      reactionEmoji: policy.features.commentReactions,
      reactionsLocked: Boolean(pageLock?.locked),
      pendingReactions,
      reactionPickers,
    })
    const signIn = ui.needsSignIn ? signInPromptMarkup(signInRequired('vote'), 'vote', { signInUrl }) : ''
    const sortBar = status !== 'error' && roots.length > 0 ? sortToggleMarkup(ui.sort) : ''
    const list =
      pageRoots.length > 0
        ? `<section aria-label="Comments" data-lc-thread-list class="lc-thread-guides relative grid grid-cols-1 gap-3">${tree}</section>`
        : ''
    const pager = pagerMarkup(ui.page, limit, roots.length, hasMore, loadingPage)
    return `${lockBar}${actionBanner}${signIn}${pageBarMarkup()}${sortBar}${list}${loadingPage ? `<div class="mt-3">${skeletonBlock(2)}</div>` : ''}${pager ? `<div class="mt-3">${pager}</div>` : ''}${attributionMarkup()}`
  }

  function composerHtml(): string {
    if (!composerShowsForm()) {
      // On a private site the list's read prompt is the only sign-in card, so the composer slot stays empty.
      if (!readAllowedNow()) return ''
      return signInPromptMarkup(signInRequired('write'), 'write', { signInUrl: safeUrl(options.signInUrl) })
    }
    const { guest } = composerIdentity()
    const signInHtml = `<div data-lc-identity>${signInRow()}</div>`
    return renderForm({
      turnstileSiteKey: turnstileKey,
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
    runEnhancers(list)
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
    runEnhancers(el)
    hydrateTurnstile()
    attachGuides()
  }

  // Both regions exist after the first paint; later paints only refresh the list.
  function paint() {
    if (el.querySelector('[data-lc-composer]')) renderList()
    else render()
  }

  function hydrateTurnstile() {
    // The token gate lives here, not in the markup: the challenge answers after
    // the paint, so the rendered button is re-synced with it.
    syncSubmits()
    const siteKey = turnstileKey
    if (!siteKey) return
    const config = resolveTurnstileConfig(el.classList.contains('dark'), options.turnstileOptions)
    // A failed load leaves no challenge, as before: the server reports the missing token.
    void loadTurnstile()
      .catch(() => null)
      .then((api) => {
        if (destroyed || !api) return
        for (const box of el.querySelectorAll<HTMLElement>('.lc-turnstile')) {
          const form = box.closest('form')
          const formId = form?.getAttribute('data-lc-form') ?? 'top'
          if (widgetIds.has(formId)) continue
          try {
            const id = api.render(box, {
              sitekey: siteKey,
              ...config,
              callback: (token: string) => {
                tokens.set(formId, token)
                syncSubmits()
              },
              'expired-callback': () => {
                tokens.delete(formId)
                syncSubmits()
              },
              'error-callback': () => {
                tokens.delete(formId)
                syncSubmits()
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
    // The in-flight lock: a second click must not post the same comment twice.
    if (formBusy(formId)) return
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
    // The head composer keeps its draft in the DOM, so the button shows the
    // loading state in place instead of repainting the composer.
    ui = transition(ui, { type: 'posting/set', value: true })
    syncSubmits()
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
    } finally {
      ui = transition(ui, { type: 'posting/set', value: false })
      syncSubmits()
    }
  }

  async function vote(commentId: string, value: VoteValue) {
    const current = comments.find((c) => c.id === commentId)
    ui = transition(ui, { type: 'error', value: null })
    // Votes need a signed-in session: a guest gets the sign-in notice instead of a refused request.
    if (!composerIdentity().signed && !moderator) {
      ui = transition(ui, { type: 'signin/needed', value: true })
      renderList()
      return
    }
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
      votes = {
        ...votes,
        [commentId]: { ...votes[commentId], score: summary.score, viewerVote: summary.viewerVote },
      }
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

  // What the reaction controls show: a moderator sees the counts and cannot react; an empty allowed set is off.
  function reactionModeFor(allowed: string[]): ReactionMode {
    if (allowed.length === 0) return 'off'
    return moderator ? 'counts' : 'interactive'
  }

  function pageBarMarkup(): string {
    return reactionGroupMarkup({
      commentId: null,
      mode: reactionModeFor(policy.features.pageReactions),
      allowed: policy.features.pageReactions,
      reactions: pageReactions,
      disabled: pendingReactions.has(PAGE_REACTIONS_KEY) || Boolean(pageLock?.locked),
      picking: false,
    })
  }

  // Repaints one row's reaction chips only, so the composer keeps its focus and its drafts.
  function patchReactionGroup(commentId: string) {
    const group = el.querySelector(`[data-lc-reactions][data-comment-id="${CSS.escape(commentId)}"]`)
    const comment = comments.find((c) => c.id === commentId)
    if (!group || !comment) return
    group.outerHTML = reactionGroupMarkup({
      commentId,
      mode: reactionModeFor(policy.features.commentReactions),
      allowed: policy.features.commentReactions,
      reactions: votes[commentId]?.reactions ?? comment.reactions,
      disabled: pendingReactions.has(commentId) || Boolean(pageLock?.locked),
      picking: reactionPickers.has(commentId),
    })
  }

  function patchPageReactions() {
    const bar = el.querySelector('[data-lc-page-reactions]')
    if (!bar) return
    bar.outerHTML = pageBarMarkup()
  }

  // The page bar's counts come with the page. The read carries the session cookie, so a signed-in
  // viewer's own reactions come back with them.
  function loadPageReactions() {
    if (policy.features.pageReactions.length === 0) return
    const writesAtStart = pageWrites
    // A press that finished while this read was on the wire is newer than the read.
    const current = () => !destroyed && pageWrites === writesAtStart
    client.listPageReactions({ url: pageUrl }).then(
      (next) => {
        if (!current()) return
        pageReactions = next
        patchPageReactions()
      },
      () => {
        if (!current()) return
        pageReactions = []
        patchPageReactions()
      },
    )
  }

  // Every reaction goes through one path: the sign-in gate, the pending flag, the failure copy and the repaint.
  // `repaint` redraws only the chips that changed, unless a notice on screen forces a full repaint.
  async function runReaction(pendingId: string, write: () => Promise<void>, repaint: () => void) {
    const hadNotice = ui.actionError !== null
    ui = transition(ui, { type: 'error', value: null })
    // A guest is asked to sign in, as a vote asks: the request would be refused.
    if (!composerIdentity().signed && !moderator) {
      ui = transition(ui, { type: 'error', value: signInRequired('react') })
      renderList()
      return
    }
    pendingReactions.add(pendingId)
    repaint()
    let failed = false
    try {
      await write()
    } catch (err) {
      failed = true
      ui = transition(ui, { type: 'error', value: reactionFailure(err) })
    } finally {
      pendingReactions.delete(pendingId)
    }
    // A notice that was on screen is removed by a repaint; otherwise only the chips change.
    if (failed || hadNotice) renderList()
    else repaint()
  }

  function react(commentId: string, emoji: string, viewerReacted: boolean) {
    return runReaction(
      commentId,
      async () => {
        const reactions = viewerReacted
          ? await client.clearReaction(commentId, emoji)
          : await client.castReaction(commentId, emoji)
        votes = { ...votes, [commentId]: { ...votes[commentId], reactions } }
      },
      () => patchReactionGroup(commentId),
    )
  }

  function reactPage(emoji: string, viewerReacted: boolean) {
    return runReaction(
      PAGE_REACTIONS_KEY,
      async () => {
        pageReactions = viewerReacted
          ? await client.clearPageReaction({ url: pageUrl }, emoji)
          : await client.castPageReaction({ url: pageUrl }, emoji)
        pageWrites += 1
      },
      patchPageReactions,
    )
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
    const previous = form.querySelector('[data-lc-preview]')
    if (previous) {
      previewCleanups.get(previous)?.()
      previewCleanups.delete(previous)
      previous.remove()
    }
    if (show) {
      const html = renderMarkdown(area.value, { math }) || '<p class="text-muted-foreground">Nothing to preview.</p>'
      const div = document.createElement('div')
      div.setAttribute('data-lc-preview', '')
      div.className = 'lc-markdown min-h-24 px-1 py-2 font-sans text-sm'
      div.innerHTML = html
      wrapMarkdownTables(div)
      if (math || mermaid) previewCleanups.set(div, runMarkdownEnhancers(div, { math, mermaid }))
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

  // The submit button waits for the challenge token (when a site key is set),
  // for the body to fit and for the identity to resolve. A form that is already
  // posting stays disabled: the label is the loading state.
  function syncSubmits() {
    for (const form of el.querySelectorAll<HTMLFormElement>('form[data-lc-form]')) {
      const area = form.querySelector<HTMLTextAreaElement>('textarea[name="bodyMarkdown"]')
      const over = Boolean(area && area.value.length > bodyLimit)
      const formId = form.getAttribute('data-lc-form') ?? 'top'
      const busy = formBusy(formId)
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')
      if (!submit) continue
      submit.disabled = over || sessionStatus === 'loading' || (Boolean(turnstileKey) && !tokens.get(formId)) || busy
      submit.setAttribute('aria-busy', String(busy))
      // The loading state is swapped in place: the forms keep their draft in
      // the DOM, so they are never repainted while a request is in flight.
      const label = submit.dataset.lcLabel ?? submit.textContent ?? ''
      submit.textContent = busy ? 'Posting…' : label
    }
  }

  // The head composer posts under `top`, a reply under `reply-<comment id>` and
  // the inline editor under `edit-<comment id>`.
  function formBusy(formId: string): boolean {
    if (formId === 'top') return ui.posting
    const id = formId.startsWith('reply-')
      ? formId.slice('reply-'.length)
      : formId.startsWith('edit-')
        ? formId.slice('edit-'.length)
        : ''
    if (!id) return false
    const item = ui.items[id]
    return formId.startsWith('edit-') ? Boolean(item?.saving) : Boolean(item?.replying)
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
    syncSubmits()
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
    // The editor keeps its draft in the DOM, so its button shows the loading
    // state in place instead of repainting the row.
    syncSubmits()
    try {
      // Moderators edit through the moderation endpoint for the same reason they
      // post through it: the public PATCH checks the site's origins.
      const editKey = moderator ? null : getEditKey(commentId)
      const updated = moderator
        ? await client.editModerationComment({ commentId, bodyMarkdown: raw })
        : await client.editOwnComment({ commentId, bodyMarkdown: raw, ...(editKey ? { editKey } : {}) })
      comments = comments.map((c) =>
        c.id === commentId
          ? {
              ...c,
              ...updated,
              score: updated.score ?? c.score,
              viewerVote: updated.viewerVote ?? c.viewerVote,
              // An edit's answer carries no reaction counts, so the row keeps the ones it has.
              reactions: c.reactions,
            }
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
      // A guest proves ownership with the edit key kept in this browser; a signed-in author sends none.
      await client.deleteOwnComment(commentId, getEditKey(commentId) ?? undefined)
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
    } else if (action === 'react' || action === 'react-page') {
      const emoji = target.getAttribute('data-emoji')
      const viewerReacted = target.getAttribute('data-reacted') === 'true'
      if (action === 'react-page' && emoji) void reactPage(emoji, viewerReacted)
      else if (commentId && emoji) void react(commentId, emoji, viewerReacted)
    } else if (action === 'react-picker') {
      if (!commentId) return
      if (reactionPickers.has(commentId)) reactionPickers.delete(commentId)
      else reactionPickers.add(commentId)
      patchReactionGroup(commentId)
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
  function maybeLoad() {
    if (destroyed || loaded || !settingsSettled) return
    if (policy.access !== 'open' && !identityDone) return
    loaded = true
    if (!readAllowedNow()) {
      refusedRead = true
      status = 'error'
      error = signInRequired('read')
      paint()
      return
    }
    loadPageReactions()
    void initialLoad()
  }
  function startLoading() {
    void fetchCommentSettings({ baseUrl: options.baseUrl, site: options.site, fetchImpl: options.fetchImpl }).then(
      (value) => {
        settingsFetched = value
        settingsSettled = true
        applyPolicy()
        if (destroyed) return
        paint()
        maybeLoad()
      },
    )
    void fetchViewerSession({ baseUrl: options.baseUrl, fetchImpl: options.fetchImpl }).then((next) => {
      const wasGuest = composerIdentity().guest
      const wasComposer = composerShowsForm()
      sessionStatus = 'ready'
      identityDone = true
      if (destroyed) return
      if (next) session = next
      // Only the composer's own state moves without an identity change, and rebuilding
      // the whole widget would drop what was typed while we waited.
      if (composerShowsForm() !== wasComposer || composerIdentity().guest !== wasGuest) {
        renderComposer()
        renderList()
      } else {
        refreshSignInRow()
        // Every form was rendered disabled while the identity was unknown.
        for (const form of el.querySelectorAll<HTMLFormElement>('form[data-lc-form]')) syncCounter(form)
      }
      if (!loaded) maybeLoad()
      else if (refusedRead && readAllowedNow()) {
        refusedRead = false
        void initialLoad()
      }
    })
  }
  // A sign-in the provider rejected returns here with a failure marker. Explain it
  // once in the identity control, then drop the marker so a reload does not repeat it.
  const failure = typeof window !== 'undefined' ? takeSignInFailure(window.location.href) : null
  if (failure) {
    ui = transition(ui, { type: 'identity/error', value: { info: failure.info, retry: 'signin' } })
    window.history.replaceState(window.history.state, '', failure.cleanHref)
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
      clearEnhancers()
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
