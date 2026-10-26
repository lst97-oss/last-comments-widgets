import {
  beginOAuthSignIn,
  buildCommentTree,
  type Comment,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [rows, setRows] = useState<Comment[]>([])
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<ThreadSort>('newest')
  const [hasMore, setHasMore] = useState(false)
  const [loadingPage, setLoadingPage] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<ErrorInfo | null>(null)
  // The site's policy and the visitor's session, both needed before a private site's thread may load.
  const [policy, setPolicy] = useState<ReturnType<typeof resolveSettings> | null>(null)
  const [viewerSignedIn, setViewerSignedIn] = useState<boolean | null>(null)
  const [signInError, setSignInError] = useState<ErrorInfo | null>(null)
  // `lazy` holds the first fetch until the viewer nears the viewport (SSR/test safe).

  const rootRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLElement>(null)
  const inView = useInView(rootRef, lazy)

  // A prop flip can leave an older request in flight; only the newest load may commit.
  const loadSeq = useRef(0)
  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    setStatus('loading')
    setPage(1)
    setError(null)
    try {
      // One `limit`-row fetch yields fewer threads (replies consume rows), so
      // fill window 1 before rendering it.
      const window = await loadThreadWindow({ site, baseUrl, pageUrl, limit, fetchImpl, pages: 1 })
      if (seq !== loadSeq.current) return
      setRows(window.comments)
      setHasMore(window.hasMore)
      setStatus('ready')
    } catch (err) {
      if (seq !== loadSeq.current) return
      setError(describeError(err))
      setStatus('error')
    }
  }, [site, baseUrl, pageUrl, limit, fetchImpl])

  // The policy and the session are read once the viewer is in view. A private site's thread waits for both.
  useEffect(() => {
    if (!inView) return
    let active = true
    void fetchCommentSettings({ baseUrl, site, fetchImpl }).then((value) => {
      if (active) setPolicy(resolveSettings({}, undefined, value))
    })
    void fetchViewerSession({ baseUrl, fetchImpl }).then(
      (next) => {
        if (active) setViewerSignedIn(next !== null)
      },
      () => {
        if (active) setViewerSignedIn(false)
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
    setSignInError(null)
    try {
      window.location.assign(await beginOAuthSignIn({ baseUrl, pageUrl: pageUrl ?? window.location.href, fetchImpl }))
    } catch (err) {
      setSignInError(describeError(err))
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
    setLoadingPage(true)
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
      setRows(window.comments)
      setHasMore(window.hasMore)
      setPage(target)
    } catch (err) {
      setError(describeError(err, { title: 'Failed to load more comments' }))
      setStatus('error')
    } finally {
      setLoadingPage(false)
    }
  }, [baseUrl, currentPage, fetchImpl, limit, pageUrl, rows, site])

  const goPrev = useCallback(() => setPage(currentPage - 1), [currentPage])
  const goNextClick = useCallback(() => void goNext(), [goNext])

  function handleSortChange(next: ThreadSort) {
    setSort(next)
    // Window boundaries follow the new order, so start from its first page.
    setPage(1)
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
          <>
            {status === 'loading' && <CommentSkeletons count={3} readOnly />}
            {status === 'error' && error && <CommentError info={error} onRetry={() => void load()} />}
            {status === 'ready' && roots.length === 0 && (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            )}
            {roots.length > 0 && <ThreadSortToggle value={sort} onChange={handleSortChange} />}
            {pageRoots.length > 0 && (
              <section ref={listRef} aria-label="Comments" className="lc-thread-guides relative grid gap-4">
                {/* New window or a new render order remounts to re-measure. */}
                <ThreadGuides key={`${currentPage}:${sort}:${threadSignature(pageRoots)}`} listRef={listRef} />
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
                page={currentPage}
                limit={limit}
                threads={roots.length}
                hasMore={hasMore}
                loading={loadingPage}
                onPrev={goPrev}
                onNext={goNextClick}
              />
            )}
          </>
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
