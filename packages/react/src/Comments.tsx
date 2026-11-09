import {
  ApiError,
  beginOAuthSignIn,
  buildCommentTree,
  type Comment,
  type CommentSettings,
  canModerate,
  createClient,
  describeError,
  type ErrorInfo,
  fetchCommentSettings,
  fetchViewerSession,
  forgetEditKey,
  gateFor,
  getEditKey,
  isCompleteSettings,
  loadModerationWindow,
  loadThreadWindow,
  type ModerationAction,
  postFailure,
  type ReactionSummary,
  reactionFailure,
  resolveModerationThread,
  resolveSettings,
  safeUrl,
  saveEditKey,
  signInRequired,
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
import { PageReactions, type ReactionMode } from './Reactions'
import { SignInPrompt } from './SignInPrompt'
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
  // Keyed by comment id, and by PAGE_REACTIONS_KEY for the page bar.
  pendingReactions: Record<string, boolean>
  pendingModeration: Record<string, boolean>
  signInError: ErrorInfo | null
}

export type UiAction =
  | { type: 'posting/set'; posting: boolean }
  | { type: 'lock/set'; pending: boolean }
  | { type: 'signing-in/set'; value: boolean }
  | { type: 'signing-out/set'; value: boolean }
  | { type: 'votes/pending'; id: string; pending: boolean }
  | { type: 'reactions/pending'; id: string; pending: boolean }
  | { type: 'moderation/pending'; id: string; pending: boolean }
  | { type: 'sign-in-error/set'; error: ErrorInfo | null }

export const UI_INITIAL: UiState = {
  posting: false,
  lockPending: false,
  signingIn: false,
  signingOut: false,
  pendingVotes: {},
  pendingReactions: {},
  pendingModeration: {},
  signInError: null,
}

const PAGE_REACTIONS_KEY = 'page'

// What a vote or a reaction changes on one row. Both write the same overlay, so one tree pass applies both.
type CommentPatch = Partial<Pick<Comment, 'score' | 'viewerVote' | 'reactions'>>
type CommentOverlay = Record<string, CommentPatch>
const EMPTY_OVERLAY: CommentOverlay = {}

// Votes and reactions change one row, so they must not rebuild every tree node: clone only
// the paths whose row changed (an untouched subtree keeps its identity).
function applyCommentOverlay(nodes: ThreadNode[], overlay: CommentOverlay): ThreadNode[] {
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
    case 'reactions/pending':
      return { ...state, pendingReactions: { ...state.pendingReactions, [action.id]: action.pending } }
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

/**
 * Drop-in comment thread: list, composer, replies, votes, paging and inline
 * moderation. A `private` site renders one sign-in card instead of the thread,
 * and a locked page blocks posting.
 *
 * Import `@lst97-oss/last-comments-widgets/react/styles.css` once, and proxy
 * `/api/*` same-origin (see {@link CommentsProps}).
 */
export function Comments({
  site,
  baseUrl,
  pageUrl,
  pageId,
  onModerated,
  turnstileSiteKey: turnstileKeyProp,
  turnstileOptions,
  limit = 20,
  theme = 'system',
  themeVars,
  signInUrl,
  onSignInClick,
  viewerUserId,
  viewerRole,
  anonEditWindowMinutes: anonEditWindowProp,
  actionMode = 'icon-text',
  bodyLimit: bodyLimitProp,
  lazy = false,
  math = false,
  mermaid = false,
  codeHighlight = true,
  fetchImpl,
  settings,
}: CommentsProps) {
  const dark = useTheme(theme)
  // Widget-wide Turnstile settings for the head and reply composers; the object
  // identity is memoized so consumers only re-render when it really changes.
  const turnstileConfig = useMemo(() => ({ dark, options: turnstileOptions }), [dark, turnstileOptions])
  const moderator = canModerate(viewerRole)
  const [session, setSession] = useState<ViewerSession | null>(null)
  const [commentAs, setCommentAs] = useState<'account' | 'anonymous'>('account')
  const signedIn = Boolean(session) || Boolean(viewerUserId)
  // The site's policy. A complete `settings` object is used as given; otherwise the public settings
  // endpoint is read once per site. Explicit props still win over both.
  const [fetchedSettings, setFetchedSettings] = useState<CommentSettings | null>(null)
  const [settingsSettled, setSettingsSettled] = useState(false)
  const settingsComplete = isCompleteSettings(settings)
  useEffect(() => {
    if (settingsComplete) return
    let active = true
    void fetchCommentSettings({ baseUrl, site, fetchImpl }).then((value) => {
      if (!active) return
      setFetchedSettings(value)
      setSettingsSettled(true)
    })
    return () => {
      active = false
    }
  }, [baseUrl, site, fetchImpl, settingsComplete])
  const policy = useMemo(
    () =>
      resolveSettings(
        { bodyLimit: bodyLimitProp, anonEditWindowMinutes: anonEditWindowProp, turnstileSiteKey: turnstileKeyProp },
        settings,
        fetchedSettings,
      ),
    [bodyLimitProp, anonEditWindowProp, turnstileKeyProp, settings, fetchedSettings],
  )
  const settingsReady = settingsComplete || settingsSettled
  const bodyLimit = policy.bodyLimit
  const anonEditWindowMinutes = policy.anonEditWindowMinutes
  const turnstileSiteKey = policy.turnstileSiteKey ?? undefined
  const client = useMemo(() => createClient({ baseUrl, site, fetchImpl }), [baseUrl, site, fetchImpl])
  const url = useMemo(() => pageUrl ?? (typeof window !== 'undefined' ? window.location.href : ''), [pageUrl])
  const [comments, setComments] = useState<Comment[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [sessionStatus, setSessionStatus] = useState<'loading' | 'ready'>('loading')
  const guest = !signedIn || (commentAs === 'anonymous' && policy.access === 'open')
  // A visitor is only asked to sign in once the identity probe has settled, so a signed-in
  // reader on a locked site never sees the sign-in block by mistake.
  const identityPending = sessionStatus === 'loading' && policy.access !== 'open'
  const gateSignedIn = signedIn || moderator
  const readGate = gateFor(policy.access, 'read', gateSignedIn)
  const writeAllowed = gateFor(policy.access, 'write', gateSignedIn) === 'allow'
  const showComposer = !settingsReady || identityPending || writeAllowed
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<ThreadSort>('newest')
  const [listError, setListError] = useState<ErrorInfo | null>(null)
  // A gated read, or one the API refused as unauthenticated, shows the sign-in
  // card: derived during render so no effect adjusts state for it.
  const readPrompt =
    readGate === 'sign-in'
      ? signInRequired('read')
      : status === 'error' && listError?.action === 'sign-in'
        ? listError
        : null
  const [hasMore, setHasMore] = useState(false)
  const [loadingPage, setLoadingPage] = useState(false)
  const [ui, uiDispatch] = useReducer(uiReducer, UI_INITIAL)
  const {
    posting,
    lockPending,
    signingIn,
    signingOut,
    pendingVotes,
    pendingReactions,
    pendingModeration,
    signInError,
  } = ui
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
        // The page is found in the site's page list (an unlisted URL throws PAGE_NOT_LISTED, shown below),
        // then its thread is read with hidden and deleted rows.
        const thread = await resolveModerationThread({ client, url, pageId })
        if (seq !== loadSeq.current) return
        setPageLock(thread.pageLock)
        setModerationPageId(thread.threadPageId)
        const window = await loadModerationWindow({ client, pageId: thread.threadPageId, limit, pages: 1 })
        if (seq !== loadSeq.current) return
        setComments(window.comments)
        setHasMore(window.hasMore)
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
    // A gated read renders from `readGate` itself, so no state is adjusted
    // here: only an allowed read fetches.
    if (!inView || !settingsReady || identityPending || readGate !== 'allow') return
    void load()
  }, [load, inView, settingsReady, identityPending, readGate])

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

  // Votes and reactions live beside the fetched rows. A reload fetches authoritative values, so
  // its epoch bump drops stale patches; posts and edits keep them.
  const [overlay, setOverlay] = useState<{ epoch: number; patch: CommentOverlay }>({
    epoch: 0,
    patch: EMPTY_OVERLAY,
  })
  const overlayPatch = overlay.epoch === loadEpoch ? overlay.patch : EMPTY_OVERLAY
  const patchComment = useCallback(
    (id: string, changes: CommentPatch) => {
      setOverlay((prev) => {
        const base = prev.epoch === loadEpoch ? prev.patch : EMPTY_OVERLAY
        return { epoch: loadEpoch, patch: { ...base, [id]: { ...base[id], ...changes } } }
      })
    },
    [loadEpoch],
  )

  const handleVote = useCallback(
    async (comment: Comment, value: VoteValue) => {
      // Votes need a signed-in session: a guest is told so, rather than sent a request that is refused.
      if (!gateSignedIn) {
        setActionError(signInRequired('vote'))
        return
      }
      uiDispatch({ type: 'votes/pending', id: comment.id, pending: true })
      setActionError(null)
      try {
        // Moderators vote through the moderation endpoint: the public vote route
        // checks the site's origin allow-list, which a dashboard origin is not on.
        const vote = moderator
          ? await client.setModerationVote({ commentId: comment.id, value })
          : await client.castVote(comment.id, value)
        patchComment(comment.id, { score: vote.score, viewerVote: vote.viewerVote })
      } catch (err) {
        setActionError(describeError(err, { title: "Your vote wasn't saved" }))
      } finally {
        uiDispatch({ type: 'votes/pending', id: comment.id, pending: false })
      }
    },
    [patchComment, client, gateSignedIn, moderator],
  )

  const handleClear = useCallback(
    async (comment: Comment) => {
      if (!gateSignedIn) {
        setActionError(signInRequired('vote'))
        return
      }
      uiDispatch({ type: 'votes/pending', id: comment.id, pending: true })
      setActionError(null)
      try {
        const vote = moderator
          ? await client.setModerationVote({ commentId: comment.id, value: null })
          : await client.clearVote(comment.id)
        patchComment(comment.id, { score: vote.score, viewerVote: vote.viewerVote })
      } catch (err) {
        // keep existing vote state on failure
        setActionError(describeError(err, { title: "Your vote wasn't saved" }))
      } finally {
        uiDispatch({ type: 'votes/pending', id: comment.id, pending: false })
      }
    },
    [patchComment, client, gateSignedIn, moderator],
  )

  // The page bar's counts, read with the thread and replaced by each reaction's answer.
  const [pageReactions, setPageReactions] = useState<ReactionSummary[]>([])

  // Every reaction goes through one path: the sign-in gate, the pending flag and the failure copy.
  const runReaction = useCallback(
    async (pendingId: string, write: () => Promise<void>) => {
      if (!gateSignedIn) {
        setActionError(signInRequired('react'))
        return
      }
      uiDispatch({ type: 'reactions/pending', id: pendingId, pending: true })
      setActionError(null)
      try {
        await write()
      } catch (err) {
        setActionError(reactionFailure(err))
      } finally {
        uiDispatch({ type: 'reactions/pending', id: pendingId, pending: false })
      }
    },
    [gateSignedIn],
  )

  // The server answers a comment's reaction with the comment's counts, which replace the row's.
  const handleReact = useCallback(
    (comment: Comment, emoji: string, viewerReacted: boolean) =>
      runReaction(comment.id, async () => {
        const reactions = viewerReacted
          ? await client.clearReaction(comment.id, emoji)
          : await client.castReaction(comment.id, emoji)
        patchComment(comment.id, { reactions })
      }),
    [client, patchComment, runReaction],
  )

  // Counts of finished page presses. A page read that started before one is older than it, so it is dropped.
  const pageWrites = useRef(0)
  const handlePageReact = useCallback(
    (emoji: string, viewerReacted: boolean) =>
      runReaction(PAGE_REACTIONS_KEY, async () => {
        const reactions = viewerReacted
          ? await client.clearPageReaction({ url }, emoji)
          : await client.castPageReaction({ url }, emoji)
        pageWrites.current += 1
        setPageReactions(reactions)
      }),
    [client, runReaction, url],
  )

  // The page bar's counts come with the page. The session cookie rides on the read, so a signed-in
  // viewer's own reactions come back with them.
  const pageReactionsOn = policy.features.pageReactions.length > 0
  useEffect(() => {
    if (!pageReactionsOn) return
    let active = true
    const writesAtStart = pageWrites.current
    // A press that finished while this read was on the wire is newer than the read.
    const current = () => active && pageWrites.current === writesAtStart
    client.listPageReactions({ url }).then(
      (next) => {
        if (current()) setPageReactions(next)
      },
      () => {
        if (current()) setPageReactions([])
      },
    )
    return () => {
      active = false
    }
  }, [client, url, pageReactionsOn])

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

  // A post joins the list at its end only when the list holds the whole stream. With more pages to come,
  // the next page's offset would count a row the server never sent, so the first page reloads instead.
  const showPosted = useCallback(
    async (created: Comment) => {
      if (hasMore) await load()
      else setComments((prev) => [...prev, created])
    },
    [hasMore, load],
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
      await showPosted(created)
      setPage(1)
      setReplyTo(null)
      setFormEpoch((epoch) => epoch + 1)
      if (status !== 'ready') setStatus('ready')
      if (moderator) onModerated?.()
      return true
    } catch (err) {
      setFormError(postFailure(err, postTitle))
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
        await showPosted(created)
        setPage(1)
        setReplyTo(null)
        if (status !== 'ready') setStatus('ready')
        if (moderator) onModerated?.()
        return null
      } catch (err) {
        return postFailure(err, "Your reply wasn't posted")
      }
    },
    [moderator, onModerated, postOne, showPosted, status],
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
              ? {
                  ...c,
                  ...updated,
                  score: updated.score ?? c.score,
                  viewerVote: updated.viewerVote ?? c.viewerVote,
                  // An edit's answer carries no reaction counts, so the row keeps the ones it has.
                  reactions: c.reactions,
                }
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
        // A guest proves ownership with the edit key kept in this browser; a signed-in author sends none.
        const editKey = getEditKey(commentId)
        await client.deleteOwnComment(commentId, editKey ?? undefined)
        forgetEditKey(commentId)
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
    react: handleReact,
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
  const patchedTree = useMemo(() => applyCommentOverlay(tree, overlayPatch), [tree, overlayPatch])
  const roots: ThreadNode[] = useMemo(() => sortCommentRoots(patchedTree, sort), [patchedTree, sort])
  // Deleting the last thread of a page empties its window, so fall back to the
  // last page that still has roots instead of rendering nothing (never refetches).
  const currentPage = Math.min(page, Math.max(1, Math.ceil(roots.length / limit)))
  // A reply created after the stream moved past its thread's page is not
  // included until more rows load: the list endpoint has no per-thread query.
  const pageRoots = roots.slice((currentPage - 1) * limit, currentPage * limit)

  const goNext = useCallback(async () => {
    const target = currentPage + 1
    // A moderator page with no thread has nothing to load.
    if (moderator && !moderationPageId) return
    setLoadingPage(true)
    try {
      // A page is a window over roots, so the destination window is filled before it is shown.
      const window =
        moderator && moderationPageId
          ? await loadModerationWindow({ client, pageId: moderationPageId, limit, pages: target, existing: comments })
          : await loadThreadWindow({ site, baseUrl, pageUrl: url, limit, fetchImpl, pages: target, existing: comments })
      setComments(window.comments)
      setHasMore(window.hasMore)
      setPage(target)
    } catch (err) {
      setListError(
        moderator
          ? moderationError(err, 'Failed to load more comments')
          : describeError(err, { title: 'Failed to load more comments' }),
      )
      setStatus('error')
    } finally {
      setLoadingPage(false)
    }
  }, [client, comments, currentPage, fetchImpl, limit, moderationPageId, moderator, site, baseUrl, url])

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
            {policy.access === 'open' && (
              <DropdownMenuRadioItem value="anonymous" closeOnClick>
                Anonymous
              </DropdownMenuRadioItem>
            )}
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

  // The site's switches decide whether reactions show. A moderator sees the counts and cannot react.
  const pageReactionMode: ReactionMode = pageReactionsOn ? (moderator ? 'counts' : 'interactive') : 'off'
  const commentReactionMode: ReactionMode =
    policy.features.commentReactions.length === 0 ? 'off' : moderator ? 'counts' : 'interactive'
  const reactionsLocked = Boolean(pageLock?.locked)

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
          {actionError?.action === 'sign-in' ? (
            <SignInPrompt info={actionError} context="vote" {...signInProps} />
          ) : (
            actionError && <CommentError info={actionError} onRetry={() => void load()} {...signInProps} />
          )}
          {readGate === 'sign-in' ? null : showComposer ? (
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
              math={math}
              mermaid={mermaid}
              codeHighlight={codeHighlight}
              onSubmit={handleSubmit}
            />
          ) : (
            <SignInPrompt info={signInRequired('write')} context="write" {...signInProps} />
          )}
          {readPrompt ? (
            <SignInPrompt info={readPrompt} context="read" {...signInProps} />
          ) : (
            <>
              <PageReactions
                mode={pageReactionMode}
                allowed={policy.features.pageReactions}
                reactions={pageReactions}
                disabled={(pendingReactions[PAGE_REACTIONS_KEY] ?? false) || reactionsLocked}
                onReact={handlePageReact}
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
                <section
                  ref={listRef}
                  aria-label="Comments"
                  className="lc-thread-guides relative grid grid-cols-1 gap-3"
                >
                  {/* New window or a new render order (votes re-rank under `best`) remounts to re-measure. */}
                  <ThreadGuides key={`${currentPage}:${sort}:${threadSignature(pageRoots)}`} listRef={listRef} />
                  {pageRoots.map((node) => (
                    <CommentItem
                      key={node.comment.id}
                      node={node}
                      depth={0}
                      pendingVotes={pendingVotes}
                      reactionMode={commentReactionMode}
                      reactionEmoji={policy.features.commentReactions}
                      pendingReactions={pendingReactions}
                      reactionsLocked={reactionsLocked}
                      onReact={itemActions.onReact}
                      replyTo={replyTo}
                      viewerUserId={viewerUserId ?? session?.userId}
                      viewerRole={viewerRole}
                      writeAllowed={writeAllowed}
                      signInProps={signInProps}
                      // Voting is only possible on visible comments of an unlocked page.
                      hideVotes={
                        !policy.features.votes ||
                        (moderator && (node.comment.status !== 'visible' || Boolean(pageLock?.locked)))
                      }
                      pendingModeration={pendingModeration}
                      anonWindowMinutes={anonEditWindowMinutes}
                      hasEditKey={guestEditKeys[node.comment.id] ?? false}
                      actionMode={actionMode}
                      bodyLimit={bodyLimit}
                      math={math}
                      mermaid={mermaid}
                      codeHighlight={codeHighlight}
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
        </div>
      </TurnstileConfigContext>
    </WidgetRootContext>
  )
}
