<script setup lang="ts">
import { useTheme } from './lib/useTheme'
import {
  ApiError,
  beginOAuthSignIn,
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
  themeVarsToStyle,
  type ViewerSession,
  type VoteValue,
} from '@last-comments-widgets/client'
import { Check } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import CommentError from './CommentError.vue'
import CommentForm from './CommentForm.vue'
import CommentList from './CommentList.vue'
import CommentSkeleton from './CommentSkeleton.vue'
import CommentsPager from './CommentsPager.vue'
import { setPending, useCommentsUi } from './lib/useCommentsUi'
import { useLazyLoad } from './lib/useLazyLoad'
import { useThreadWindow } from './lib/useThreadWindow'
import { applyVoteOverlay, type CommentsProps, resolvePageUrl, type VoteOverlay } from './types'

const props = withDefaults(defineProps<CommentsProps>(), { limit: 20, theme: 'system', lazy: false })
const emit = defineEmits<{ 'sign-in': []; moderated: [] }>()

type Status = 'loading' | 'ready' | 'error' | 'locked' | 'blocked'

// Locked and blocked are terminal states, not notices, but their copy still comes
// from the one error table: the empty message makes describeError use code copy.
const LOCKED_COPY = describeError(new ApiError('PAGE_LOCKED', '', 409))
const BLOCKED_COPY = describeError(new ApiError('USER_BLOCKED', '', 403))

const replyTo = ref<string | null>(null)
const dark = useTheme(() => props.theme)
const { pendingModeration, actionError, lockPending, identityPending, identityError, unauthenticated, clearError } =
  useCommentsUi()
const pageLock = ref<{ pageId: string; locked: boolean } | null>(null)
// Thread the moderator UI is pointed at: the `pageId` prop, or the page the URL
// matched. Rows and moderator posts both address it.
const threadPageId = ref<string | null>(null)
const session = ref<ViewerSession | null>(null)
const sessionStatus = ref<'loading' | 'ready'>('loading')
const commentAs = ref<'account' | 'anonymous'>('account')
const identityOpen = ref(false)
const identityEl = useTemplateRef<HTMLElement>('identityEl')

const rootStyle = computed(() => themeVarsToStyle(props.themeVars, dark.value))
const client = computed(() => createClient({ baseUrl: props.baseUrl, site: props.site, fetchImpl: props.fetchImpl }))
const pageUrl = computed(() => resolvePageUrl(props.pageUrl))
const signInUrl = computed(() => safeUrl(props.signInUrl))
// Vote results land in an overlay applied over the cached tree: rebuilding the
// whole tree on every vote would hand every row a fresh prop object.
const votes = ref<VoteOverlay>({})
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
} = useThreadWindow<Status>({
  limit: () => props.limit ?? 20,
  transform: (nodes) => applyVoteOverlay(nodes, votes.value),
  load: async ({ reset, pages, existing }) => {
    if (moderator.value) {
      // A host-supplied `pageId` wins over the URL match: the page list is
      // capped, so a match can miss on a busy site.
      const overview = await client.value.listModeration({ limit: 1 })
      const normalized = normalizePageUrl(pageUrl.value)
      const match = props.pageId
        ? (overview.pages.find((page) => page.id === props.pageId) ?? null)
        : (overview.pages.find((page) => normalizePageUrl(page.canonicalUrl) === normalized) ?? null)
      const threadId = props.pageId ?? match?.id ?? null
      // Unknown lock state stays unknown: the lock bar is hidden rather than
      // claiming the thread is open.
      pageLock.value = match ? { pageId: match.id, locked: match.isLocked } : null
      threadPageId.value = threadId
      if (!threadId) return { comments: reset ? [] : existing, hasMore: false }
      const result = await client.value.listModeration({
        pageId: threadId,
        limit: props.limit ?? 20,
        offset: reset ? 0 : existing.length,
      })
      const rows = result.comments.map(moderationCommentToComment)
      const merged = reset ? rows : [...existing, ...rows]
      return { comments: merged, hasMore: merged.length < result.total }
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
  failure: (err) => {
    // Locked/blocked stay states, not notices: they replace the list entirely.
    const code = err instanceof ApiError ? err.code : undefined
    if (code === 'PAGE_LOCKED') return { status: 'locked' as const, info: describeError(err) }
    if (code === 'USER_BLOCKED') return { status: 'blocked' as const, info: describeError(err) }
    return {
      status: 'error' as const,
      info: moderator.value ? moderationError(err, 'Moderation is unavailable') : describeError(err),
    }
  },
  onBeforeLoad: (reset) => {
    if (reset) unauthenticated.value = false
    clearError()
  },
  onLoaded: (reset) => {
    // A committed reload supersedes every pending vote patch.
    if (reset) votes.value = {}
  },
})
const moderator = computed(() => canModerate(props.viewerRole))
const signedIn = computed(() => Boolean(session.value) || Boolean(props.viewerUserId))
const guest = computed(() => !signedIn.value || commentAs.value === 'anonymous')
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

async function submit(input: { authorName: string; bodyMarkdown: string; verificationToken?: string }) {
  try {
    // Moderators post through the moderation endpoint: the public create path
    // checks the site's origin allow-list, which a dashboard origin is not on.
    const created =
      moderator.value && threadPageId.value
        ? await client.value.createModerationComment({
            pageId: threadPageId.value,
            bodyMarkdown: input.bodyMarkdown,
            ...(replyTo.value ? { parentId: replyTo.value } : {}),
          })
        : await client.value.postComment({
            url: pageUrl.value,
            bodyMarkdown: input.bodyMarkdown,
            ...(replyTo.value
              ? { parentId: replyTo.value }
              : { title: typeof document !== 'undefined' ? document.title : undefined }),
            ...(input.authorName ? { authorName: input.authorName } : {}),
            ...(input.verificationToken ? { verificationToken: input.verificationToken } : {}),
            anonymous: guest.value,
          })
    comments.value = [...comments.value, created]
    replyTo.value = null
    if (moderator.value) emit('moderated')
  } catch (err) {
    if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') unauthenticated.value = true
    else if (err instanceof ApiError && err.code === 'PAGE_LOCKED') status.value = 'locked'
    else if (err instanceof ApiError && err.code === 'USER_BLOCKED') status.value = 'blocked'
    else throw err
  }
}

function updateComment(id: string, patch: { score?: number; viewerVote?: VoteValue | null }) {
  const base = comments.value.find((c) => c.id === id)
  const current = votes.value[id] ?? (base ? { score: base.score, viewerVote: base.viewerVote } : null)
  if (!current) return
  votes.value = {
    ...votes.value,
    [id]: {
      score: patch.score ?? current.score,
      viewerVote: patch.viewerVote === undefined ? current.viewerVote : patch.viewerVote,
    },
  }
}

async function vote(commentId: string, value: VoteValue | 'clear') {
  actionError.value = null
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
    // The sign-in panel is the affordance for an anonymous voter, not a notice.
    if (err instanceof ApiError && (err.code === 'UNAUTHENTICATED' || err.status === 401)) {
      unauthenticated.value = true
    } else {
      actionError.value = describeError(err, { title: "Your vote wasn't saved" })
    }
  }
}

// Edit failures stay with the item's own editor (it must stay open, and the
// widget's edit form renders the block): this only reports them.
async function edit(commentId: string, bodyMarkdown: string) {
  // Moderators edit through the moderation endpoint for the same reason they
  // post through it: the public PATCH checks the site's origins.
  const updated = moderator.value
    ? await client.value.editModerationComment({ commentId, bodyMarkdown })
    : await client.value.editOwnComment({ commentId, bodyMarkdown })
  comments.value = comments.value.map((c) => (c.id === commentId ? updated : c))
}

async function remove(commentId: string) {
  actionError.value = null
  try {
    await client.value.deleteOwnComment(commentId)
    comments.value = comments.value.filter((c) => c.id !== commentId)
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

function signIn() {
  emit('sign-in')
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

function closeIdentityOnOutsidePointer(event: PointerEvent) {
  if (!identityEl.value?.contains(event.target as Node)) identityOpen.value = false
}

function closeIdentityOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') identityOpen.value = false
}

function setIdentityListeners(open: boolean) {
  if (typeof document === 'undefined') return
  if (open) {
    document.addEventListener('pointerdown', closeIdentityOnOutsidePointer)
    document.addEventListener('keydown', closeIdentityOnEscape)
  } else {
    document.removeEventListener('pointerdown', closeIdentityOnOutsidePointer)
    document.removeEventListener('keydown', closeIdentityOnEscape)
  }
}

watch(identityOpen, setIdentityListeners)
onBeforeUnmount(() => setIdentityListeners(false))

const rootEl = useTemplateRef<HTMLElement>('rootEl')
// `lazy` gates the session probe too: an offscreen embed issues no requests, so
// the identity stays a disabled skeleton chip until the first intersection.
const { started } = useLazyLoad(
  rootEl,
  () => props.lazy,
  () => {
    void loadFirstPage()
    void fetchViewerSession({ baseUrl: props.baseUrl, fetchImpl: props.fetchImpl })
      .then((value) => {
        session.value = value
      })
      .finally(() => {
        sessionStatus.value = 'ready'
      })
  },
)

watch(
  () => [props.site, props.baseUrl, props.pageUrl, props.pageId, props.limit, props.viewerRole, props.fetchImpl],
  () => {
    if (started.value) void loadFirstPage()
  },
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

    <CommentError
      v-if="actionError"
      :info="actionError"
      :sign-in-href="signInUrl"
      @retry="refresh"
      @sign-in="startSignIn"
    />

    <CommentForm
      :site-key="props.turnstileSiteKey"
      :guest="guest"
      :dark="dark"
      :session-pending="sessionStatus === 'loading'"
      :parent-id="replyTo"
      :on-submit="submit"
      :on-cancel-reply="replyTo ? cancelReply : undefined"
      :sign-in-href="signInUrl"
      :on-sign-in="startSignIn"
      @submitted="refresh"
    >
      <template #signIn>
        <!-- Moderators post as themselves through the moderation endpoint: the
             anonymous/account switcher does not apply. -->
        <span v-if="!moderator" class="text-xs text-muted-foreground">Comment as</span>
        <div v-if="!moderator" ref="identityEl" class="relative min-w-0">
          <button
            type="button"
            class="lc-identity-trigger inline-flex h-8 max-w-[calc(var(--spacing)*40)] items-center gap-1 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
            aria-haspopup="menu"
            :aria-expanded="identityOpen"
            :disabled="identityPending || sessionStatus === 'loading'"
            @click="identityOpen = !identityOpen"
          >
            <span v-if="sessionStatus === 'loading'" class="block h-4 w-16 animate-pulse rounded bg-muted"></span>
            <span v-else class="max-w-[calc(var(--spacing)*40)] truncate">{{ identityLabel }}</span>
            <span aria-hidden="true" class="shrink-0">▾</span>
          </button>
          <div
            v-if="identityOpen"
            role="menu"
            class="lc-identity-menu absolute top-full right-0 mt-1 w-48 max-w-[calc(var(--spacing)*8)] rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground"
          >
            <button
              type="button"
              role="menuitemradio"
              :aria-checked="commentAs === 'anonymous' || !signedIn"
              class="lc-identity-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
              @click="chooseIdentity('anonymous')"
            >
              <span class="flex-1">Anonymous</span>
              <Check v-if="commentAs === 'anonymous' || !signedIn" class="size-4 shrink-0" aria-hidden="true" />
            </button>
            <button
              v-if="signedIn"
              type="button"
              role="menuitemradio"
              :aria-checked="commentAs === 'account'"
              class="lc-identity-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
              @click="chooseIdentity('account')"
            >
              <span class="flex-1 truncate">{{ session?.name || 'Your account' }} (you)</span>
              <Check v-if="commentAs === 'account'" class="size-4 shrink-0" aria-hidden="true" />
            </button>
            <a
              v-else-if="signInUrl"
              :href="signInUrl"
              role="menuitem"
              class="lc-identity-item block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
              @click="identityOpen = false"
            >
              Sign in…
            </a>
            <button
              v-else
              type="button"
              role="menuitem"
              class="lc-identity-item block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
              :disabled="identityPending"
              @click="startSignIn"
            >
              Sign in…
            </button>
            <template v-if="session">
              <div role="separator" class="my-1 h-px bg-border" />
              <button
                type="button"
                role="menuitem"
                class="lc-identity-item block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
                :disabled="identityPending"
                @click="signOut"
              >
                Sign out
              </button>
            </template>
          </div>
        </div>
        <div v-if="identityError" class="w-full">
          <CommentError
            :info="identityError.info"
            :sign-in-href="signInUrl"
            @retry="identityError.retry()"
            @sign-in="startSignIn"
          />
        </div>
      </template>
    </CommentForm>

    <div v-if="unauthenticated" role="alert" class="rounded-lg border border-border bg-card p-5 text-sm">
      <p class="text-card-foreground">Sign in to vote on comments.</p>
      <div class="mt-3">
        <a
          v-if="signInUrl"
          :href="signInUrl"
          class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-primary px-2.5 text-sm font-medium whitespace-nowrap text-primary-foreground transition-all hover:bg-primary/80"
        >
          Sign in
        </a>
        <button
          v-else
          type="button"
          class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-primary px-2.5 text-sm font-medium whitespace-nowrap text-primary-foreground transition-all hover:bg-primary/80"
          @click="signIn"
        >
          Sign in
        </button>
      </div>
    </div>

    <div v-if="status === 'loading'" class="space-y-3">
      <CommentSkeleton :count="3" />
    </div>

    <div v-else-if="status === 'error'">
      <CommentError
        v-if="errorInfo"
        :info="errorInfo"
        :sign-in-href="signInUrl"
        @retry="refresh"
        @sign-in="startSignIn"
      />
    </div>

    <div
      v-else-if="status === 'locked'"
      class="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground"
    >
      <p class="font-medium">{{ LOCKED_COPY.title }}</p>
      <p class="mt-1">{{ LOCKED_COPY.message }}</p>
    </div>

    <div
      v-else-if="status === 'blocked'"
      class="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground"
    >
      <p class="font-medium">{{ BLOCKED_COPY.title }}</p>
      <p class="mt-1">{{ BLOCKED_COPY.message }}</p>
    </div>

    <template v-else>
      <p
        v-if="pageRoots.length === 0 && !loadingPage"
        class="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground"
      >
        No comments yet.
      </p>
      <CommentList
        v-else
        :nodes="pageRoots"
        :viewer-user-id="props.viewerUserId ?? session?.userId"
        :viewer-role="props.viewerRole"
        :hide-votes="moderator && Boolean(pageLock?.locked)"
        :pending-moderation="pendingModeration"
        :edit-window-minutes="props.editWindowMinutes ?? DEFAULT_EDIT_WINDOW_MINUTES"
        :sign-in-href="signInUrl"
        :on-sign-in="startSignIn"
        :on-vote="vote"
        :on-reply="startReply"
        :on-edit="edit"
        :on-delete="remove"
        :on-moderate="moderate"
        :on-block-user="blockUser"
      />
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
  </section>
</template>
