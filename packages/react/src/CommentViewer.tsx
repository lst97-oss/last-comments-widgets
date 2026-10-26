import {
  beginOAuthSignIn,
  buildCommentTree,
  type Comment,
  type CommentSettings,
  describeError,
  type ErrorInfo,
  fetchCommentSettings,
  fetchViewerSession,
  gateFor,
  loadThreadWindow,
  resolveSettings,
  safeUrl,
  signInRequired,
  sortCommentRoots,
  type ThreadNode,
  type ThreadSort,
  themeVarsToStyle,
  type ViewerOptions,
} from '@last-comments-widgets/client'
import { type RefObject, useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { CommentError } from './CommentError'
import { CommentItem } from './CommentItem'
import { CommentSkeletons } from './CommentSkeletons'
import { CommentsPager } from './CommentsPager'
import { SignInPrompt } from './SignInPrompt'
import { ThreadGuides, threadSignature } from './ThreadGuides'
import { ThreadSortToggle } from './ThreadSortToggle'
import { useInView } from './useInView'
import { useTheme } from './useTheme'
import { WidgetRootContext } from './WidgetRootContext'

// The read-only viewer never edits, deletes or votes.
const noop = () => {}
// null = "no error".
const noopAsync = async () => null
/** Props for {@link CommentViewer}: a read-only thread with paging and sorting. */
export type CommentViewerProps = ViewerOptions & {
  /** Top-level threads per page (default 20). */
  limit?: number
  /** Embed below the fold: hold the first fetch until the viewer nears the viewport. */
  lazy?: boolean
  /** Where a signed-out visitor goes to sign in on a private site. Without it the OAuth flow starts. */
  signInUrl?: string
}

type ViewerStatus = 'loading' | 'ready' | 'error'

type ViewerState = {
  rows: Comment[]
  page: number
  sort: ThreadSort
  hasMore: boolean
  loadingPage: boolean
  status: ViewerStatus
  error: ErrorInfo | null
  policy: CommentSettings | null
  signedIn: boolean | null
  signInError: ErrorInfo | null
}

type ViewerAction =
  | { type: 'policy/settle'; policy: CommentSettings }
  | { type: 'session/settle'; signedIn: boolean }
  | { type: 'load/start' }
  | { type: 'load/success'; comments: Comment[]; hasMore: boolean }
  | { type: 'load/error'; error: ErrorInfo }
  | { type: 'page/start' }
  | { type: 'page/success'; comments: Comment[]; hasMore: boolean; page: number }
  | { type: 'page/error'; error: ErrorInfo }
  | { type: 'page/set'; page: number }
  | { type: 'sort/set'; sort: ThreadSort }
  | { type: 'sign-in/error'; error: ErrorInfo | null }

const VIEWER_INITIAL: ViewerState = {
  rows: [],
  page: 1,
  sort: 'newest',
  hasMore: false,
  loadingPage: false,
  status: 'loading',
  error: null,
  policy: null,
  signedIn: null,
  signInError: null,
}

// One transition per fetch outcome, so the component never adjusts state from
// an effect: the fetches only report what arrived.
function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case 'policy/settle':
      return { ...state, policy: action.policy }
    case 'session/settle':
      return { ...state, signedIn: action.signedIn }
    case 'load/start':
      return { ...state, status: 'loading', page: 1, error: null }
    case 'load/success':
      return { ...state, rows: action.comments, hasMore: action.hasMore, status: 'ready' }
    case 'load/error':
      return { ...state, error: action.error, status: 'error' }
    case 'page/start':
      return { ...state, loadingPage: true }
    case 'page/success':
      return { ...state, rows: action.comments, hasMore: action.hasMore, page: action.page, loadingPage: false }
    case 'page/error':
      return { ...state, error: action.error, status: 'error', loadingPage: false }
    case 'page/set':
      return { ...state, page: action.page }
    case 'sort/set':
      return { ...state, sort: action.sort, page: 1 }
    case 'sign-in/error':
      return { ...state, signInError: action.error }
    default:
      throw new Error(`Unknown comment viewer action: ${JSON.stringify(action)}`)
  }
}

/**
 * Read-only comment thread: no composer, votes or actions. Follows the same
 * site policy as {@link Comments} — a private site shows one sign-in card and
 * fetches no thread.
 *
 * Import `@lst97-oss/last-comments-widgets/react/styles.css` once, and proxy
 * `/api/*` same-origin.
 */
export function CommentViewer({
  site,
  baseUrl,
  pageUrl,
  limit = 20,
  theme = 'system',
  themeVars,
  lazy = false,
  math = false,
  mermaid = false,
  codeHighlight = true,
  fetchImpl,
  signInUrl,
}: CommentViewerProps) {
  const dark = useTheme(theme)
  const [state, dispatch] = useReducer(viewerReducer, VIEWER_INITIAL)
  const { rows, page, sort, hasMore, loadingPage, status, error, policy, signedIn: viewerSignedIn, signInError } = state
  // `lazy` holds the first fetch until the viewer nears the viewport (SSR/test safe).

  const rootRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLElement>(null)
  const inView = useInView(rootRef, lazy)

  // A prop flip can leave an older request in flight; only the newest load may commit.
  const loadSeq = useRef(0)
  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    dispatch({ type: 'load/start' })
    try {
      // One `limit`-row fetch yields fewer threads (replies consume rows), so
      // fill window 1 before rendering it.
      const window = await loadThreadWindow({ site, baseUrl, pageUrl, limit, fetchImpl, pages: 1 })
      if (seq !== loadSeq.current) return
      dispatch({ type: 'load/success', comments: window.comments, hasMore: window.hasMore })
    } catch (err) {
      if (seq !== loadSeq.current) return
      dispatch({ type: 'load/error', error: describeError(err) })
    }
  }, [site, baseUrl, pageUrl, limit, fetchImpl])

  // The policy and the session are read once the viewer is in view. A private site's thread waits for both.
  useEffect(() => {
    if (!inView) return
    let active = true
    void fetchCommentSettings({ baseUrl, site, fetchImpl }).then((value) => {
      if (active) dispatch({ type: 'policy/settle', policy: resolveSettings({}, undefined, value) })
    })
    void fetchViewerSession({ baseUrl, fetchImpl }).then(
      (next) => {
        if (active) dispatch({ type: 'session/settle', signedIn: next !== null })
      },
      () => {
        if (active) dispatch({ type: 'session/settle', signedIn: false })
      },
    )
    return () => {
      active = false
    }
  }, [baseUrl, site, fetchImpl, inView])

  // Derived during render: the read gate once both the policy and the session have settled.
  const readGate = policy && viewerSignedIn !== null ? gateFor(policy.access, 'read', viewerSignedIn) : null

  useEffect(() => {
    if (inView && readGate === 'allow') void load()
  }, [load, inView, readGate])

  // The sign-in button mirrors the Comments widget: a configured sign-in page, else the OAuth flow.
  const signInHref = safeUrl(signInUrl)
  async function startSignIn() {
    dispatch({ type: 'sign-in/error', error: null })
    try {
      window.location.assign(await beginOAuthSignIn({ baseUrl, pageUrl: pageUrl ?? window.location.href, fetchImpl }))
    } catch (err) {
      dispatch({ type: 'sign-in/error', error: describeError(err) })
    }
  }

  const roots: ThreadNode[] = useMemo(() => sortCommentRoots(buildCommentTree(rows), sort), [rows, sort])
  // Deleting the last thread of a page empties its window, so fall back to the
  // last page that still has roots instead of rendering nothing (never refetches).
  const currentPage = Math.min(page, Math.max(1, Math.ceil(roots.length / limit)))
  // A reply created after the stream moved past its thread's page is not
  // included until more rows load: the list endpoint has no per-thread query.
  const pageRoots = roots.slice((currentPage - 1) * limit, currentPage * limit)

  // A page is a window over roots (threads): fill the destination window, then render it.
  const goNext = useCallback(async () => {
    const target = currentPage + 1
    dispatch({ type: 'page/start' })
    try {
      const window = await loadThreadWindow({
        site,
        baseUrl,
        pageUrl,
        limit,
        fetchImpl,
        pages: target,
        existing: rows,
      })
      dispatch({ type: 'page/success', comments: window.comments, hasMore: window.hasMore, page: target })
    } catch (err) {
      dispatch({ type: 'page/error', error: describeError(err, { title: 'Failed to load more comments' }) })
    }
  }, [baseUrl, currentPage, fetchImpl, limit, pageUrl, rows, site])

  const goPrev = useCallback(() => dispatch({ type: 'page/set', page: currentPage - 1 }), [currentPage])
  const goNextClick = useCallback(() => void goNext(), [goNext])

  function handleSortChange(next: ThreadSort) {
    // Window boundaries follow the new order, so start from its first page.
    dispatch({ type: 'sort/set', sort: next })
  }

  return (
    <WidgetRootContext value={rootRef}>
      <section
        ref={rootRef}
        className={`lc-comments grid gap-4 ${dark ? 'dark' : ''}`}
        style={themeVarsToStyle(themeVars, dark)}
        aria-label="Comments"
      >
        {readGate === 'sign-in' ? (
          <>
            <SignInPrompt
              info={signInRequired('read')}
              context="read"
              signInHref={signInHref}
              onSignIn={signInHref ? undefined : () => void startSignIn()}
            />
            {signInError && <CommentError info={signInError} />}
          </>
        ) : (
          <CommentViewerThread
            status={status}
            error={error}
            roots={roots}
            pageRoots={pageRoots}
            page={currentPage}
            limit={limit}
            hasMore={hasMore}
            loadingPage={loadingPage}
            sort={sort}
            math={math}
            mermaid={mermaid}
            codeHighlight={codeHighlight}
            listRef={listRef}
            onRetry={() => void load()}
            onSortChange={handleSortChange}
            onPrev={goPrev}
            onNext={goNextClick}
          />
        )}
        <footer className="lc-footer mt-2 text-right text-xs text-muted-foreground">
          Powered by{' '}
          <a
            className="underline underline-offset-4 hover:text-foreground"
            href="https://github.com/lst97-oss/last-comments"
            target="_blank"
            rel="noreferrer"
          >
            last-comments
          </a>
        </footer>
      </section>
    </WidgetRootContext>
  )
}

type CommentViewerThreadProps = {
  status: ViewerStatus
  error: ErrorInfo | null
  roots: ThreadNode[]
  pageRoots: ThreadNode[]
  page: number
  limit: number
  hasMore: boolean
  loadingPage: boolean
  sort: ThreadSort
  math: boolean
  mermaid: boolean
  codeHighlight: boolean
  listRef: RefObject<HTMLElement | null>
  onRetry: () => void
  onSortChange: (next: ThreadSort) => void
  onPrev: () => void
  onNext: () => void
}

// The list half of the viewer: the status surface, the current page window,
// its thread guides and the pager. Kept out of CommentViewer so the fetch and
// gate logic there stays a single readable flow.
function CommentViewerThread({
  status,
  error,
  roots,
  pageRoots,
  page,
  limit,
  hasMore,
  loadingPage,
  sort,
  math,
  mermaid,
  codeHighlight,
  listRef,
  onRetry,
  onSortChange,
  onPrev,
  onNext,
}: CommentViewerThreadProps) {
  return (
    <>
      {status === 'loading' && <CommentSkeletons count={3} readOnly />}
      {status === 'error' && error && <CommentError info={error} onRetry={onRetry} />}
      {status === 'ready' && roots.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {roots.length > 0 && <ThreadSortToggle value={sort} onChange={onSortChange} />}
      {pageRoots.length > 0 && (
        <section ref={listRef} aria-label="Comments" className="lc-thread-guides relative grid gap-4">
          {/* New window or a new render order remounts to re-measure. */}
          <ThreadGuides key={`${page}:${sort}:${threadSignature(pageRoots)}`} listRef={listRef} />
          {pageRoots.map((node) => (
            <CommentItem
              key={node.comment.id}
              node={node}
              depth={0}
              pendingVotes={{}}
              replyTo={null}
              readOnly
              math={math}
              mermaid={mermaid}
              codeHighlight={codeHighlight}
              onVote={noop}
              onClear={noop}
              onReply={noop}
              onEdit={noopAsync}
              onDelete={noopAsync}
            />
          ))}
        </section>
      )}
      {loadingPage && <CommentSkeletons count={2} readOnly />}
      {status === 'ready' && (
        <CommentsPager
          page={page}
          limit={limit}
          threads={roots.length}
          hasMore={hasMore}
          loading={loadingPage}
          onPrev={onPrev}
          onNext={onNext}
        />
      )}
    </>
  )
}
