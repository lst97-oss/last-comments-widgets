<script setup lang="ts">
/**
 * Root Vue port of the comments widget: list, composer, replies, votes, paging
 * and inline moderation. Options are `CommentsProps` in `./types`, passed
 * kebab-cased by the host. Import
 * `@lst97-oss/last-comments-widgets/vue/styles.css` once and proxy `/api/*`
 * same-origin. Emits `moderated` after a moderation action, lock change or
 * moderator post.
 */
import { useTheme } from './lib/useTheme'
import {
  ApiError,
  beginOAuthSignIn,
  canModerate,
  createClient,
  describeError,
  type ErrorInfo,
  type Comment,
  type CommentSettings,
  fetchCommentSettings,
  fetchViewerSession,
  forgetEditKey,
  gateFor,
  isCompleteSettings,
  resolveSettings,
  signInRequired,
  getEditKey,
  loadModerationWindow,
  loadThreadWindow,
  postFailure,
  reactionFailure,
  resolveModerationThread,
  type ModerationAction,
  safeUrl,
  saveEditKey,
  signOutViewerSession,
  sortCommentRoots,
  takeSignInFailure,
  themeVarsToStyle,
  type ReactionSummary,
  type ThreadSort,
  type ViewerSession,
  type VoteValue,
} from '@last-comments-widgets/client'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import CommentError from './CommentError.vue'
import CommentForm from './CommentForm.vue'
import SignInPrompt from './SignInPrompt.vue'
import CommentList from './CommentList.vue'
import CommentSkeleton from './CommentSkeleton.vue'
import CommentsPager from './CommentsPager.vue'
import IdentityMenu from './IdentityMenu.vue'
import ThreadGuides from './ThreadGuides.vue'
import ThreadSortToggle from './ThreadSortToggle.vue'
import { setPending, useCommentsUi } from './lib/useCommentsUi'
import { useLazyLoad } from './lib/useLazyLoad'
import { threadSignature } from './lib/useGuides'
import { useThreadWindow } from './lib/useThreadWindow'
import { provideWidgetRoot } from './lib/widgetRoot'
import ReactionBar from './ReactionBar.vue'
import {
  applyCommentOverlay,
  type CommentOverlay,
  type CommentPatch,
  type CommentsProps,
  type ReactionMode,
  resolvePageUrl,
} from './types'

const props = withDefaults(defineProps<CommentsProps>(), {
  limit: 20,
  theme: 'system',
  lazy: false,
  math: false,
  mermaid: false,
  codeHighlight: true,
  actionMode: 'icon-text',
})
const emit = defineEmits<{ moderated: [] }>()

const replyTo = ref<string | null>(null)
const sort = ref<ThreadSort>('newest')
const dark = useTheme(() => props.theme)
const { pendingModeration, actionError, lockPending, identityPending, identityError, clearError } = useCommentsUi()
const pageLock = ref<{ pageId: string; locked: boolean } | null>(null)
// Thread the moderator UI is pointed at: the `pageId` prop, or the page the URL
// matched. Rows and moderator posts both address it.
const threadPageId = ref<string | null>(null)
const session = ref<ViewerSession | null>(null)
const sessionStatus = ref<'loading' | 'ready'>('loading')
const formError = ref<ErrorInfo | null>(null)
const commentAs = ref<'account' | 'anonymous'>('account')
const identityOpen = ref(false)
// Vote requests in flight, by comment id: both buttons of a row wait for the answer.
const pendingVotes = ref<Record<string, boolean>>({})

const rootStyle = computed(() => themeVarsToStyle(props.themeVars, dark.value))
const client = computed(() => createClient({ baseUrl: props.baseUrl, site: props.site, fetchImpl: props.fetchImpl }))
const pageUrl = computed(() => resolvePageUrl(props.pageUrl))
const signInUrl = computed(() => safeUrl(props.signInUrl))
// Vote and reaction results land in an overlay applied over the cached tree: rebuilding the
// whole tree on every vote would hand every row a fresh prop object.
const overlay = ref<CommentOverlay>({})
const {
  rows: comments,
  page,
  hasMore,
  loadingPage,
  status,
  errorInfo,
  limit,
  roots,
  pageRoots,
  nextDisabled,
  loadFirstPage,
  nextPage,
  previousPage,
} = useThreadWindow({
  limit: () => props.limit ?? 20,
  // Overlay before sorting: `best` must re-rank on a vote.
  transform: (nodes) => sortCommentRoots(applyCommentOverlay(nodes, overlay.value), sort.value),
  load: async ({ reset, pages, existing }) => {
    if (moderator.value) {
      // A reload looks the thread up again; load-more reuses it. An unlisted URL throws PAGE_NOT_LISTED.
      if (reset || threadPageId.value === null) {
        const thread = await resolveModerationThread({ client: client.value, url: pageUrl.value, pageId: props.pageId })
        pageLock.value = thread.pageLock
        threadPageId.value = thread.threadPageId
      }
      const pageId = threadPageId.value
      if (pageId === null) return { comments: [], hasMore: false }
      return loadModerationWindow({
        client: client.value,
        pageId,
        limit: props.limit ?? 20,
        pages,
        existing: reset ? [] : existing,
      })
    }
    // Fill the WINDOW BEING RENDERED, not the page being left: replies consume
    // rows, so one `limit`-row fetch yields fewer than `limit` threads.
    // shortcut: a reply created after the stream moved past its thread's page is
    // missing until more rows load — the list endpoint has no per-thread query.
    const result = await loadThreadWindow({
      site: props.site,
      baseUrl: props.baseUrl,
      pageUrl: pageUrl.value,
      limit: props.limit ?? 20,
      pages: reset ? 1 : pages,
      ...(reset ? {} : { existing }),
      ...(props.fetchImpl ? { fetchImpl: props.fetchImpl } : {}),
    })
    return { comments: result.comments, hasMore: result.hasMore }
  },
  failure: (err) => (moderator.value ? moderationError(err, 'Failed to load comments') : describeError(err)),
  onBeforeLoad: () => clearError(),
  onLoaded: (reset) => {
    // A committed reload supersedes every pending vote patch.
    if (reset) overlay.value = {}
  },
})
const moderator = computed(() => canModerate(props.viewerRole))
const signedIn = computed(() => Boolean(session.value) || Boolean(props.viewerUserId))
// The site's policy: a complete `settings` prop is used as given, otherwise the public settings
// endpoint is read once per site. Explicit props still win over both.
const settingsFetched = ref<CommentSettings | null>(null)
const settingsSettled = ref(false)
const settingsComplete = computed(() => isCompleteSettings(props.settings))
const settingsReady = computed(() => settingsComplete.value || settingsSettled.value)
const policy = computed(() =>
  resolveSettings(
    {
      bodyLimit: props.bodyLimit,
      anonEditWindowMinutes: props.anonEditWindowMinutes,
      turnstileSiteKey: props.turnstileSiteKey,
    },
    props.settings,
    settingsFetched.value,
  ),
)
const gateSignedIn = computed(() => signedIn.value || moderator.value)
const readGate = computed(() => gateFor(policy.value.access, 'read', gateSignedIn.value))
const writeAllowed = computed(() => gateFor(policy.value.access, 'write', gateSignedIn.value) === 'allow')
// A locked site waits for the identity probe before it asks anyone to sign in.
const sessionPending = computed(() => sessionStatus.value === 'loading' && policy.value.access !== 'open')
const showComposer = computed(() => !settingsReady.value || sessionPending.value || writeAllowed.value)
// The host's `onSignInClick` replaces the OAuth start in the error and prompt blocks, as React does.
// The identity menu keeps its own sign-in link or OAuth start.
const signInTarget = computed(() => (props.onSignInClick ? undefined : signInUrl.value))
const guest = computed(() => !signedIn.value || (commentAs.value === 'anonymous' && policy.value.access === 'open'))
const identityLabel = computed(() =>
  commentAs.value === 'anonymous' || !signedIn.value ? 'Anonymous' : session.value?.name || 'Your account',
)

async function refresh() {
  replyTo.value = null
  await loadFirstPage()
}

function cancelReply() {
  replyTo.value = null
}

function startReply(id: string) {
  replyTo.value = id
}

function handleSortChange(next: ThreadSort) {
  sort.value = next
  // Window boundaries follow the new order, so start from its first page.
  page.value = 1
}

// A guest owns a comment only while this browser still holds its edit key.
const guestEditKeys = computed(() => {
  const keys: Record<string, boolean> = {}
  for (const comment of comments.value) {
    if (!comment.userId && getEditKey(comment.id)) keys[comment.id] = true
  }
  return keys
})

// Shared create path: head comments and inline replies differ only in the
// parent, so the moderation/origin branching lives here once.
// A post joins the list at its end only when the list holds the whole stream. With more pages to come,
// the next page's offset would count a row the server never sent, so the first page reloads instead.
async function showPosted(created: Comment) {
  if (hasMore.value) await loadFirstPage()
  else comments.value = [...comments.value, created]
}

async function postOne(
  parentId: string | null,
  input: { authorName: string; bodyMarkdown: string; verificationToken?: string },
) {
  const bodyMarkdown = input.bodyMarkdown.trim()
  // Moderators post through the moderation endpoint: the public create path
  // checks the site's origin allow-list, which a dashboard origin is not on.
  const created =
    moderator.value && threadPageId.value
      ? await client.value.createModerationComment({
          pageId: threadPageId.value,
          bodyMarkdown,
          ...(parentId ? { parentId } : {}),
          anonymous: guest.value,
          ...(guest.value && input.authorName.trim() ? { authorName: input.authorName.trim() } : {}),
        })
      : await client.value.postComment({
          url: pageUrl.value,
          bodyMarkdown,
          anonymous: guest.value,
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
}

async function submit(input: { authorName: string; bodyMarkdown: string; verificationToken?: string }) {
  const bodyMarkdown = input.bodyMarkdown.trim()
  if (!bodyMarkdown) {
    formError.value = {
      code: null,
      title: "Your comment wasn't posted",
      message: 'Please write a comment first.',
      action: 'none',
    }
    return false
  }
  formError.value = null
  try {
    const created = await postOne(null, input)
    await showPosted(created)
    page.value = 1
    if (status.value !== 'ready') status.value = 'ready'
    if (moderator.value) emit('moderated')
    return true
  } catch (err) {
    formError.value = postFailure(err, "Your comment wasn't posted")
    return false
  }
}

// The inline reply slot owns its pending/error state, so failures return to
// the item instead of the page-level composer block.
async function submitReply(
  commentId: string,
  input: { authorName: string; bodyMarkdown: string; verificationToken?: string },
): Promise<ErrorInfo | null> {
  const bodyMarkdown = input.bodyMarkdown.trim()
  if (!bodyMarkdown) {
    return { code: null, title: "Your reply wasn't posted", message: 'Please write a reply first.', action: 'none' }
  }
  try {
    const created = await postOne(commentId, input)
    await showPosted(created)
    page.value = 1
    replyTo.value = null
    if (status.value !== 'ready') status.value = 'ready'
    if (moderator.value) emit('moderated')
    return null
  } catch (err) {
    return postFailure(err, "Your reply wasn't posted")
  }
}

// A patch merges over the row it names, so a vote and a reaction on one row do not undo each other.
function updateComment(id: string, patch: CommentPatch) {
  overlay.value = { ...overlay.value, [id]: { ...overlay.value[id], ...patch } }
}

async function vote(commentId: string, value: VoteValue | 'clear') {
  actionError.value = null
  // Votes need a signed-in session: a guest is told so, rather than sent a request that is refused.
  if (!gateSignedIn.value) {
    actionError.value = signInRequired('vote')
    return
  }
  pendingVotes.value = setPending(pendingVotes.value, commentId, true)
  try {
    // Moderators vote through the moderation endpoint: the public vote route
    // checks the site's origin allow-list, which a dashboard origin is not on.
    const summary = moderator.value
      ? await client.value.setModerationVote({ commentId, value: value === 'clear' ? null : value })
      : value === 'clear'
        ? await client.value.clearVote(commentId)
        : await client.value.castVote(commentId, value)
    updateComment(commentId, { score: summary.score, viewerVote: summary.viewerVote })
  } catch (err) {
    actionError.value = describeError(err, { title: "Your vote wasn't saved" })
  } finally {
    pendingVotes.value = setPending(pendingVotes.value, commentId, false)
  }
}

const PAGE_REACTIONS_KEY = 'page'
const reactionPending = ref<Record<string, boolean>>({})
// The page bar's counts, read with the page. The read carries the session cookie, so a signed-in
// viewer's own reactions come back with them.
const pageReactions = ref<ReactionSummary[]>([])
// Finished page presses. A page read that started before one is older than it, so it is dropped.
let pageWrites = 0
const pageReactionsOn = computed(() => policy.value.features.pageReactions.length > 0)
watch(
  [pageUrl, pageReactionsOn],
  ([url, on], _previous, onCleanup) => {
    if (!on) return
    let active = true
    onCleanup(() => {
      active = false
    })
    const writesAtStart = pageWrites
    const current = () => active && pageWrites === writesAtStart
    client.value.listPageReactions({ url }).then(
      (next) => {
        if (current()) pageReactions.value = next
      },
      () => {
        if (current()) pageReactions.value = []
      },
    )
  },
  { immediate: true },
)
// Moderators see the counts and cannot react; a locked page keeps its counts but takes no reaction.
const reactionsLocked = computed(() => Boolean(pageLock.value?.locked))
const pageReactionMode = computed<ReactionMode>(() => {
  if (!pageReactionsOn.value) return 'off'
  return moderator.value ? 'counts' : 'interactive'
})
const commentReactionMode = computed<ReactionMode>(() => {
  if (policy.value.features.commentReactions.length === 0) return 'off'
  return moderator.value ? 'counts' : 'interactive'
})

// Every reaction goes through one path: the sign-in gate, the pending flag and the failure copy.
async function runReaction(pendingId: string, write: () => Promise<void>) {
  actionError.value = null
  // Reactions need a signed-in session, as votes do: a guest is told so rather than refused by the server.
  if (!gateSignedIn.value) {
    actionError.value = signInRequired('react')
    return
  }
  reactionPending.value = setPending(reactionPending.value, pendingId, true)
  try {
    await write()
  } catch (err) {
    actionError.value = reactionFailure(err)
  } finally {
    reactionPending.value = setPending(reactionPending.value, pendingId, false)
  }
}

async function react(commentId: string, emoji: string, viewerReacted: boolean) {
  await runReaction(commentId, async () => {
    const reactions = viewerReacted
      ? await client.value.clearReaction(commentId, emoji)
      : await client.value.castReaction(commentId, emoji)
    updateComment(commentId, { reactions })
  })
}

async function reactPage(emoji: string, viewerReacted: boolean) {
  await runReaction(PAGE_REACTIONS_KEY, async () => {
    pageReactions.value = viewerReacted
      ? await client.value.clearPageReaction({ url: pageUrl.value }, emoji)
      : await client.value.castPageReaction({ url: pageUrl.value }, emoji)
    pageWrites += 1
  })
}

// Edit failures stay with the item's own editor (it must stay open, and the
// widget's edit form renders the block): this only reports them.
async function edit(commentId: string, bodyMarkdown: string): Promise<ErrorInfo | null> {
  actionError.value = null
  try {
    // Moderators edit through the moderation endpoint for the same reason they
    // post through it: the public PATCH checks the site's origins.
    const editKey = moderator.value ? null : getEditKey(commentId)
    const updated = moderator.value
      ? await client.value.editModerationComment({ commentId, bodyMarkdown })
      : await client.value.editOwnComment({ commentId, bodyMarkdown, ...(editKey ? { editKey } : {}) })
    comments.value = comments.value.map((c) =>
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
    return null
  } catch (err) {
    return describeError(err, { title: "Your edit wasn't saved" })
  }
}

async function remove(commentId: string) {
  actionError.value = null
  try {
    // A guest proves ownership with the edit key kept in this browser; a signed-in author sends none.
    await client.value.deleteOwnComment(commentId, getEditKey(commentId) ?? undefined)
    forgetEditKey(commentId)
    // Keep the row as a tombstone: the thread keeps its shape and the normal
    // view renders the deleted placeholder instead of the body.
    comments.value = comments.value.map((c) => (c.id === commentId ? { ...c, status: 'deleted' } : c))
    // Deleting the last thread of a later page would leave an empty window while
    // `page` still points at it; fall back a page from the cache, never a fetch.
    page.value = Math.min(page.value, Math.max(1, Math.ceil(roots.value.length / limit.value)))
  } catch (err) {
    actionError.value = describeError(err, { title: "Your comment wasn't deleted" })
  }
}

function moderationError(err: unknown, fallback: string): ErrorInfo {
  // A moderator's failure is as often the same-origin requirement as an outage,
  // so a bare fetch rejection keeps that hint instead of reading as "check your
  // connection". Codes the client knows keep their own title and action.
  if (!(err instanceof ApiError))
    return describeError(err, {
      message: 'Moderation is only available when the comments API is served from this origin.',
    })
  if (err.code === 'ORIGIN_NOT_ALLOWED')
    return describeError(err, { message: 'Moderation requires the comments API on the same origin as this page.' })
  if (err.code === 'PAGE_NOT_FOUND')
    return describeError(err, { title: fallback, message: 'This page is no longer available.' })
  return describeError(err, { title: fallback })
}

async function moderate(commentId: string, action: ModerationAction) {
  pendingModeration.value = setPending(pendingModeration.value, commentId, true)
  clearError()
  try {
    const patch = await client.value.moderateComment({ commentId, action })
    comments.value = comments.value.map((c) =>
      c.id === commentId ? { ...c, status: patch.status, pinnedAt: patch.pinnedAt } : c,
    )
    emit('moderated')
  } catch (err) {
    actionError.value = moderationError(err, 'That moderation action failed')
  } finally {
    pendingModeration.value = setPending(pendingModeration.value, commentId, false)
  }
}

async function blockUser(commentId: string, blocked: boolean) {
  const userId = comments.value.find((c) => c.id === commentId)?.userId
  if (!userId) return
  pendingModeration.value = setPending(pendingModeration.value, commentId, true)
  clearError()
  try {
    await client.value.setUserBlocked({ userId, blocked })
    comments.value = comments.value.map((c) => (c.userId === userId ? { ...c, userBlocked: blocked } : c))
    emit('moderated')
  } catch (err) {
    actionError.value = moderationError(err, 'That moderation action failed')
  } finally {
    pendingModeration.value = setPending(pendingModeration.value, commentId, false)
  }
}

async function toggleLock() {
  if (!pageLock.value) return
  lockPending.value = true
  actionError.value = null
  try {
    const next = await client.value.setPageLocked({ pageId: pageLock.value.pageId, locked: !pageLock.value.locked })
    pageLock.value = { pageId: next.id, locked: next.isLocked }
    emit('moderated')
  } catch (err) {
    actionError.value = moderationError(err, 'That moderation action failed')
  } finally {
    lockPending.value = false
  }
}

async function startSignIn() {
  identityOpen.value = false
  identityPending.value = true
  identityError.value = null
  try {
    window.location.assign(
      await beginOAuthSignIn({ baseUrl: props.baseUrl, pageUrl: pageUrl.value, fetchImpl: props.fetchImpl }),
    )
  } catch (err) {
    identityError.value = { info: describeError(err), retry: startSignIn }
    identityPending.value = false
  }
}

function requestSignIn() {
  if (props.onSignInClick) props.onSignInClick()
  else void startSignIn()
}

// A sign-in the provider rejected returns here with a failure marker. Explain it
// once in the identity control, then drop the marker so a reload does not repeat it.
onMounted(() => {
  const failure = takeSignInFailure(window.location.href)
  if (!failure) return
  identityError.value = { info: failure.info, retry: startSignIn }
  window.history.replaceState(window.history.state, '', failure.cleanHref)
})

function chooseIdentity(value: 'account' | 'anonymous') {
  commentAs.value = value
  identityOpen.value = false
}

async function signOut() {
  identityPending.value = true
  identityError.value = null
  try {
    await signOutViewerSession({ baseUrl: props.baseUrl, fetchImpl: props.fetchImpl })
    session.value = null
    commentAs.value = 'anonymous'
  } catch (err) {
    identityError.value = { info: describeError(err), retry: signOut }
  } finally {
    identityPending.value = false
    identityOpen.value = false
  }
}

const rootEl = useTemplateRef<HTMLElement>('rootEl')
const listEl = useTemplateRef<HTMLElement>('listEl')
// Portaled popups stay inside the widget root so they inherit its theme vars.
provideWidgetRoot(rootEl)
// `lazy` gates the session probe too: an offscreen embed issues no requests, so
// the identity stays a disabled skeleton chip until the first intersection.
// The first list request waits for the site's policy and, on a locked site, for the identity probe,
// so a private site never fires a request it is bound to refuse. It runs again as each one settles.
function requestList() {
  if (!started.value || !settingsReady.value || sessionPending.value) return
  if (readGate.value === 'sign-in') {
    status.value = 'error'
    errorInfo.value = signInRequired('read')
    return
  }
  void loadFirstPage()
}

async function fetchSettings() {
  if (settingsComplete.value) return
  settingsSettled.value = false
  settingsFetched.value = await fetchCommentSettings({
    baseUrl: props.baseUrl,
    site: props.site,
    fetchImpl: props.fetchImpl,
  })
  settingsSettled.value = true
}

const { started } = useLazyLoad(
  rootEl,
  () => props.lazy,
  () => {
    void fetchSettings()
    void fetchViewerSession({ baseUrl: props.baseUrl, fetchImpl: props.fetchImpl })
      .then((value) => {
        session.value = value
      })
      .finally(() => {
        sessionStatus.value = 'ready'
      })
  },
)

watch([started, settingsReady, sessionPending, readGate], requestList)

// A new site or base URL reads its own policy before the list may load.
watch(
  () => [props.site, props.baseUrl, props.fetchImpl],
  () => {
    if (started.value) void fetchSettings()
  },
)

watch(
  () => [props.site, props.baseUrl, props.pageUrl, props.pageId, props.limit, props.viewerRole, props.fetchImpl],
  requestList,
)

defineExpose({ refresh })
</script>

<template>
  <section
    ref="rootEl"
    class="lc-comments"
    :class="dark ? 'dark' : ''"
    :style="rootStyle"
    aria-label="Comments"
    data-testid="lc-comments"
  >
    <div v-if="moderator && pageLock" class="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
      <span class="text-muted-foreground">
        {{ pageLock.locked ? 'Comments are locked on this page.' : 'Comments are open on this page.' }}
      </span>
      <button
        type="button"
        class="ml-auto inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-all hover:bg-muted disabled:opacity-50"
        :disabled="lockPending"
        @click="toggleLock"
      >
        {{ pageLock.locked ? 'Unlock' : 'Lock' }}
      </button>
    </div>

    <SignInPrompt
      v-if="actionError?.action === 'sign-in'"
      :info="actionError"
      context="vote"
      :sign-in-href="signInTarget"
      @sign-in="requestSignIn"
    />
    <CommentError
      v-else-if="actionError"
      :info="actionError"
      :sign-in-href="signInTarget"
      @retry="refresh"
      @sign-in="requestSignIn"
    />

    <!-- A private site shows one sign-in card, in the list slot below: no composer card here. -->
    <CommentForm
      v-if="readGate !== 'sign-in' && showComposer"
      :site-key="policy.turnstileSiteKey ?? undefined"
      :turnstile-options="props.turnstileOptions"
      :guest="guest"
      :dark="dark"
      :session-pending="sessionStatus === 'loading'"
      :parent-id="null"
      :error="formError"
      :body-limit="policy.bodyLimit"
      :math="props.math"
      :mermaid="props.mermaid"
      :code-highlight="props.codeHighlight"
      :on-submit="submit"
      :sign-in-href="signInTarget"
      :on-sign-in="requestSignIn"
    >
      <template #signIn>
        <IdentityMenu
          :comment-as="commentAs"
          :signed-in="signedIn"
          :session="session"
          :identity-pending="identityPending"
          :session-pending="sessionStatus === 'loading'"
          :identity-label="identityLabel"
          :allow-anonymous="policy.access === 'open'"
          :identity-open="identityOpen"
          :sign-in-url="signInUrl"
          :error="identityError"
          @update:identity-open="identityOpen = $event"
          @choose="chooseIdentity"
          @sign-in="startSignIn"
          @sign-out="signOut"
        />
      </template>
    </CommentForm>
    <SignInPrompt
      v-else-if="readGate !== 'sign-in'"
      :info="signInRequired('write')"
      context="write"
      :sign-in-href="signInTarget"
      @sign-in="requestSignIn"
    />

    <ReactionBar
      v-if="pageReactionMode !== 'off'"
      label="Reactions to this page"
      :mode="pageReactionMode"
      :allowed="policy.features.pageReactions"
      :reactions="pageReactions"
      :pending="(reactionPending[PAGE_REACTIONS_KEY] ?? false) || reactionsLocked"
      :on-react="reactPage"
    />

    <ThreadSortToggle v-if="status !== 'error' && roots.length > 0" :value="sort" :on-change="handleSortChange" />

    <div v-if="status === 'loading'" class="space-y-3">
      <CommentSkeleton :count="3" />
    </div>

    <div v-else-if="status === 'error'">
      <SignInPrompt
        v-if="errorInfo?.action === 'sign-in'"
        :info="errorInfo"
        context="read"
        :sign-in-href="signInTarget"
        @sign-in="requestSignIn"
      />
      <CommentError
        v-else-if="errorInfo"
        :info="errorInfo"
        :sign-in-href="signInTarget"
        @retry="refresh"
        @sign-in="requestSignIn"
      />
    </div>

    <template v-else>
      <p
        v-if="pageRoots.length === 0 && !loadingPage"
        class="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground"
      >
        No comments yet.
      </p>
      <section v-else ref="listEl" aria-label="Comments" class="lc-thread-guides relative grid grid-cols-1 gap-3">
        <!-- New window or a new render order (votes re-rank under `best`) remounts to re-measure. -->
        <ThreadGuides :key="`${page}:${sort}:${threadSignature(pageRoots)}`" :list-el="listEl" />
        <CommentList
          :nodes="pageRoots"
          :viewer-user-id="props.viewerUserId ?? session?.userId"
          :viewer-role="props.viewerRole"
          :hide-votes="!policy.features.votes || (moderator && Boolean(pageLock?.locked))"
          :reaction-mode="commentReactionMode"
          :reaction-emoji="policy.features.commentReactions"
          :pending-reactions="reactionPending"
          :reactions-locked="reactionsLocked"
          :pending-moderation="pendingModeration"
          :anon-window-minutes="policy.anonEditWindowMinutes"
          :has-edit-keys="guestEditKeys"
          :action-mode="props.actionMode"
          :body-limit="policy.bodyLimit"
          :math="props.math"
          :mermaid="props.mermaid"
          :code-highlight="props.codeHighlight"
          :reply-to="replyTo"
          :dark="dark"
          :pending-votes="pendingVotes"
          :on-vote="vote"
          :on-react="react"
          :on-reply="startReply"
          :on-edit="edit"
          :on-delete="remove"
          :on-reply-submit="submitReply"
          :reply-site-key="policy.turnstileSiteKey ?? undefined"
          :turnstile-options="props.turnstileOptions"
          :reply-guest="guest"
          :on-close-reply="cancelReply"
          :on-moderate="moderate"
          :on-block-user="blockUser"
          :write-allowed="writeAllowed"
          :sign-in-href="signInTarget"
          :on-sign-in="requestSignIn"
        >
          <template #signIn>
            <IdentityMenu
              :comment-as="commentAs"
              :signed-in="signedIn"
              :session="session"
              :identity-pending="identityPending"
              :session-pending="sessionStatus === 'loading'"
              :identity-label="identityLabel"
              :allow-anonymous="policy.access === 'open'"
              :identity-open="identityOpen"
              :sign-in-url="signInUrl"
              :error="identityError"
              @update:identity-open="identityOpen = $event"
              @choose="chooseIdentity"
              @sign-in="startSignIn"
              @sign-out="signOut"
            />
          </template>
        </CommentList>
      </section>
      <div v-if="loadingPage" class="space-y-3">
        <CommentSkeleton :count="2" />
      </div>
      <CommentsPager
        :page="page"
        :limit="limit"
        :threads="roots.length"
        :has-more="hasMore"
        :next-disabled="nextDisabled"
        :loading="loadingPage"
        @prev="previousPage"
        @next="nextPage"
      />
    </template>
    <footer class="lc-footer mt-2 text-right text-xs text-muted-foreground">
      Powered by
      <a
        class="underline underline-offset-4 hover:text-foreground"
        href="https://github.com/lst97-oss/last-comments"
        target="_blank"
        rel="noreferrer"
        >last-comments</a
      >
    </footer>
  </section>
</template>
