// Framework-agnostic client for the last-comments public API.
// Contracts mirror last-comments src/routes/api.comments.ts +
// src/routes/api.comments.vote.ts + src/routes/api.comments.$commentId.ts +
// src/routes/api.moderation.ts exactly.
import { Marked } from 'marked'

export type CommentStatus = 'visible' | 'hidden' | 'deleted'
export type VoteValue = -1 | 1

export type Comment = {
  id: string
  pageId: string
  parentId: string | null
  userId: string | null
  authorName: string
  avatarUrl?: string | null
  bodyMarkdown: string
  status: CommentStatus
  pinnedAt: string | null
  createdAt: string
  editedAt: string | null
  score: number
  viewerVote: VoteValue | null
  // Site role of the author when the server resolved one; null for guests and
  // signed-in users without a membership on this site.
  authorRole: ViewerRole | null
  // Returned once by POST /api/comments for guest authors; list endpoints omit it.
  editKey?: string
  // Present only on moderation-sourced comments (GET /api/moderation); the public endpoints never send it.
  userBlocked?: boolean
}

export type VoteSummary = { score: number; viewerVote: VoteValue | null }

export type ThreadNode = { comment: Comment; children: ThreadNode[] }

// Viewer role for the site, mirroring the server's site_role enum. The
// server authorizes every moderation call; the value only gates UI.
export type ViewerRole = 'admin' | 'moderator'

// Mirrors the server moderation action enum (routes/api.moderation.ts).
export type ModerationAction = 'hide' | 'restore' | 'delete' | 'pin' | 'unpin'

// Wire shape of the server's ModerationComment (GET /api/moderation).
// Dates arrive as ISO strings; moderation rows carry no score, viewer
// vote, edit time or avatar.
export type ModerationComment = {
  id: string
  pageId: string
  parentId: string | null
  userId: string | null
  authorName: string
  bodyMarkdown: string
  status: CommentStatus
  pinnedAt: string | null
  createdAt: string
  pageUrl: string
  pageLocked: boolean
  userBlocked: boolean
  // Vote state for the requesting moderator.
  score: number
  viewerVote: VoteValue | null
  // Site role of the author, mirroring the public comment wire field.
  authorRole: ViewerRole | null
}

// Wire shape of the server's ModerationPageSummary.
export type ModerationPage = {
  id: string
  canonicalUrl: string
  pageKey: string | null
  title: string | null
  isLocked: boolean
  total: number
  visible: number
  hidden: number
  latestAt: string | null
}

export type ModerationSite = { id: string; key: string; name: string; role: ViewerRole; origins: string[] }

// GET /api/moderation with a site. The route sends no CORS headers and
// requires a same-origin session with the instance-admin role.
export type ModerationOverview = {
  sites: ModerationSite[]
  pages: ModerationPage[]
  comments: ModerationComment[]
  total: number
  isInstanceAdmin: boolean
}

// Fields the UI needs from a moderation mutation; the POST routes return
// full rows but the widget only patches these.
export type ModerationCommentPatch = { id: string; status: CommentStatus; pinnedAt: string | null }

export type ModerationPageState = { id: string; canonicalUrl: string; isLocked: boolean }

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'MALFORMED_JSON'
  | 'UNAUTHENTICATED'
  | 'ORIGIN_NOT_ALLOWED'
  | 'SITE_NOT_FOUND'
  | 'USER_BLOCKED'
  | 'PAGE_LOCKED'
  | 'PARENT_NOT_FOUND'
  | 'COMMENT_NOT_FOUND'
  | 'COMMENT_VERIFICATION_FAILED'
  | 'COMMENT_VERIFICATION_UNAVAILABLE'
  | 'SIGN_IN_UNAVAILABLE'
  | 'SIGN_OUT_FAILED'
  | 'FORBIDDEN'
  | 'EDIT_WINDOW_EXPIRED'

export class ApiError extends Error {
  code: ApiErrorCode | string
  status: number
  constructor(code: ApiErrorCode | string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export type ClientOptions = {
  baseUrl: string
  site: string
  fetchImpl?: typeof fetch
}

export type ListOptions = { url: string; limit?: number; offset?: number }
export type PostInput = {
  url: string
  bodyMarkdown: string
  title?: string
  parentId?: string
  authorName?: string
  verificationToken?: string
  // Post as a guest even when a session cookie exists: the request omits
  // credentials so the API attributes the comment to authorName instead.
  anonymous?: boolean
}

export type EditInput = { commentId: string; bodyMarkdown: string; editKey?: string }

export type ListModerationInput = { pageId?: string; limit?: number; offset?: number }
export type ModerateCommentInput = { commentId: string; action: ModerationAction }
// Moderator composer input: the thread is addressed by page id, and the
// session (not an origin allow-list or Turnstile) is the verification.
export type CreateModerationCommentInput = {
  pageId: string
  bodyMarkdown: string
  parentId?: string
  // Moderators may post anonymously from the dashboard; the server then stores
  // a guest row (userId null) and returns a guest edit key.
  anonymous?: boolean
  authorName?: string
}
export type EditModerationCommentInput = { commentId: string; bodyMarkdown: string }
// `value: null` clears the moderator's vote (a second click on the same arrow).
export type ModerationVoteInput = { commentId: string; value: VoteValue | null }

// Mirrors server normalizePageUrl (domain/comment.ts): absolute http(s),
// no userinfo, hash stripped, host lowercased.
export function normalizePageUrl(raw: string): string {
  const parsed = new URL(raw)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('page URL must be http(s)')
  if (parsed.username || parsed.password) throw new Error('page URL must not contain credentials')
  parsed.hash = ''
  parsed.hostname = parsed.hostname.toLowerCase()
  return parsed.toString()
}

// Absolute http(s) URL or a relative path; scheme smuggling (javascript:,
// data:, vbscript:, control-char prefixes) is rejected. Used for comment
// avatars and sign-in links, which must never run code on click.
export function safeUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  try {
    const parsed = new URL(raw, 'https://relative.invalid')
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? raw : undefined
  } catch {
    return undefined
  }
}

async function readEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { data?: T; error?: { code: string; message: string } }
  if (!res.ok || !('data' in json) || json.data === undefined) {
    const code = json.error?.code ?? 'VALIDATION_ERROR'
    throw new ApiError(code, json.error?.message ?? `request failed with ${res.status}`, res.status)
  }
  return json.data
}

export type WidgetSignInOptions = {
  baseUrl: string
  pageUrl: string
  provider?: string
  fetchImpl?: typeof fetch
}

// Starts the server-side OAuth flow (better-auth POST /api/auth/sign-in/social)
// and returns the provider URL the browser must navigate to. Callers fall back
// to their own sign-in page instead when the host passes `signInUrl`.
export async function beginOAuthSignIn(options: WidgetSignInOptions): Promise<string> {
  const base = options.baseUrl.replace(/\/$/, '')
  const res = await (options.fetchImpl ?? fetch)(`${base}/api/auth/sign-in/social`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: options.provider ?? 'google', callbackURL: options.pageUrl }),
  })
  const json = (await res.json().catch(() => ({}))) as { url?: string; message?: string }
  if (!res.ok || !json.url) {
    throw new ApiError('SIGN_IN_UNAVAILABLE', json.message ?? `sign-in is unavailable (${res.status})`, res.status)
  }
  return json.url
}

export type ViewerSession = { userId: string; name: string; image: string | null }

// Reads the page's session from the API (better-auth GET /api/auth/get-session)
// so the composer can show who is signed in and offer to switch identity.
// Returns null for guests, for APIs that cannot answer (no CORS, no proxy)
// and for unexpected payloads — callers then fall back to host-provided props.
export async function fetchViewerSession(options: {
  baseUrl: string
  fetchImpl?: typeof fetch
}): Promise<ViewerSession | null> {
  const base = options.baseUrl.replace(/\/$/, '')
  try {
    const res = await (options.fetchImpl ?? fetch)(`${base}/api/auth/get-session`, { credentials: 'include' })
    if (!res.ok) return null
    const json = (await res.json()) as { user?: { id?: string; name?: string; image?: string | null } } | null
    const user = json?.user
    if (!user?.id) return null
    return { userId: user.id, name: user.name ?? '', image: user.image ?? null }
  } catch {
    return null
  }
}

// Ends the API session (better-auth POST /api/auth/sign-out).
export async function signOutViewerSession(options: { baseUrl: string; fetchImpl?: typeof fetch }): Promise<void> {
  const base = options.baseUrl.replace(/\/$/, '')
  const res = await (options.fetchImpl ?? fetch)(`${base}/api/auth/sign-out`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new ApiError('SIGN_OUT_FAILED', `sign-out failed (${res.status})`, res.status)
}

export type LastCommentsClient = {
  listComments: (list: ListOptions) => Promise<Comment[]>
  postComment: (input: PostInput) => Promise<Comment>
  castVote: (commentId: string, value: VoteValue) => Promise<VoteSummary>
  clearVote: (commentId: string) => Promise<VoteSummary>
  editOwnComment: (input: EditInput) => Promise<Comment>
  deleteOwnComment: (commentId: string) => Promise<Comment>
  listModeration: (input: ListModerationInput) => Promise<ModerationOverview>
  createModerationComment: (input: CreateModerationCommentInput) => Promise<Comment>
  editModerationComment: (input: EditModerationCommentInput) => Promise<Comment>
  setModerationVote: (input: ModerationVoteInput) => Promise<VoteSummary>
  moderateComment: (input: ModerateCommentInput) => Promise<ModerationCommentPatch>
  setPageLocked: (input: { pageId: string; locked: boolean }) => Promise<ModerationPageState>
  setUserBlocked: (input: { userId: string; blocked: boolean }) => Promise<{ userId: string; blocked: boolean }>
}

export function createClient(options: ClientOptions): LastCommentsClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const base = options.baseUrl.replace(/\/$/, '')
  const site = options.site
  const jsonHeaders = { 'content-type': 'application/json' }

  async function listComments(list: ListOptions): Promise<Comment[]> {
    const url = normalizePageUrl(list.url)
    const params = new URLSearchParams({ site, url })
    if (list.limit !== undefined) params.set('limit', String(list.limit))
    if (list.offset !== undefined) params.set('offset', String(list.offset))
    const res = await fetchImpl(`${base}/api/comments?${params}`, { credentials: 'include' })
    const data = await readEnvelope<{ comments: Comment[] }>(res)
    return data.comments
  }

  async function postComment(input: PostInput): Promise<Comment> {
    const res = await fetchImpl(`${base}/api/comments`, {
      method: 'POST',
      credentials: input.anonymous ? 'omit' : 'include',
      headers: jsonHeaders,
      body: JSON.stringify({
        site,
        url: normalizePageUrl(input.url),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.authorName !== undefined ? { authorName: input.authorName } : {}),
        bodyMarkdown: input.bodyMarkdown,
        ...(input.verificationToken !== undefined ? { verificationToken: input.verificationToken } : {}),
      }),
    })
    const data = await readEnvelope<{ comment: Comment }>(res)
    return data.comment
  }

  async function castVote(commentId: string, value: VoteValue): Promise<VoteSummary> {
    const res = await fetchImpl(`${base}/api/comments/vote`, {
      method: 'PUT',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({ site, commentId, value }),
    })
    const data = await readEnvelope<{ vote: VoteSummary }>(res)
    return data.vote
  }

  async function clearVote(commentId: string): Promise<VoteSummary> {
    const params = new URLSearchParams({ site, commentId })
    const res = await fetchImpl(`${base}/api/comments/vote?${params}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    const data = await readEnvelope<{ vote: VoteSummary }>(res)
    return data.vote
  }

  async function editOwnComment(input: EditInput): Promise<Comment> {
    const res = await fetchImpl(`${base}/api/comments/${input.commentId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({
        site,
        bodyMarkdown: input.bodyMarkdown,
        ...(input.editKey !== undefined ? { editKey: input.editKey } : {}),
      }),
    })
    const data = await readEnvelope<{ comment: Comment }>(res)
    return data.comment
  }

  async function deleteOwnComment(commentId: string): Promise<Comment> {
    const params = new URLSearchParams({ site })
    const res = await fetchImpl(`${base}/api/comments/${commentId}?${params}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    const data = await readEnvelope<{ comment: Comment }>(res)
    return data.comment
  }

  // Moderation is session-only and same-origin: the route sends no CORS
  // headers, requires the instance-admin role, and its POST rejects any
  // request whose Origin is not the server's own.
  async function listModeration(input: ListModerationInput): Promise<ModerationOverview> {
    const params = new URLSearchParams({ site })
    if (input.pageId !== undefined) params.set('pageId', input.pageId)
    if (input.limit !== undefined) params.set('limit', String(input.limit))
    if (input.offset !== undefined) params.set('offset', String(input.offset))
    const res = await fetchImpl(`${base}/api/moderation?${params}`, { credentials: 'include' })
    return readEnvelope<ModerationOverview>(res)
  }

  // Moderator posting: the dashboard composer must reach the moderation
  // endpoint, because the public create path rejects origins the site does not
  // allow (and still asks guests for verification).
  async function createModerationComment(input: CreateModerationCommentInput): Promise<Comment> {
    const res = await fetchImpl(`${base}/api/moderation`, {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({
        site,
        target: 'comment-create',
        pageId: input.pageId,
        ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
        ...(input.anonymous === undefined ? {} : { anonymous: input.anonymous }),
        ...(input.authorName === undefined ? {} : { authorName: input.authorName }),
        bodyMarkdown: input.bodyMarkdown,
      }),
    })
    const data = await readEnvelope<{ comment: Comment }>(res)
    return data.comment
  }

  // Same story as create: a moderator editing their own comment from a
  // dashboard cannot pass the site's origin allow-list.
  async function editModerationComment(input: EditModerationCommentInput): Promise<Comment> {
    const res = await fetchImpl(`${base}/api/moderation`, {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({
        site,
        target: 'comment-edit',
        commentId: input.commentId,
        bodyMarkdown: input.bodyMarkdown,
      }),
    })
    const data = await readEnvelope<{ comment: Comment }>(res)
    return data.comment
  }

  // Voting from a dashboard: the public vote route is origin-gated, so
  // moderator votes ride the same endpoint as the other moderation actions.
  async function setModerationVote(input: ModerationVoteInput): Promise<VoteSummary> {
    const res = await fetchImpl(`${base}/api/moderation`, {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({ site, target: 'vote', commentId: input.commentId, value: input.value }),
    })
    const data = await readEnvelope<{ vote: VoteSummary }>(res)
    return data.vote
  }

  async function moderateComment(input: ModerateCommentInput): Promise<ModerationCommentPatch> {
    const res = await fetchImpl(`${base}/api/moderation`, {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({ site, target: 'comment', commentId: input.commentId, action: input.action }),
    })
    const data = await readEnvelope<{ comment: { id: string; status: CommentStatus; pinnedAt: string | null } }>(res)
    return { id: data.comment.id, status: data.comment.status, pinnedAt: data.comment.pinnedAt }
  }

  async function setPageLocked(input: { pageId: string; locked: boolean }): Promise<ModerationPageState> {
    const res = await fetchImpl(`${base}/api/moderation`, {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({ site, target: 'page', pageId: input.pageId, locked: input.locked }),
    })
    const data = await readEnvelope<{ page: ModerationPageState }>(res)
    return data.page
  }

  async function setUserBlocked(input: {
    userId: string
    blocked: boolean
  }): Promise<{ userId: string; blocked: boolean }> {
    const res = await fetchImpl(`${base}/api/moderation`, {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({ site, target: 'user', userId: input.userId, blocked: input.blocked }),
    })
    return readEnvelope<{ userId: string; blocked: boolean }>(res)
  }

  return {
    listComments,
    postComment,
    castVote,
    clearVote,
    editOwnComment,
    deleteOwnComment,
    listModeration,
    createModerationComment,
    editModerationComment,
    setModerationVote,
    moderateComment,
    setPageLocked,
    setUserBlocked,
  }
}

// Shared DOM-free markdown renderer. Raw HTML is stripped at the token
// level; links/images allow http(s): + mailto: only. Output feeds
// dangerouslySetInnerHTML / v-html / [innerHTML] / innerHTML directly.
function escapeAttr(raw: string): string {
  return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function safeHref(href: string): string | null {
  try {
    const parsed = new URL(href, 'https://invalid.local')
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:')
      return escapeAttr(href)
    return null
  } catch {
    return null
  }
}

const markdown = new Marked({ breaks: true, gfm: true })
markdown.use({
  renderer: {
    html: () => '',
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens)
      const safe = safeHref(href)
      if (!safe) return text
      return `<a href="${safe}"${title ? ` title="${escapeAttr(title)}"` : ''}>${text}</a>`
    },
    image({ href, title, text }) {
      const safe = safeHref(href)
      if (!safe) return escapeAttr(text)
      return `<img src="${safe}" alt="${escapeAttr(text)}"${title ? ` title="${escapeAttr(title)}"` : ''} />`
    },
  },
})

export function renderMarkdown(source: string): string {
  return markdown.parse(source) as string
}

export const DEFAULT_EDIT_WINDOW_MINUTES = 5
export const DEFAULT_ANON_EDIT_WINDOW_MINUTES = 10
// Comment bodies are capped at this many characters (counted before trimming).
// Hosts whose server enforces a different number pass it to the widget.
export const DEFAULT_BODY_LIMIT = 10_000
// Returned by resolveEditWindow for anyone who does not own the comment.
export const EDIT_WINDOW_CLOSED = -1

// Mirror of the server edit windows. Invalid dates fail closed so widgets
// never show an Edit button the server will reject.
// null = unlimited; 0 = unlimited (legacy API); negative = always closed.
export function isEditWindowOpen(
  createdAtIso: string,
  nowMs: number = Date.now(),
  windowMinutes: number | null = DEFAULT_EDIT_WINDOW_MINUTES,
): boolean {
  if (windowMinutes === null || windowMinutes === 0) return true
  if (windowMinutes < 0) return false
  const createdMs = Date.parse(createdAtIso)
  if (Number.isNaN(createdMs)) return false
  return nowMs - createdMs <= windowMinutes * 60_000
}

// Signed-in authors edit any time. Guest-authored comments are owned by
// whoever holds the key issued when they were created, inside the anonymous
// window supplied by the host.
export function resolveEditWindow(input: {
  commentUserId?: string | null
  viewerUserId?: string | null
  anonymousWindowMinutes?: number
  hasEditKey?: boolean
}): number | null {
  const {
    commentUserId,
    viewerUserId,
    anonymousWindowMinutes = DEFAULT_ANON_EDIT_WINDOW_MINUTES,
    hasEditKey = false,
  } = input
  if (commentUserId) return viewerUserId && commentUserId === viewerUserId ? null : EDIT_WINDOW_CLOSED
  return hasEditKey ? anonymousWindowMinutes : EDIT_WINDOW_CLOSED
}

export type ThreadSort = 'newest' | 'oldest' | 'best'

// Pinned rows lead every level; `best` ranks by net score, then newest.
function compareThreadNodes(a: ThreadNode, b: ThreadNode, direction: ThreadSort): number {
  const pinnedA = a.comment.pinnedAt !== null
  const pinnedB = b.comment.pinnedAt !== null
  if (pinnedA !== pinnedB) return pinnedA ? -1 : 1
  if (direction === 'best') {
    const byScore = b.comment.score - a.comment.score
    if (byScore !== 0) return byScore
    const byNewest = Date.parse(b.comment.createdAt) - Date.parse(a.comment.createdAt)
    if (byNewest !== 0) return byNewest
    return a.comment.id < b.comment.id ? -1 : 1
  }
  const sign = direction === 'newest' ? -1 : 1
  const byCreated = (Date.parse(a.comment.createdAt) - Date.parse(b.comment.createdAt)) * sign
  if (byCreated !== 0) return byCreated
  return (a.comment.id < b.comment.id ? -1 : 1) * sign
}

// Every level sorts independently, so a pinned reply tops its own group.
export function sortThreadTree(nodes: ThreadNode[], direction: ThreadSort): ThreadNode[] {
  return [...nodes]
    .sort((a, b) => compareThreadNodes(a, b, direction))
    .map((node) => ({ comment: node.comment, children: sortThreadTree(node.children, direction) }))
}

// Public entry point kept for hosts: sorts the whole tree, not just roots.
export function sortCommentRoots(roots: ThreadNode[], direction: ThreadSort): ThreadNode[] {
  return sortThreadTree(roots, direction)
}

const EDIT_KEY_PREFIX = 'lc.editKey.'

// Guest edit keys live only in this browser. Storage failures (private mode,
// quota) must never break posting, so every access is best-effort.
export function saveEditKey(commentId: string, editKey: string): void {
  try {
    globalThis.localStorage?.setItem(`${EDIT_KEY_PREFIX}${commentId}`, editKey)
  } catch {}
}

export function getEditKey(commentId: string): string | null {
  try {
    return globalThis.localStorage?.getItem(`${EDIT_KEY_PREFIX}${commentId}`) ?? null
  } catch {
    return null
  }
}

export function forgetEditKey(commentId: string): void {
  try {
    globalThis.localStorage?.removeItem(`${EDIT_KEY_PREFIX}${commentId}`)
  } catch {}
}

// UI gate only — the server authorizes every moderation call. An absent
// role means the plain public widget.
export function canModerate(viewerRole?: ViewerRole | null): boolean {
  return viewerRole === 'admin' || viewerRole === 'moderator'
}

// Renders moderation rows through the same list/tree code as public
// comments. Moderation rows carry no score, viewer vote, edit time or
// avatar, so they map to neutral values.
export function moderationCommentToComment(row: ModerationComment): Comment {
  return {
    id: row.id,
    pageId: row.pageId,
    parentId: row.parentId,
    userId: row.userId,
    authorName: row.authorName,
    avatarUrl: null,
    bodyMarkdown: row.bodyMarkdown,
    status: row.status,
    pinnedAt: row.pinnedAt,
    createdAt: row.createdAt,
    editedAt: null,
    score: row.score,
    viewerVote: row.viewerVote,
    authorRole: row.authorRole,
    userBlocked: row.userBlocked,
  }
}
// Per-instance theme overrides. Keys map to the semantic tokens in
// packages/theme/theme.css; values pass through verbatim as CSS.
export const THEME_CSS_VARIABLES = {
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  cardForeground: '--card-foreground',
  popover: '--popover',
  popoverForeground: '--popover-foreground',
  secondary: '--secondary',
  secondaryForeground: '--secondary-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  border: '--border',
  input: '--input',
  ring: '--ring',
  radius: '--radius',
  destructive: '--destructive',
  destructiveForeground: '--destructive-foreground',
  success: '--success',
  successForeground: '--success-foreground',
  successMuted: '--success-muted',
  warning: '--warning',
  warningForeground: '--warning-foreground',
  warningMuted: '--warning-muted',
  error: '--error',
  errorForeground: '--error-foreground',
  errorMuted: '--error-muted',
  info: '--info',
  infoForeground: '--info-foreground',
  infoMuted: '--info-muted',
  cardShadow: '--lc-card-shadow',
  fontFamily: '--lc-font-family',
  fontFamilyMono: '--lc-font-family-mono',
  fontSize: '--lc-font-size',
  lineHeight: '--lc-line-height',
  fontWeightMedium: '--lc-font-weight-medium',
  spacing: '--lc-spacing',
  controlHeight: '--lc-control-height',
  controlRadius: '--lc-control-radius',
  cardPadding: '--lc-card-padding',
  composerPadding: '--lc-composer-padding',
  composerBackground: '--lc-composer-background',
  dropdownShadow: '--lc-dropdown-shadow',
  dialogShadow: '--lc-dialog-shadow',
  backdrop: '--lc-backdrop',
  menuZIndex: '--lc-menu-z-index',
  commentBorder: '--lc-comment-border',
  borderWidth: '--lc-border-width',
  replyBackground: '--lc-reply-background',
  threadActive: '--lc-thread-line',
  threadMuted: '--lc-thread-muted',
  threadIndent: '--lc-thread-indent',
  avatarRing: '--lc-avatar-ring',
  avatarRadius: '--lc-avatar-radius',
  skeletonRadius: '--lc-skeleton-radius',
  voteBackground: '--lc-vote-background',
  voteBorder: '--lc-vote-border',
  voteShadow: '--lc-vote-shadow',
  actionColor: '--lc-action-color',
  actionHoverColor: '--lc-action-hover-color',
  actionHoverBackground: '--lc-action-hover-background',
} as const

export type ThemeVars = Partial<Record<keyof typeof THEME_CSS_VARIABLES, string>>
export type WidgetTheme = { vars?: ThemeVars; dark?: ThemeVars }

// Active-mode style record for the widget root: light `vars` when not
// dark, `dark` merged over `vars` when dark. Inline vars stay scoped to
// one widget instance; unset means the default theme shows through.
export function themeVarsToStyle(theme?: WidgetTheme, dark?: boolean): Record<string, string> {
  const active = dark ? { ...theme?.vars, ...theme?.dark } : theme?.vars
  const style: Record<string, string> = {}
  for (const [key, variable] of Object.entries(THEME_CSS_VARIABLES) as [keyof ThemeVars, string][]) {
    const value = active?.[key]
    if (value !== undefined) style[variable] = value
  }
  return style
}

// Groups the server's flat oldest-first list by parentId. Orphans attach
// to the root so a missing parent never drops a comment.
export function buildCommentTree(flat: Comment[]): ThreadNode[] {
  const byId = new Map<string, ThreadNode>()
  const roots: ThreadNode[] = []
  for (const comment of flat) byId.set(comment.id, { comment, children: [] })
  for (const comment of flat) {
    const node = byId.get(comment.id)
    if (!node) continue
    const parent = comment.parentId ? byId.get(comment.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

export type ReplySummary = { count: number; pinned: number; hidden: number; deleted: number }

// Folded reply group summary: the reply total plus the moderator-only
// breakdown of pinned/hidden/deleted rows. Every status counts, so the
// moderator breakdown adds up to the same total a guest sees.
export function foldReplySummary(children: ThreadNode[]): ReplySummary {
  const totals = { count: 0, pinned: 0, hidden: 0, deleted: 0 }
  const visit = (list: ThreadNode[]) => {
    for (const node of list) {
      totals.count += 1
      if (node.comment.pinnedAt !== null) totals.pinned += 1
      if (node.comment.status === 'hidden') totals.hidden += 1
      if (node.comment.status === 'deleted') totals.deleted += 1
      visit(node.children)
    }
  }
  visit(children)
  return totals
}

// Reddit-style short age: "just now", "5m ago", "3h ago", "2d ago",
// "2mo ago", "1y ago". Future and invalid dates fail safe.
export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.round((nowMs - then) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.round(months / 12)}y ago`
}

export type ThreadParticipant = { key: string; name: string; avatarUrl?: string | null }

// Unique authors across a reply subtree, in first-seen order: guests collapse
// by display name because they carry no id.
export function collectThreadParticipants(nodes: ThreadNode[]): ThreadParticipant[] {
  const participants = new Map<string, ThreadParticipant>()
  const visit = (list: ThreadNode[]) => {
    for (const node of list) {
      const { comment } = node
      const key = comment.userId ?? `guest:${comment.authorName}`
      if (!participants.has(key))
        participants.set(key, { key, name: comment.authorName, avatarUrl: comment.avatarUrl ?? null })
      visit(node.children)
    }
  }
  visit(nodes)
  return [...participants.values()]
}

export type ThreadGuideItem = { x: number; top: number; bottom: number; break?: boolean }

// Fumadocs' TOC guide line, adapted to comment rows: each item runs down its own
// inline-start edge, and consecutive items join through a cubic whose ±4px
// controls bend the line between nesting levels (straight between peers, since
// their x matches). Coordinates are px in the widget list's own space; the
// caller measures them. `break` starts a new subpath, so one thread's line never
// runs across the rows of the next.
export function buildThreadGuidePath(items: ThreadGuideItem[]): { d: string; width: number; height: number } {
  if (items.length === 0) return { d: '', width: 0, height: 0 }
  let d = ''
  let width = 0
  let height = 0
  for (const [index, item] of items.entries()) {
    const x = item.x + 0.5 // half-pixel shift keeps a 2px stroke crisp
    const previous = item.break ? undefined : items[index - 1]
    d += previous
      ? ` C ${previous.x + 0.5} ${item.top - 4} ${x} ${previous.bottom + 4} ${x} ${item.top}`
      : `M ${x} ${item.top}`
    d += ` L ${x} ${item.bottom}`
    width = Math.max(width, x + 2)
    height = Math.max(height, item.bottom)
  }
  return { d, width, height }
}

export type ErrorAction = 'retry' | 'sign-in' | 'none'

// Everything a widget needs to render an error: stable title, human message and
// the action worth offering. Components own the layout, this owns the copy.
export type ErrorInfo = { code: string | null; title: string; message: string; action: ErrorAction }

type ErrorCopy = { title: string; message?: string; action?: ErrorAction; specific?: boolean }
const ERROR_COPY: Record<ApiErrorCode, ErrorCopy> = {
  VALIDATION_ERROR: { title: "That didn't work" },
  MALFORMED_JSON: {
    title: 'The comments service sent an unreadable response',
    message: 'Try again in a moment.',
    action: 'retry',
  },
  UNAUTHENTICATED: {
    title: 'Please sign in',
    message: 'Sign in to do that.',
    action: 'sign-in',
    specific: true,
  },
  ORIGIN_NOT_ALLOWED: {
    title: 'Comments are unavailable on this page',
    message: "This origin is not allowed to call the comments API. Register it in the site's allowed origins.",
    specific: true,
  },
  SITE_NOT_FOUND: {
    title: 'Comments are unavailable',
    message: 'This site key is not registered with the comments service.',
    specific: true,
  },
  USER_BLOCKED: {
    title: "You can't comment here",
    message: 'This account or guest name is blocked from commenting on this site.',
    specific: true,
  },
  PAGE_LOCKED: {
    title: 'Comments are closed on this page',
    message: 'New comments, replies and votes are disabled.',
    specific: true,
  },
  PARENT_NOT_FOUND: {
    title: 'The comment you replied to is gone',
    message: 'Reload the page to see the current thread.',
    action: 'retry',
    specific: true,
  },
  COMMENT_NOT_FOUND: {
    title: 'That comment is gone',
    message: 'It may have been deleted already.',
    specific: true,
  },
  COMMENT_VERIFICATION_FAILED: {
    title: 'Verification failed',
    message: 'Complete the challenge again and post.',
    specific: true,
  },
  COMMENT_VERIFICATION_UNAVAILABLE: {
    title: 'Comment verification is unavailable',
    message: 'This site cannot verify guests right now. Sign in to comment, or try again later.',
    action: 'sign-in',
    specific: true,
  },
  SIGN_IN_UNAVAILABLE: {
    title: "Sign-in didn't start",
    message: 'The comments service could not start the sign-in flow. Try again later.',
    action: 'retry',
    specific: true,
  },
  SIGN_OUT_FAILED: { title: "Sign-out didn't work", message: 'The session could not be ended.', action: 'retry' },
  FORBIDDEN: {
    title: "You don't have permission for that",
    message: 'Your account is not allowed to do that here.',
    specific: true,
  },
  EDIT_WINDOW_EXPIRED: {
    title: 'The edit window has closed',
    message: 'Copy your text if you need it, then reload the page.',
    specific: true,
  },
}

const NETWORK_COPY: ErrorCopy = {
  title: "Couldn't reach the comments service",
  message: 'Check your connection and try again.',
  action: 'retry',
  specific: true,
}
// readEnvelope synthesises this when the API sends no error message.
const SYNTHETIC_MESSAGE = /^request failed with \d+$/

export function describeError(error: unknown, overrides: { title?: string; message?: string } = {}): ErrorInfo {
  const api = error instanceof ApiError ? error : null
  if (!api && error instanceof TypeError) return { code: null, ...copyFor(NETWORK_COPY) }
  const copy = api ? ERROR_COPY[api.code as ApiErrorCode] : undefined
  const serverMessage = (api?.message ?? (error instanceof Error ? error.message : '')).trim()
  const usable = serverMessage && !SYNTHETIC_MESSAGE.test(serverMessage) ? serverMessage : null
  return {
    code: api?.code ?? null,
    title: copy?.specific ? copy.title : (overrides.title ?? copy?.title ?? 'Something went wrong'),
    message: overrides.message ?? usable ?? copy?.message ?? 'Try again in a moment.',
    action: copy?.action ?? (copy === undefined ? 'retry' : 'none'),
  }
}

function copyFor(copy: ErrorCopy): { title: string; message: string; action: ErrorAction } {
  return { title: copy.title, message: copy.message ?? 'Try again in a moment.', action: copy.action ?? 'none' }
}

export type CommentsPageOptions = {
  site: string
  baseUrl: string
  pageUrl?: string
  offset?: number
  limit?: number
  fetchImpl?: typeof fetch
}

export type CommentsPage = { comments: Comment[]; hasMore: boolean }

// One page of the flat comment stream. The list endpoint returns no total, so
// the request asks for one extra row to detect whether another page exists.
// callers that need whole threads (replies can land on any later page) must
// accumulate the pages they have loaded and group the prefix, not the page.
// shortcut: the API caps limit at 100, so a 100-row page cannot be probed;
// it reports hasMore once full, which may cost one empty page at the end.
export async function listCommentsPage(options: CommentsPageOptions): Promise<CommentsPage> {
  const limit = options.limit ?? 20
  const pageUrl = options.pageUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
  const probe = limit >= 100 ? 100 : limit + 1
  const rows = await createClient({
    baseUrl: options.baseUrl,
    site: options.site,
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  }).listComments({ url: pageUrl, limit: probe, offset: options.offset ?? 0 })
  return { comments: rows.slice(0, limit), hasMore: limit >= 100 ? rows.length >= 100 : rows.length > limit }
}

export type ThreadWindowOptions = CommentsPageOptions & {
  // Rows already loaded; the loader continues from there and returns the
  // accumulated set. Pass the current cache.
  existing?: Comment[]
  // Fill at least this many pages of `limit` threads (default 1).
  pages?: number
}

export type ThreadWindow = { comments: Comment[]; hasMore: boolean }

// Loads rows until `pages * limit` WHOLE THREADS are present or the stream ends.
// Rows per request and threads per page differ: replies consume rows, so a
// single page fetch usually yields fewer than `limit` threads. Callers group the
// returned rows with buildCommentTree and slice the thread window they render.
export async function loadThreadWindow(options: ThreadWindowOptions): Promise<ThreadWindow> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100)
  const target = Math.max(options.pages ?? 1, 1) * limit
  const comments = [...(options.existing ?? [])]
  let hasMore = true
  const threads = () => comments.reduce((count, comment) => (comment.parentId === null ? count + 1 : count), 0)
  while (threads() < target && hasMore) {
    const page = await listCommentsPage({ ...options, offset: comments.length, limit })
    if (page.comments.length === 0) {
      hasMore = false
      break
    }
    comments.push(...page.comments)
    hasMore = page.hasMore
  }
  return { comments, hasMore }
}

// Read-only viewer input: same list endpoint, no posting fields.
export type ViewerOptions = {
  site: string
  baseUrl: string
  pageUrl?: string
  limit?: number
  // Defer the first fetch until the widget scrolls into view.
  lazy?: boolean
  theme?: 'light' | 'dark' | 'system'
  themeVars?: WidgetTheme
  fetchImpl?: typeof fetch
}

// Fetches the flat list and groups it for rendering. Empty pageUrl falls
// back to the current location; without one it throws like listComments.
export async function fetchViewerThreads(options: ViewerOptions): Promise<ThreadNode[]> {
  const pageUrl = options.pageUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
  const flat = await createClient({
    baseUrl: options.baseUrl,
    site: options.site,
    fetchImpl: options.fetchImpl,
  }).listComments({
    url: pageUrl,
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
  })
  return buildCommentTree(flat)
}
