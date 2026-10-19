import {
  buildCommentTree,
  type Comment,
  describeError,
  type ErrorInfo,
  loadThreadWindow,
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
import { ThreadGuides, threadSignature } from './ThreadGuides'
import { ThreadSortToggle } from './ThreadSortToggle'
import { useInView } from './useInView'
import { useTheme } from './useTheme'
import { WidgetRootContext } from './WidgetRootContext'

// The read-only viewer never edits, deletes or votes.
const noop = () => {}
// null = "no error".
const noopAsync = async () => null
export type CommentViewerProps = ViewerOptions & {
  limit?: number
  // Embed below the fold: hold the first fetch until the viewer nears the viewport.
  lazy?: boolean
}

export function CommentViewer({
  site,
  baseUrl,
  pageUrl,
  limit = 20,
  theme = 'system',
  themeVars,
  lazy = false,
  fetchImpl,
}: CommentViewerProps) {
  const dark = useTheme(theme)
  const [rows, setRows] = useState<Comment[]>([])
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<ThreadSort>('newest')
  const [hasMore, setHasMore] = useState(false)
  const [loadingPage, setLoadingPage] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<ErrorInfo | null>(null)
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

  useEffect(() => {
    if (inView) void load()
  }, [load, inView])

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
        {status === 'loading' && <CommentSkeletons count={3} />}
        {status === 'error' && error && <CommentError info={error} onRetry={() => void load()} />}
        {status === 'ready' && roots.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
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
                onVote={noop}
                onClear={noop}
                onReply={noop}
                onEdit={noopAsync}
                onDelete={noopAsync}
              />
            ))}
          </section>
        )}
        {loadingPage && <CommentSkeletons count={2} />}
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
      </section>
    </WidgetRootContext>
  )
}
