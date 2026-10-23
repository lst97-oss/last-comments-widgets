import {
  ApiError,
  beginOAuthSignIn,
  buildCommentTree,
  type Comment,
  canModerate,
  createClient,
  DEFAULT_ANON_EDIT_WINDOW_MINUTES,
  DEFAULT_BODY_LIMIT,
  describeError,
  type ErrorInfo,
  fetchViewerSession,
  getEditKey,
  loadThreadWindow,
  type ModerationAction,
  moderationCommentToComment,
  normalizePageUrl,
  safeUrl,
  saveEditKey,
  signOutViewerSession,
  sortCommentRoots,
  type ThreadNode,
  type ThreadSort,
  takeSignInFailure,
  themeVarsToStyle,
  type ViewerSession,
  type VoteValue,
} from '@last-comments-widgets/client'
import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { CommentError } from './CommentError'
import { CommentForm, type CommentFormInput } from './CommentForm'
import { CommentItem } from './CommentItem'
import { CommentSkeletons } from './CommentSkeletons'
import { CommentsPager } from './CommentsPager'
import { ThreadGuides, threadSignature } from './ThreadGuides'
import { ThreadSortToggle } from './ThreadSortToggle'
import { TurnstileConfigContext } from './TurnstileConfig'
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
import { useInView } from './useInView'
import { useItemActions } from './useItemActions'
import { useTheme } from './useTheme'
import { WidgetRootContext } from './WidgetRootContext'

type Status = 'loading' | 'ready' | 'error'

// Async-action flags shared by every row and the composer: one action per
// interaction keeps the pending/error transitions in one place.
export type UiState = {
  posting: boolean
  lockPending: boolean
  signingIn: boolean
  signingOut: boolean
  pendingVotes: Record<string, boolean>
  pendingModeration: Record<string, boolean>
  signInError: ErrorInfo | null
}

export type UiAction =
  | { type: 'posting/set'; posting: boolean }
  | { type: 'lock/set'; pending: boolean }
  | { type: 'signing-in/set'; value: boolean }
  | { type: 'signing-out/set'; value: boolean }
  | { type: 'votes/pending'; id: string; pending: boolean }
  | { type: 'moderation/pending'; id: string; pending: boolean }
  | { type: 'sign-in-error/set'; error: ErrorInfo | null }

export const UI_INITIAL: UiState = {
  posting: false,
  lockPending: false,
  signingIn: false,
  signingOut: false,
  pendingVotes: {},
  pendingModeration: {},
  signInError: null,
}

type VotePatch = { score: number; viewerVote: VoteValue | null }
type VoteOverlay = Record<string, VotePatch>
const EMPTY_VOTE_OVERLAY: VoteOverlay = {}

// Votes change one row, so they must not rebuild every tree node: clone only
// the paths whose score changed (an untouched subtree keeps its identity).
function applyVoteOverlay(nodes: ThreadNode[], overlay: VoteOverlay): ThreadNode[] {
  if (Object.keys(overlay).length === 0) return nodes
  const visit = (node: ThreadNode): ThreadNode => {
    const patch = overlay[node.comment.id]
    const children = node.children.map(visit)
    const childrenChanged = children.some((child, index) => child !== node.children[index])
    if (!patch && !childrenChanged) return node
    return {
      comment: patch ? { ...node.comment, ...patch } : node.comment,
      children: childrenChanged ? children : node.children,
    }
  }
  return nodes.map(visit)
}

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'posting/set':
      return { ...state, posting: action.posting }
    case 'lock/set':
      return { ...state, lockPending: action.pending }
    case 'signing-in/set':
      return { ...state, signingIn: action.value }
    case 'signing-out/set':
      return { ...state, signingOut: action.value }
    case 'votes/pending':
      return { ...state, pendingVotes: { ...state.pendingVotes, [action.id]: action.pending } }
    case 'moderation/pending':
      return { ...state, pendingModeration: { ...state.pendingModeration, [action.id]: action.pending } }
    case 'sign-in-error/set':
      return { ...state, signInError: action.error }
    default:
      throw new Error(`Unknown comments UI action: ${JSON.stringify(action)}`)
  }
}

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
  pageId,
  onModerated,
  turnstileSiteKey,
  turnstileOptions,
  limit = 20,
  theme = 'system',
  themeVars,
  signInUrl,
  onSignInClick,
  viewerUserId,
  viewerRole,
  anonEditWindowMinutes = DEFAULT_ANON_EDIT_WINDOW_MINUTES,
  actionMode = 'icon-text',
  bodyLimit = DEFAULT_BODY_LIMIT,
  lazy = false,
  fetchImpl,
}: CommentsProps) {
  const dark = useTheme(theme)
  // Widget-wide Turnstile settings for the head and reply composers; the object
  // identity is memoized so consumers only re-render when it really changes.
  const turnstileConfig = useMemo(() => ({ dark, options: turnstileOptions }), [dark, turnstileOptions])
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
  const [sort, setSort] = useState<ThreadSort>('newest')
  const [listError, setListError] = useState<ErrorInfo | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingPage, setLoadingPage] = useState(false)
  const [ui, uiDispatch] = useReducer(uiReducer, UI_INITIAL)
  const { posting, lockPending, signingIn, signingOut, pendingVotes, pendingModeration, signInError } = ui
  const [formError, setFormError] = useState<ErrorInfo | null>(null)
  // Bumped after a successful post: remounting clears the composer draft.
  const [formEpoch, setFormEpoch] = useState(0)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [pageLock, setPageLock] = useState<{ pageId: string; locked: boolean } | null>(null)
  // Thread the moderator UI is pointed at: the `pageId` prop, or the page the
  // URL matched. Rows and moderator posts both address it.
  const [moderationPageId, setModerationPageId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<ErrorInfo | null>(null)
  // `lazy` holds the first fetch until the widget nears the viewport (SSR/test safe).

  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLElement>(null)
  // The head composer's in-flight lock: it outlives the render that disables
  // the button, so a second click cannot post the same comment twice.
  const postingRef = useRef(false)
  const inView = useInView(rootRef, lazy)

  // A prop flip can leave an older request in flight; only the newest load may commit.
  const loadSeq = useRef(0)
  const [loadEpoch, setLoadEpoch] = useState(0)
  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    setStatus('loading')
    setPage(1)
    setListError(null)
    setActionError(null)
    try {
      if (moderator) {
        // Resolve this page from the site's page list, then read its thread
        // including hidden/deleted rows. A host-supplied `pageId` wins: the
        // page list is capped, so a URL match can miss.
        const overview = await client.listModeration({ limit: 1 })
        if (seq !== loadSeq.current) return
        const normalized = normalizePageUrl(url)
        const match = pageId
          ? (overview.pages.find((entry) => entry.id === pageId) ?? null)
          : (overview.pages.find((entry) => normalizePageUrl(entry.canonicalUrl) === normalized) ?? null)
        const threadId = pageId ?? match?.id ?? null
        // Unknown lock state stays unknown: the lock bar is hidden rather than
        // claiming the thread is open.
        setPageLock(match ? { pageId: match.id, locked: match.isLocked } : null)
        setModerationPageId(threadId)
        if (!threadId) {
          setComments([])
          setHasMore(false)
          setLoadEpoch((epoch) => epoch + 1)
          setStatus('ready')
          return
        }
        const moderationPage = await client.listModeration({ pageId: threadId, limit, offset: 0 })
        if (seq !== loadSeq.current) return
        let rows = moderationPage.comments.map(moderationCommentToComment)
        let more = rows.length < moderationPage.total
        // Replies consume rows, so one limit-row fetch can yield fewer than
        // `limit` roots: fill window 1 before rendering it.
        while (more && buildCommentTree(rows).length < limit) {
          const next = await client.listModeration({ pageId: threadId, limit, offset: rows.length })
          if (seq !== loadSeq.current) return
          const batch = next.comments.map(moderationCommentToComment)
          if (batch.length === 0) break
          rows = [...rows, ...batch]
          more = rows.length < next.total
        }
        setComments(rows)
        setHasMore(more)
        setLoadEpoch((epoch) => epoch + 1)
        setStatus('ready')
        return
      }
      // Replies consume rows, so a limit-row fetch yields fewer than `limit`
      // roots: fill window 1 before rendering it.
      const window = await loadThreadWindow({ site, baseUrl, pageUrl: url, limit, fetchImpl, pages: 1 })
      if (seq !== loadSeq.current) return
      setComments(window.comments)
      setHasMore(window.hasMore)
      setLoadEpoch((epoch) => epoch + 1)
      setStatus('ready')
    } catch (err) {
      if (seq !== loadSeq.current) return
      setListError(moderator ? moderationError(err, 'Failed to load comments') : describeError(err))
      setStatus('error')
    }
  }, [client, url, pageId, limit, moderator, site, baseUrl, fetchImpl])

  useEffect(() => {
    if (inView) void load()
  }, [load, inView])

  useEffect(() => {
    // Deferred (below-the-fold) widgets probe the session only once in view:
    // until then the identity chip keeps its disabled skeleton.
    if (!inView) return
    let ignored = false
    // Resolves to null for guests and for APIs the widget cannot reach.
    fetchViewerSession({ baseUrl, fetchImpl })
      .then((next) => {
        if (!ignored) setSession(next)
      })
      .catch(() => {
        if (!ignored) setSession(null)
      })
      .finally(() => {
        if (!ignored) setSessionStatus('ready')
      })
    return () => {
      ignored = true
    }
  }, [baseUrl, fetchImpl, inView])

  // A sign-in the provider rejected returns here with a failure marker. Explain it
  // once in the identity control, then drop the marker so a reload does not repeat it.
  useEffect(() => {
    const failure = takeSignInFailure(window.location.href)
    if (!failure) return
    uiDispatch({ type: 'sign-in-error/set', error: failure.info })
    window.history.replaceState(window.history.state, '', failure.cleanHref)
  }, [])

  // Votes live beside the fetched rows. A reload fetches authoritative scores,
  // so its epoch bump drops stale patches; posts and edits keep them.
  const [votes, setVotes] = useState<{ epoch: number; patch: VoteOverlay }>({
    epoch: 0,
    patch: EMPTY_VOTE_OVERLAY,
  })
  const votePatch = votes.epoch === loadEpoch ? votes.patch : EMPTY_VOTE_OVERLAY
  const applyVote = useCallback(
    (id: string, score: number, viewerVote: VoteValue | null) => {
      setVotes((prev) => ({
        epoch: loadEpoch,
        patch: { ...(prev.epoch === loadEpoch ? prev.patch : EMPTY_VOTE_OVERLAY), [id]: { score, viewerVote } },
      }))
    },
    [loadEpoch],
  )

  const handleVote = useCallback(
    async (comment: Comment, value: VoteValue) => {
      uiDispatch({ type: 'votes/pending', id: comment.id, pending: true })
      setActionError(null)
      try {
        // Moderators vote through the moderation endpoint: the public vote route
        // checks the site's origin allow-list, which a dashboard origin is not on.
        const vote = moderator
          ? await client.setModerationVote({ commentId: comment.id, value })
          : await client.castVote(comment.id, value)
        applyVote(comment.id, vote.score, vote.viewerVote)
      } catch (err) {
        setActionError(describeError(err, { title: "Your vote wasn't saved" }))
      } finally {
        uiDispatch({ type: 'votes/pending', id: comment.id, pending: false })
      }
    },
    [applyVote, client, moderator],
  )

  const handleClear = useCallback(
    async (comment: Comment) => {
      uiDispatch({ type: 'votes/pending', id: comment.id, pending: true })
      setActionError(null)
      try {
        const vote = moderator
          ? await client.setModerationVote({ commentId: comment.id, value: null })
          : await client.clearVote(comment.id)
        applyVote(comment.id, vote.score, vote.viewerVote)
      } catch (err) {
        // keep existing vote state on failure
        setActionError(describeError(err, { title: "Your vote wasn't saved" }))
      } finally {
        uiDispatch({ type: 'votes/pending', id: comment.id, pending: false })
      }
    },
    [applyVote, client, moderator],
  )

  // Shared create path: head comments and inline replies differ only in the
  // parent, so the moderation/origin branching lives here once.
  const postOne = useCallback(
    async ({ parentId, ...input }: CommentFormInput & { parentId: string | null }): Promise<Comment> => {
      const bodyMarkdown = input.bodyMarkdown.trim()
      // Moderators post through the moderation endpoint: the public create path
      // checks the site's origin allow-list, which a dashboard origin is not on.
      const created =
        moderator && moderationPageId
          ? await client.createModerationComment({
              pageId: moderationPageId,
              bodyMarkdown,
              ...(parentId ? { parentId } : {}),
              anonymous: guest,
              ...(guest && input.authorName.trim() ? { authorName: input.authorName.trim() } : {}),
            })
          : await client.postComment({
              url,
              bodyMarkdown,
              anonymous: guest,
              ...(parentId ? { parentId } : { title: typeof document !== 'undefined' ? document.title : undefined }),
              ...(input.authorName.trim() ? { authorName: input.authorName.trim() } : {}),
              ...(input.verificationToken ? { verificationToken: input.verificationToken } : {}),
            })
      // The create routes return the raw row, which has no computed score;
      // without the neutral fields a `best` sort would compare NaNs.
      const normalized = { ...created, score: created.score ?? 0, viewerVote: created.viewerVote ?? null }
      // The server returns the guest edit key exactly once.
      if (normalized.editKey) saveEditKey(normalized.id, normalized.editKey)
      return normalized
    },
    [client, guest, moderationPageId, moderator, url],
  )

  // `false` = nothing was sent: the composer keeps the draft for a retry.
  async function handleSubmit(input: CommentFormInput): Promise<boolean> {
    // The in-flight lock: a second click must not post the same comment twice.
    // The ref is the lock, the reducer state only drives the loading state.
    if (postingRef.current) return false
    const bodyMarkdown = input.bodyMarkdown.trim()
    // Local guard: nothing was sent, so no API copy applies.
    const postTitle = "Your comment wasn't posted"
    if (!bodyMarkdown) {
      setFormError({ code: null, title: postTitle, message: 'Please write a comment first.', action: 'none' })
      return false
    }
    postingRef.current = true
    uiDispatch({ type: 'posting/set', posting: true })
    setFormError(null)
    try {
      const created = await postOne({ parentId: null, ...input })
      setComments((prev) => [...prev, created])
      setPage(1)
      setReplyTo(null)
      setFormEpoch((epoch) => epoch + 1)
      if (status !== 'ready') setStatus('ready')
      if (moderator) onModerated?.()
      return true
    } catch (err) {
      setFormError(describeError(err, { title: postTitle }))
      return false
    } finally {
      postingRef.current = false
      uiDispatch({ type: 'posting/set', posting: false })
    }
  }

  // The inline reply slot owns its pending/error state, so failures return to
  // the item instead of the page-level composer block.
  const handleReplySubmit = useCallback(
    async (commentId: string, input: CommentFormInput): Promise<ErrorInfo | null> => {
      const bodyMarkdown = input.bodyMarkdown.trim()
      if (!bodyMarkdown) {
        return { code: null, title: "Your reply wasn't posted", message: 'Please write a reply first.', action: 'none' }
      }
      try {
        const created = await postOne({ parentId: commentId, ...input })
        setComments((prev) => [...prev, created])
        setPage(1)
        setReplyTo(null)
        if (status !== 'ready') setStatus('ready')
        if (moderator) onModerated?.()
        return null
      } catch (err) {
        return describeError(err, { title: "Your reply wasn't posted" })
      }
    },
    [moderator, onModerated, postOne, status],
  )

  // The item renders this in its own slot: it keeps the editor (and draft) open
  // on failure, so the page-level action block must stay out of the edit path.
  const handleEdit = useCallback(
    async (commentId: string, bodyMarkdown: string): Promise<ErrorInfo | null> => {
      setActionError(null)
      try {
        // Moderators edit through the moderation endpoint for the same reason
        // they post through it: the public PATCH checks the site's origins.
        const editKey = moderator ? null : getEditKey(commentId)
        const updated = moderator
          ? await client.editModerationComment({ commentId, bodyMarkdown })
          : await client.editOwnComment({ commentId, bodyMarkdown, ...(editKey ? { editKey } : {}) })
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId
              ? { ...c, ...updated, score: updated.score ?? c.score, viewerVote: updated.viewerVote ?? c.viewerVote }
              : c,
          ),
        )
        return null
      } catch (err) {
        return describeError(err, { title: "Your edit wasn't saved" })
      }
    },
    [client, moderator],
  )

  const handleDelete = useCallback(
    async (commentId: string) => {
      setActionError(null)
      try {
        await client.deleteOwnComment(commentId)
        // Keep the row as a tombstone: the thread keeps its shape and the
        // normal view renders the deleted placeholder instead of the body.
        setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, status: 'deleted' } : c)))
      } catch (err) {
        setActionError(describeError(err, { title: "Your comment wasn't deleted" }))
      }
    },
    [client],
  )

  async function handleSignIn() {
    uiDispatch({ type: 'signing-in/set', value: true })
    uiDispatch({ type: 'sign-in-error/set', error: null })
    try {
      window.location.assign(await beginOAuthSignIn({ baseUrl, pageUrl: url, fetchImpl }))
    } catch (err) {
      uiDispatch({ type: 'sign-in-error/set', error: describeError(err) })
      uiDispatch({ type: 'signing-in/set', value: false })
    }
  }

  async function handleSignOut() {
    uiDispatch({ type: 'signing-out/set', value: true })
    uiDispatch({ type: 'sign-in-error/set', error: null })
    try {
      await signOutViewerSession({ baseUrl, fetchImpl })
      setSession(null)
      setCommentAs('anonymous')
    } catch (err) {
      uiDispatch({ type: 'sign-in-error/set', error: describeError(err) })
    } finally {
      uiDispatch({ type: 'signing-out/set', value: false })
    }
  }

  const handleModerate = useCallback(
    async (comment: Comment, action: ModerationAction) => {
      uiDispatch({ type: 'moderation/pending', id: comment.id, pending: true })
      setActionError(null)
      try {
        const patch = await client.moderateComment({ commentId: comment.id, action })
        setComments((prev) =>
          prev.map((c) => (c.id === comment.id ? { ...c, status: patch.status, pinnedAt: patch.pinnedAt } : c)),
        )
        onModerated?.()
      } catch (err) {
        setActionError(moderationError(err, 'That moderation action failed'))
      } finally {
        uiDispatch({ type: 'moderation/pending', id: comment.id, pending: false })
      }
    },
    [client, onModerated],
  )

  const handleBlockUser = useCallback(
    async (comment: Comment, blocked: boolean) => {
      if (!comment.userId) return
      uiDispatch({ type: 'moderation/pending', id: comment.id, pending: true })
      setActionError(null)
      try {
        await client.setUserBlocked({ userId: comment.userId, blocked })
        setComments((prev) => prev.map((c) => (c.userId === comment.userId ? { ...c, userBlocked: blocked } : c)))
        onModerated?.()
      } catch (err) {
        setActionError(moderationError(err, 'That moderation action failed'))
      } finally {
        uiDispatch({ type: 'moderation/pending', id: comment.id, pending: false })
      }
    },
    [client, onModerated],
  )

  async function handleToggleLock() {
    if (!pageLock) return
    uiDispatch({ type: 'lock/set', pending: true })
    setActionError(null)
    try {
      const next = await client.setPageLocked({ pageId: pageLock.pageId, locked: !pageLock.locked })
      setPageLock({ pageId: next.id, locked: next.isLocked })
      onModerated?.()
    } catch (err) {
      setActionError(moderationError(err, 'That moderation action failed'))
    } finally {
      uiDispatch({ type: 'lock/set', pending: false })
    }
  }

  const closeReply = useCallback(() => setReplyTo(null), [])

  const itemActions = useItemActions({
    vote: handleVote,
    clear: handleClear,
    edit: handleEdit,
    remove: handleDelete,
    replySubmit: handleReplySubmit,
    closeReply,
    moderate: handleModerate,
    blockUser: handleBlockUser,
  })

  // Guest edit keys live in localStorage (absent during SSR, so the helper
  // degrades to null). At hydration `comments` is empty on both sides, so the
  // map is derived from the same input; later rows arrive client-side only.
  const guestEditKeys = useMemo(
    () => Object.fromEntries(comments.map((comment) => [comment.id, getEditKey(comment.id) !== null])),
    [comments],
  )

  const tree = useMemo(() => buildCommentTree(comments), [comments])
  // Overlay before sorting: `best` must re-rank on a vote.
  const patchedTree = useMemo(() => applyVoteOverlay(tree, votePatch), [tree, votePatch])
  const roots: ThreadNode[] = useMemo(() => sortCommentRoots(patchedTree, sort), [patchedTree, sort])
  // Deleting the last thread of a page empties its window, so fall back to the
  // last page that still has roots instead of rendering nothing (never refetches).
  const currentPage = Math.min(page, Math.max(1, Math.ceil(roots.length / limit)))
  // A reply created after the stream moved past its thread's page is not
  // included until more rows load: the list endpoint has no per-thread query.
  const pageRoots = roots.slice((currentPage - 1) * limit, currentPage * limit)

  const loadNextModeration = useCallback(
    async (offset: number): Promise<{ rows: Comment[]; hasMore: boolean } | null> => {
      setLoadingPage(true)
      try {
        const next = await client.listModeration({ pageId: moderationPageId ?? undefined, limit, offset })
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
    },
    [client, limit, moderationPageId],
  )

  const goNext = useCallback(async () => {
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
  }, [comments, currentPage, fetchImpl, hasMore, limit, loadNextModeration, moderator, site, baseUrl, url])

  const goPrev = useCallback(() => setPage(currentPage - 1), [currentPage])
  const goNextClick = useCallback(() => void goNext(), [goNext])

  function handleSortChange(next: ThreadSort) {
    setSort(next)
    // Window boundaries follow the new order, so start from its first page.
    setPage(1)
  }

  const signInHref = safeUrl(signInUrl)
  // Every error block offers the same sign-in route: the host hook, then the
  // host link, else the API's own OAuth start.
  const signInProps = onSignInClick
    ? { onSignIn: onSignInClick }
    : signInHref
      ? { signInHref }
      : { onSignIn: () => void handleSignIn() }

  // Shared by the head composer and every inline reply: one identity control,
  // never duplicated markup. Moderators get the same control so they can post
  // as themselves or anonymously, like any signed-in viewer.
  const identity = (
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
  )

  return (
    <WidgetRootContext value={rootRef}>
      <TurnstileConfigContext value={turnstileConfig}>
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
            key={formEpoch}
            siteKey={turnstileSiteKey}
            guest={guest}
            parentId={null}
            pending={posting}
            error={formError}
            {...signInProps}
            identityPending={sessionStatus === 'loading'}
            identity={identity}
            bodyLimit={bodyLimit}
            onSubmit={handleSubmit}
          />
          {status !== 'error' && roots.length > 0 && <ThreadSortToggle value={sort} onChange={handleSortChange} />}
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
            <section ref={listRef} aria-label="Comments" className="lc-thread-guides relative grid grid-cols-1 gap-3">
              {/* New window or a new render order (votes re-rank under `best`) remounts to re-measure. */}
              <ThreadGuides key={`${currentPage}:${sort}:${threadSignature(pageRoots)}`} listRef={listRef} />
              {pageRoots.map((node) => (
                <CommentItem
                  key={node.comment.id}
                  node={node}
                  depth={0}
                  pendingVotes={pendingVotes}
                  replyTo={replyTo}
                  viewerUserId={viewerUserId ?? session?.userId}
                  viewerRole={viewerRole}
                  // Voting is only possible on visible comments of an unlocked page.
                  hideVotes={moderator && (node.comment.status !== 'visible' || Boolean(pageLock?.locked))}
                  pendingModeration={pendingModeration}
                  anonWindowMinutes={anonEditWindowMinutes}
                  hasEditKey={guestEditKeys[node.comment.id] ?? false}
                  actionMode={actionMode}
                  bodyLimit={bodyLimit}
                  onVote={itemActions.onVote}
                  onClear={itemActions.onClear}
                  onReply={setReplyTo}
                  onEdit={itemActions.onEdit}
                  onDelete={itemActions.onDelete}
                  onReplySubmit={itemActions.onReplySubmit}
                  replySiteKey={turnstileSiteKey}
                  replyGuest={guest}
                  replyIdentity={identity}
                  onCloseReply={itemActions.onCloseReply}
                  onModerate={itemActions.onModerate}
                  onBlockUser={itemActions.onBlockUser}
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
        </div>
      </TurnstileConfigContext>
    </WidgetRootContext>
  )
}
