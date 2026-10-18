import {
  buildCommentTree,
  type Comment,
  describeError,
  type ErrorInfo,
  loadThreadWindow,
  type ThreadNode,
  themeVarsToStyle,
  type ViewerOptions,
} from '@last-comments/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CommentError } from './CommentError'
import { CommentItem } from './CommentItem'
import { CommentSkeletons } from './CommentSkeletons'
import { CommentsPager } from './CommentsPager'
import { useTheme } from './useTheme'
import { WidgetRootContext } from './WidgetRootContext'
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
  const [hasMore, setHasMore] = useState(false)
  const [loadingPage, setLoadingPage] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<ErrorInfo | null>(null)
  // `lazy` holds the first fetch until the viewer nears the viewport (SSR/test safe).
  const [inView, setInView] = useState(!lazy)

  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!lazy || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const node = rootRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [lazy])

  const load = useCallback(async () => {
    setStatus('loading')
    setPage(1)
    setError(null)
    try {
      // One `limit`-row fetch yields fewer threads (replies consume rows), so
      // fill window 1 before rendering it.
      const window = await loadThreadWindow({ site, baseUrl, pageUrl, limit, fetchImpl, pages: 1 })
      setRows(window.comments)
      setHasMore(window.hasMore)
      setStatus('ready')
    } catch (err) {
      setError(describeError(err))
      setStatus('error')
    }
  }, [site, baseUrl, pageUrl, limit, fetchImpl])

  // A page is a window over roots (threads): fill the destination window, then render it.
  async function goNext() {
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
  }

  useEffect(() => {
    if (inView) void load()
  }, [load, inView])

  const roots: ThreadNode[] = useMemo(() => buildCommentTree(rows), [rows])
  // Deleting the last thread of a page empties its window, so fall back to the
  // last page that still has roots instead of rendering nothing (never refetches).
  const currentPage = Math.min(page, Math.max(1, Math.ceil(roots.length / limit)))
  // A reply created after the stream moved past its thread's page is not
  // included until more rows load: the list endpoint has no per-thread query.
  const pageRoots = roots.slice((currentPage - 1) * limit, currentPage * limit)

  const noop = () => {}
  // The read-only viewer never edits or deletes: null = "no error".
  const noopAsync = async () => null

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
        {pageRoots.length > 0 && (
          <section aria-label="Comments" className="grid gap-4">
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
            onPrev={() => setPage(currentPage - 1)}
            onNext={() => void goNext()}
          />
        )}
      </section>
    </WidgetRootContext>
  )
}
