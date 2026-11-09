// renderCommentViewer: the read-only thread.

import type { Comment, ErrorInfo, ThreadNode, ThreadSort, ViewerOptions } from '@last-comments-widgets/client'
import {
  beginOAuthSignIn,
  buildCommentTree,
  describeError,
  fetchCommentSettings,
  fetchViewerSession,
  gateFor,
  loadThreadWindow,
  resolveSettings,
  safeUrl,
  signInRequired,
  sortCommentRoots,
} from '@last-comments-widgets/client'
import { type GuidesSession, observeInView, renderGuides } from './guides'
import {
  attributionMarkup,
  errorMarkup,
  pagerMarkup,
  renderCommentTree,
  signInPromptMarkup,
  skeletonBlock,
  sortToggleMarkup,
} from './markup'
import { mountComments, runMarkdownEnhancers } from './mount'
import { setupTheme } from './theme'
import type { WidgetHandle } from './types'

/**
 * Mounts the read-only thread into `el`: no composer, votes or actions, the
 * same site policy as {@link mountComments}. Requires the vanilla stylesheet
 * and a same-origin `/api/*`.
 */
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
  const viewerMath = options.math ?? false
  const viewerMermaid = options.mermaid ?? false
  const viewerCodeHighlight = options.codeHighlight ?? true
  let viewerCleanup: (() => void) | null = null

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
    const signInUrl = safeUrl(options.signInUrl)
    const body =
      status === 'loading'
        ? skeletonBlock(3, true)
        : status === 'error'
          ? failure.action === 'sign-in'
            ? signInPromptMarkup(failure, 'read', { signInUrl })
            : errorMarkup(failure, { signInUrl })
          : roots.length === 0
            ? `<p class="text-sm text-muted-foreground">No comments yet.</p>`
            : ''
    const sortBar = status !== 'error' && roots.length > 0 ? sortToggleMarkup(sort) : ''
    const list =
      pageRoots.length > 0
        ? `<section aria-label="Comments" data-lc-thread-list class="lc-thread-guides relative grid gap-4">${renderCommentTree(pageRoots, { readOnly: true, math: viewerMath })}</section>`
        : ''
    const pager = pagerMarkup(page, limit, roots.length, hasMore, loadingPage)
    const pending = loadingPage && status === 'ready' ? `<div>${skeletonBlock(2, true)}</div>` : ''
    viewerCleanup?.()
    viewerCleanup = null
    el.innerHTML = `<section aria-label="Comments" class="grid gap-4">${body}${sortBar}${list}${pending}${pager}${attributionMarkup()}</section>`
    if (viewerMath || viewerMermaid || viewerCodeHighlight) {
      viewerCleanup = runMarkdownEnhancers(el, {
        math: viewerMath,
        mermaid: viewerMermaid,
        codeHighlight: viewerCodeHighlight,
      })
    }
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

  // A private site's thread waits for the policy and the session: a signed-out visitor gets the prompt, no fetch.
  let viewerStarted = false
  async function startViewer() {
    if (viewerStarted) return
    viewerStarted = true
    const fetched = await fetchCommentSettings({
      baseUrl: options.baseUrl,
      site: options.site,
      fetchImpl: options.fetchImpl,
    })
    const policy = resolveSettings({}, undefined, fetched)
    const signedIn =
      policy.access !== 'open' &&
      (await fetchViewerSession({ baseUrl: options.baseUrl, fetchImpl: options.fetchImpl })) !== null
    if (destroyed) return
    if (gateFor(policy.access, 'read', signedIn) === 'sign-in') {
      status = 'error'
      failure = signInRequired('read')
      paint()
      return
    }
    void load()
  }

  // The viewer has no identity menu: its sign-in is the OAuth start the comments widget uses.
  async function signIn() {
    try {
      window.location.assign(
        await beginOAuthSignIn({ baseUrl: options.baseUrl, pageUrl, fetchImpl: options.fetchImpl }),
      )
    } catch (err) {
      status = 'error'
      failure = describeError(err, { title: "Sign-in didn't start" })
      paint()
    }
  }

  function onClick(ev: Event) {
    const target = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null
    if (!target || !el.contains(target)) return
    const action = target.getAttribute('data-action')
    if (action === 'error-retry') void load()
    else if (action === 'error-sign-in') void signIn()
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
    () => void startViewer(),
  )

  return {
    destroy() {
      destroyed = true
      stopObserver?.()
      viewerCleanup?.()
      viewerCleanup = null
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
