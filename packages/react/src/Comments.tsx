import {
  ApiError,
  beginOAuthSignIn,
  buildCommentTree,
  type Comment,
  canModerate,
  createClient,
  DEFAULT_EDIT_WINDOW_MINUTES,
  describeError,
  type ErrorInfo,
  fetchViewerSession,
  loadThreadWindow,
  type ModerationAction,
  moderationCommentToComment,
  normalizePageUrl,
  safeUrl,
  signOutViewerSession,
  type ThreadNode,
  themeVarsToStyle,
  type ViewerSession,
  type VoteValue,
} from '@last-comments/client'
import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CommentError } from './CommentError'
import { CommentForm } from './CommentForm'
import { CommentItem } from './CommentItem'
import { CommentSkeletons } from './CommentSkeletons'
import { CommentsPager } from './CommentsPager'
import type { CommentsProps } from './types'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Skeleton } from './ui/skeleton'
import { useTheme } from './useTheme'
import { WidgetRootContext } from './WidgetRootContext'

type Status = 'loading' | 'ready' | 'error'

// Moderation calls are same-origin; the API's own codes carry the framing.
function moderationError(err: unknown, title: string): ErrorInfo {
  const code = err instanceof ApiError ? err.code : null
  if (code === 'UNAUTHENTICATED') return describeError(err, { title, message: 'Please sign in to moderate comments.' })
  if (code === 'FORBIDDEN')
    return describeError(err, { title, message: 'You do not have permission to moderate this site.' })
  return describeError(err, { title })
}

export function Comments({
  site,
  baseUrl,
  pageUrl,
  turnstileSiteKey,
  limit = 20,
  theme = 'system',
  themeVars,
  signInUrl,
  onSignInClick,
  viewerUserId,
  viewerRole,
  editWindowMinutes = DEFAULT_EDIT_WINDOW_MINUTES,
  lazy = false,
  fetchImpl,
}: CommentsProps) {
  const dark = useTheme(theme)
  const moderator = canModerate(viewerRole)
  const [session, setSession] = useState<ViewerSession | null>(null)
  const [commentAs, setCommentAs] = useState<'account' | 'anonymous'>('account')
  const signedIn = Boolean(session) || Boolean(viewerUserId)
  const guest = !signedIn || commentAs === 'anonymous'
  const client = useMemo(() => createClient({ baseUrl, site, fetchImpl }), [baseUrl, site, fetchImpl])
  const url = useMemo(() => pageUrl ?? (typeof window !== 'undefined' ? window.location.href : ''), [pageUrl])
  const [comments, setComments] = useState<Comment[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [sessionStatus, setSessionStatus] = useState<'loading' | 'ready'>('loading')
  const [page, setPage] = useState(1)
  const [listError, setListError] = useState<ErrorInfo | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingPage, setLoadingPage] = useState(false)
  const [posting, setPosting] = useState(false)
  const [formError, setFormError] = useState<ErrorInfo | null>(null)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [pendingVotes, setPendingVotes] = useState<Record<string, boolean>>({})
  const [pageLock, setPageLock] = useState<{ pageId: string; locked: boolean } | null>(null)
  const [lockPending, setLockPending] = useState(false)
  const [pendingModeration, setPendingModeration] = useState<Record<string, boolean>>({})
  const [actionError, setActionError] = useState<ErrorInfo | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signInError, setSignInError] = useState<ErrorInfo | null>(null)
  // `lazy` holds the first fetch until the widget nears the viewport (SSR/test safe).
  const [inView, setInView] = useState(!lazy)

  const rootRef = useRef<HTMLDivElement>(null)

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
    setListError(null)
    setActionError(null)
    try {
      if (moderator) {
        // Resolve this page from the site's page list, then read its thread
        // including hidden/deleted rows.
        const overview = await client.listModeration({ limit: 1 })
        const normalized = normalizePageUrl(url)
        const match = overview.pages.find((entry) => normalizePageUrl(entry.canonicalUrl) === normalized) ?? null
        setPageLock(match ? { pageId: match.id, locked: match.isLocked } : null)
        if (!match) {
          setComments([])
          setHasMore(false)
          setStatus('ready')
          return
        }
        const moderationPage = await client.listModeration({ pageId: match.id, limit, offset: 0 })
        let rows = moderationPage.comments.map(moderationCommentToComment)
        let more = rows.length < moderationPage.total
        // Replies consume rows, so one limit-row fetch can yield fewer than
        // `limit` roots: fill window 1 before rendering it.
        while (more && buildCommentTree(rows).length < limit) {
          const next = await client.listModeration({ pageId: match.id, limit, offset: rows.length })
          const batch = next.comments.map(moderationCommentToComment)
          if (batch.length === 0) break
          rows = [...rows, ...batch]
          more = rows.length < next.total
        }
        setComments(rows)
        setHasMore(more)
        setStatus('ready')
        return
      }
      // Replies consume rows, so a limit-row fetch yields fewer than `limit`
      // roots: fill window 1 before rendering it.
      const window = await loadThreadWindow({ site, baseUrl, pageUrl: url, limit, fetchImpl, pages: 1 })
      setComments(window.comments)
      setHasMore(window.hasMore)
      setStatus('ready')
    } catch (err) {
      setListError(moderator ? moderationError(err, 'Failed to load comments') : describeError(err))
      setStatus('error')
    }
  }, [client, url, limit, moderator, site, baseUrl, fetchImpl])

  useEffect(() => {
    if (inView) void load()
  }, [load, inView])

  useEffect(() => {
    // Deferred (below-the-fold) widgets probe the session only once in view:
    // until then the identity chip keeps its disabled skeleton.
    if (!inView) return
    // Resolves to null for guests and for APIs the widget cannot reach.
    fetchViewerSession({ baseUrl, fetchImpl })
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setSessionStatus('ready'))
  }, [baseUrl, fetchImpl, inView])

  // Moderator streams use a total-based cursor instead of the thread-window loader.
  async function loadNextModeration(offset: number): Promise<{ rows: Comment[]; hasMore: boolean } | null> {
    setLoadingPage(true)
    try {
      const next = await client.listModeration({ pageId: pageLock?.pageId, limit, offset })
      const rows = next.comments.map(moderationCommentToComment)
      const more = offset + rows.length < next.total
      setComments((prev) => [...prev, ...rows])
      setHasMore(more)
      return { rows, hasMore: more }
    } catch (err) {
      setListError(moderationError(err, 'Failed to load more comments'))
      setStatus('error')
      return null
    } finally {
      setLoadingPage(false)
    }
  }

  async function goNext() {
    const target = currentPage + 1
    if (moderator) {
      // A page is a window over roots (threads): fill the destination window,
      // not the one being left, or the new page comes up short.
      let rows = comments
      let more = hasMore
      while (more && buildCommentTree(rows).length < target * limit) {
        const next = await loadNextModeration(rows.length)
        if (!next) return
        if (next.rows.length === 0) break
        rows = [...rows, ...next.rows]
        more = next.hasMore
      }
      setPage(target)
      return
    }
    setLoadingPage(true)
    try {
      const window = await loadThreadWindow({
        site,
        baseUrl,
        pageUrl: url,
        limit,
        fetchImpl,
        pages: target,
        existing: comments,
      })
      setComments(window.comments)
      setHasMore(window.hasMore)
      setPage(target)
    } catch (err) {
      setListError(describeError(err, { title: 'Failed to load more comments' }))
      setStatus('error')
    } finally {
      setLoadingPage(false)
    }
  }

  function applyVote(id: string, score: number, viewerVote: VoteValue | null) {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, score, viewerVote } : c)))
  }

  async function handleVote(comment: Comment, value: VoteValue) {
    setPendingVotes((prev) => ({ ...prev, [comment.id]: true }))
    setActionError(null)
    try {
      const vote = await client.castVote(comment.id, value)
      applyVote(comment.id, vote.score, vote.viewerVote)
    } catch (err) {
      setActionError(describeError(err, { title: "Your vote wasn't saved" }))
    } finally {
      setPendingVotes((prev) => ({ ...prev, [comment.id]: false }))
    }
  }

  async function handleClear(comment: Comment) {
    setPendingVotes((prev) => ({ ...prev, [comment.id]: true }))
    setActionError(null)
    try {
      const vote = await client.clearVote(comment.id)
      applyVote(comment.id, vote.score, vote.viewerVote)
    } catch (err) {
      // keep existing vote state on failure
      setActionError(describeError(err, { title: "Your vote wasn't saved" }))
    } finally {
      setPendingVotes((prev) => ({ ...prev, [comment.id]: false }))
    }
  }

  // `false` = nothing was sent: the composer keeps the draft for a retry.
  async function handleSubmit(input: {
    authorName: string
    bodyMarkdown: string
    verificationToken: string | undefined
  }): Promise<boolean> {
    const bodyMarkdown = input.bodyMarkdown.trim()
    // Local guard: nothing was sent, so no API copy applies.
    const postTitle = replyTo ? "Your reply wasn't posted" : "Your comment wasn't posted"
    if (!bodyMarkdown) {
      setFormError({ code: null, title: postTitle, message: 'Please write a comment first.', action: 'none' })
      return false
    }
    setPosting(true)
    setFormError(null)
    try {
      const created = await client.postComment({
        url,
        bodyMarkdown,
        anonymous: guest,
        ...(replyTo ? { parentId: replyTo } : { title: typeof document !== 'undefined' ? document.title : undefined }),
        ...(input.authorName.trim() ? { authorName: input.authorName.trim() } : {}),
        ...(input.verificationToken ? { verificationToken: input.verificationToken } : {}),
      })
      setComments((prev) => [...prev, created])
      setPage(1)
      setReplyTo(null)
      if (status !== 'ready') setStatus('ready')
      return true
    } catch (err) {
      setFormError(describeError(err, { title: postTitle }))
      return false
    } finally {
      setPosting(false)
    }
  }

  // The item renders this in its own slot: it keeps the editor (and draft) open
  // on failure, so the page-level action block must stay out of the edit path.
  async function handleEdit(commentId: string, bodyMarkdown: string): Promise<ErrorInfo | null> {
    setActionError(null)
    try {
      const updated = await client.editOwnComment({ commentId, bodyMarkdown })
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)))
      return null
    } catch (err) {
      return describeError(err, { title: "Your edit wasn't saved" })
    }
  }

  async function handleDelete(commentId: string) {
    setActionError(null)
    try {
      await client.deleteOwnComment(commentId)
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    } catch (err) {
      setActionError(describeError(err, { title: "Your comment wasn't deleted" }))
    }
  }

  async function handleSignIn() {
    setSigningIn(true)
    setSignInError(null)
    try {
      window.location.assign(await beginOAuthSignIn({ baseUrl, pageUrl: url, fetchImpl }))
    } catch (err) {
      setSignInError(describeError(err))
      setSigningIn(false)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    setSignInError(null)
    try {
      await signOutViewerSession({ baseUrl, fetchImpl })
      setSession(null)
      setCommentAs('anonymous')
    } catch (err) {
      setSignInError(describeError(err))
    } finally {
      setSigningOut(false)
    }
  }

  async function handleModerate(comment: Comment, action: ModerationAction) {
    setPendingModeration((prev) => ({ ...prev, [comment.id]: true }))
    setActionError(null)
    try {
      const patch = await client.moderateComment({ commentId: comment.id, action })
      setComments((prev) =>
        prev.map((c) => (c.id === comment.id ? { ...c, status: patch.status, pinnedAt: patch.pinnedAt } : c)),
      )
    } catch (err) {
      setActionError(moderationError(err, 'That moderation action failed'))
    } finally {
      setPendingModeration((prev) => ({ ...prev, [comment.id]: false }))
    }
  }

  async function handleBlockUser(comment: Comment, blocked: boolean) {
    if (!comment.userId) return
    setPendingModeration((prev) => ({ ...prev, [comment.id]: true }))
    setActionError(null)
    try {
      await client.setUserBlocked({ userId: comment.userId, blocked })
      setComments((prev) => prev.map((c) => (c.userId === comment.userId ? { ...c, userBlocked: blocked } : c)))
    } catch (err) {
      setActionError(moderationError(err, 'That moderation action failed'))
    } finally {
      setPendingModeration((prev) => ({ ...prev, [comment.id]: false }))
    }
  }

  async function handleToggleLock() {
    if (!pageLock) return
    setLockPending(true)
    setActionError(null)
    try {
      const next = await client.setPageLocked({ pageId: pageLock.pageId, locked: !pageLock.locked })
      setPageLock({ pageId: next.id, locked: next.isLocked })
    } catch (err) {
      setActionError(moderationError(err, 'That moderation action failed'))
    } finally {
      setLockPending(false)
    }
  }

  const roots: ThreadNode[] = useMemo(() => buildCommentTree(comments), [comments])
  // Deleting the last thread of a page empties its window, so fall back to the
  // last page that still has roots instead of rendering nothing (never refetches).
  const currentPage = Math.min(page, Math.max(1, Math.ceil(roots.length / limit)))
  // A reply created after the stream moved past its thread's page is not
  // included until more rows load: the list endpoint has no per-thread query.
  const pageRoots = roots.slice((currentPage - 1) * limit, currentPage * limit)
  const signInHref = safeUrl(signInUrl)
  // Every error block offers the same sign-in route: the host hook, then the
  // host link, else the API's own OAuth start.
  const signInProps = onSignInClick
    ? { onSignIn: onSignInClick }
    : signInHref
      ? { signInHref }
      : { onSignIn: () => void handleSignIn() }

  return (
    <WidgetRootContext value={rootRef}>
      <div
        ref={rootRef}
        className={`lc-comments grid grid-cols-1 gap-4 ${dark ? 'dark' : ''}`}
        style={themeVarsToStyle(themeVars, dark)}
      >
        {moderator && pageLock && (
          <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
            <span className="text-muted-foreground">
              {pageLock.locked ? 'Comments are locked on this page.' : 'Comments are open on this page.'}
            </span>
            <Button
              className="ml-auto"
              size="sm"
              variant="outline"
              disabled={lockPending}
              onClick={() => void handleToggleLock()}
            >
              {pageLock.locked ? 'Unlock' : 'Lock'}
            </Button>
          </div>
        )}
        {actionError && <CommentError info={actionError} onRetry={() => void load()} {...signInProps} />}
        <CommentForm
          siteKey={turnstileSiteKey}
          guest={guest}
          parentId={replyTo}
          pending={posting}
          error={formError}
          {...signInProps}
          identityPending={sessionStatus === 'loading'}
          identity={
            !replyTo ? (
              <>
                <span className="text-xs text-muted-foreground">Comment as</span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="lc-identity-trigger"
                    disabled={sessionStatus === 'loading' || signingIn || signingOut}
                    render={<Button size="sm" variant="outline" />}
                  >
                    {sessionStatus === 'loading' ? (
                      <Skeleton className="h-4 w-16" />
                    ) : (
                      <span className="label max-w-[10rem] truncate">
                        {guest ? 'Anonymous' : session?.name || 'Your account'}
                      </span>
                    )}
                    <ChevronDown />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="left-0 max-w-[calc(100vw-2rem)]">
                    <DropdownMenuRadioGroup
                      value={guest ? 'anonymous' : 'account'}
                      onValueChange={(value) => setCommentAs(value as 'account' | 'anonymous')}
                    >
                      <DropdownMenuRadioItem value="anonymous" closeOnClick>
                        Anonymous
                      </DropdownMenuRadioItem>
                      {signedIn ? (
                        <DropdownMenuRadioItem value="account" closeOnClick>
                          {session?.name || 'Your account'} (you)
                        </DropdownMenuRadioItem>
                      ) : (
                        <DropdownMenuItem
                          disabled={signingIn}
                          render={signInHref ? <a href={signInHref}>Sign in…</a> : undefined}
                          onClick={signInHref ? undefined : () => void handleSignIn()}
                        >
                          Sign in…
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuRadioGroup>
                    {session && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={signingOut} onClick={() => void handleSignOut()}>
                          Sign out
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {signInError && <CommentError info={signInError} />}
              </>
            ) : undefined
          }
          onSubmit={handleSubmit}
          onCancelReply={replyTo ? () => setReplyTo(null) : undefined}
        />
        {status === 'loading' && <CommentSkeletons count={3} />}
        {status === 'error' && listError && (
          <CommentError info={listError} onRetry={() => void load()} {...signInProps} />
        )}
        {status === 'ready' && roots.length === 0 && (
          <section className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
            No comments yet.
          </section>
        )}
        {pageRoots.length > 0 && (
          <section aria-label="Comments" className="grid grid-cols-1 gap-3">
            {pageRoots.map((node) => (
              <CommentItem
                key={node.comment.id}
                node={node}
                depth={0}
                pendingVotes={pendingVotes}
                replyTo={replyTo}
                viewerUserId={viewerUserId ?? session?.userId}
                viewerRole={viewerRole}
                hideVotes={moderator}
                pendingModeration={pendingModeration}
                editWindowMinutes={editWindowMinutes}
                onVote={(comment, value) => void handleVote(comment, value)}
                onClear={(comment) => void handleClear(comment)}
                onReply={setReplyTo}
                onEdit={handleEdit}
                onDelete={(id) => void handleDelete(id)}
                onModerate={(comment, action) => void handleModerate(comment, action)}
                onBlockUser={(comment, blocked) => void handleBlockUser(comment, blocked)}
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
      </div>
    </WidgetRootContext>
  )
}
