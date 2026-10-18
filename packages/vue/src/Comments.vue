<script setup lang="ts">
import { useTheme } from './lib/useTheme'
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
} from '@last-comments-widgets/client'
import { Check } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import CommentError from './CommentError.vue'
import CommentForm from './CommentForm.vue'
import CommentList from './CommentList.vue'
import CommentSkeleton from './CommentSkeleton.vue'
import { useLazyLoad } from './lib/useLazyLoad'
import { type CommentsProps, resolvePageUrl } from './types'

const props = withDefaults(defineProps<CommentsProps>(), { limit: 20, theme: 'system', lazy: false })
const emit = defineEmits<{ 'sign-in': [] }>()

type Status = 'loading' | 'ready' | 'error' | 'locked' | 'blocked'

// Locked and blocked are terminal states, not notices, but their copy still comes
// from the one error table: the empty message makes describeError use code copy.
const LOCKED_COPY = describeError(new ApiError('PAGE_LOCKED', '', 409))
const BLOCKED_COPY = describeError(new ApiError('USER_BLOCKED', '', 403))

const comments = ref<Comment[]>([])
const status = ref<Status>('loading')
const errorInfo = ref<ErrorInfo | null>(null)
const hasMore = ref(true)
const page = ref(1)
const loadingPage = ref(false)
const replyTo = ref<string | null>(null)
const dark = useTheme(() => props.theme)
const unauthenticated = ref(false)
const pageLock = ref<{ pageId: string; locked: boolean } | null>(null)
const lockPending = ref(false)
const pendingModeration = ref<Record<string, boolean>>({})
const actionError = ref<ErrorInfo | null>(null)
const identityPending = ref(false)
const identityError = ref<{ info: ErrorInfo; retry: () => void } | null>(null)
const session = ref<ViewerSession | null>(null)
const sessionStatus = ref<'loading' | 'ready'>('loading')
const commentAs = ref<'account' | 'anonymous'>('account')
const identityOpen = ref(false)
const identityEl = ref<HTMLElement | null>(null)

const client = computed(() => createClient({ baseUrl: props.baseUrl, site: props.site, fetchImpl: props.fetchImpl }))
const pageUrl = computed(() => resolvePageUrl(props.pageUrl))
const signInUrl = computed(() => safeUrl(props.signInUrl))
const limit = computed(() => props.limit ?? 20)
// A page is a window over threads, not rows: the API stream is flat and replies
// can land on a later row than their parent, so a raw page slice would render
// those replies as phantom top-level comments.
const roots = computed<ThreadNode[]>(() => buildCommentTree(comments.value))
const pageRoots = computed(() => roots.value.slice((page.value - 1) * limit.value, page.value * limit.value))
const nextDisabled = computed(() => roots.value.length <= page.value * limit.value && !hasMore.value)
const moderator = computed(() => canModerate(props.viewerRole))
const signedIn = computed(() => Boolean(session.value) || Boolean(props.viewerUserId))
const guest = computed(() => !signedIn.value || commentAs.value === 'anonymous')
const identityLabel = computed(() =>
  commentAs.value === 'anonymous' || !signedIn.value ? 'Anonymous' : session.value?.name || 'Your account',
)

async function load(reset: boolean, pages = 1): Promise<boolean> {
  if (reset) {
    status.value = 'loading'
    unauthenticated.value = false
    page.value = 1
  }
  errorInfo.value = null
  actionError.value = null
  try {
    if (moderator.value) {
      // Resolve this page from the site's page list, then read its thread
      // including hidden/deleted rows.
      const overview = await client.value.listModeration({ limit: 1 })
      const normalized = normalizePageUrl(pageUrl.value)
      const match = overview.pages.find((page) => normalizePageUrl(page.canonicalUrl) === normalized) ?? null
      pageLock.value = match ? { pageId: match.id, locked: match.isLocked } : null
      if (!match) {
        comments.value = reset ? [] : comments.value
        hasMore.value = false
        status.value = 'ready'
        return true
      }
      const result = await client.value.listModeration({
        pageId: match.id,
        limit: props.limit ?? 20,
        offset: reset ? 0 : comments.value.length,
      })
      const rows = result.comments.map(moderationCommentToComment)
      comments.value = reset ? rows : [...comments.value, ...rows]
      hasMore.value = comments.value.length < result.total
      status.value = 'ready'
      return true
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
      ...(reset ? {} : { existing: comments.value }),
      ...(props.fetchImpl ? { fetchImpl: props.fetchImpl } : {}),
    })
    comments.value = result.comments
    hasMore.value = result.hasMore
    status.value = 'ready'
    return true
  } catch (err) {
    // Locked/blocked stay states, not notices: they replace the list entirely.
    const code = err instanceof ApiError ? err.code : undefined
    if (code === 'PAGE_LOCKED') status.value = 'locked'
    else if (code === 'USER_BLOCKED') status.value = 'blocked'
    else {
      status.value = 'error'
      errorInfo.value = moderator.value ? moderationError(err, 'Moderation is unavailable') : describeError(err)
    }
    return false
  }
}

// A page-one load (first paint, prop change, retry, post-refresh) fills window 1;
// Next extends the cached rows to the destination window before rendering it.
async function loadFirstPage() {
  await load(true)
}

async function nextPage() {
  if (loadingPage.value || nextDisabled.value) return
  loadingPage.value = true
  try {
    if (!(await load(false, page.value + 1))) return
    if (roots.value.length > page.value * limit.value) page.value += 1
  } finally {
    loadingPage.value = false
  }
}

function previousPage() {
  if (page.value > 1) page.value -= 1
}

async function refresh() {
  replyTo.value = null
  await loadFirstPage()
}

async function submit(input: { authorName: string; bodyMarkdown: string; verificationToken?: string }) {
  try {
    const created = await client.value.postComment({
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
  } catch (err) {
    if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') unauthenticated.value = true
    else if (err instanceof ApiError && err.code === 'PAGE_LOCKED') status.value = 'locked'
    else if (err instanceof ApiError && err.code === 'USER_BLOCKED') status.value = 'blocked'
    else throw err
  }
}

function updateComment(id: string, patch: { score?: number; viewerVote?: VoteValue | null }) {
  comments.value = comments.value.map((c) => (c.id === id ? { ...c, ...patch } : c))
}

async function vote(commentId: string, value: VoteValue | 'clear') {
  actionError.value = null
  try {
    const summary =
      value === 'clear' ? await client.value.clearVote(commentId) : await client.value.castVote(commentId, value)
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
  const updated = await client.value.editOwnComment({ commentId, bodyMarkdown })
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
  pendingModeration.value = { ...pendingModeration.value, [commentId]: true }
  actionError.value = null
  try {
    const patch = await client.value.moderateComment({ commentId, action })
    comments.value = comments.value.map((c) =>
      c.id === commentId ? { ...c, status: patch.status, pinnedAt: patch.pinnedAt } : c,
    )
  } catch (err) {
    actionError.value = moderationError(err, 'That moderation action failed')
  } finally {
    pendingModeration.value = { ...pendingModeration.value, [commentId]: false }
  }
}

async function blockUser(commentId: string, blocked: boolean) {
  const userId = comments.value.find((c) => c.id === commentId)?.userId
  if (!userId) return
  pendingModeration.value = { ...pendingModeration.value, [commentId]: true }
  actionError.value = null
  try {
    await client.value.setUserBlocked({ userId, blocked })
    comments.value = comments.value.map((c) => (c.userId === userId ? { ...c, userBlocked: blocked } : c))
  } catch (err) {
    actionError.value = moderationError(err, 'That moderation action failed')
  } finally {
    pendingModeration.value = { ...pendingModeration.value, [commentId]: false }
  }
}

async function toggleLock() {
  if (!pageLock.value) return
  lockPending.value = true
  actionError.value = null
  try {
    const next = await client.value.setPageLocked({ pageId: pageLock.value.pageId, locked: !pageLock.value.locked })
    pageLock.value = { pageId: next.id, locked: next.isLocked }
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

const rootEl = ref<HTMLElement | null>(null)
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
  () => [props.site, props.baseUrl, props.pageUrl, props.limit, props.viewerRole, props.fetchImpl],
  () => {
    if (started.value) void loadFirstPage()
  },
)

defineExpose({ refresh })
</script>

<template>
  <section
    ref="rootEl"
    class="lc-comments space-y-4"
    :class="dark ? 'dark' : ''"
    :style="themeVarsToStyle(props.themeVars, dark)"
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
      :on-cancel-reply="replyTo ? () => (replyTo = null) : undefined"
      :sign-in-href="signInUrl"
      :on-sign-in="startSignIn"
      @submitted="refresh"
    >
      <template #signIn>
        <span class="text-xs text-muted-foreground">Comment as</span>
        <div ref="identityEl" class="relative min-w-0">
          <button
            type="button"
            class="lc-identity-trigger inline-flex h-8 max-w-[10rem] items-center gap-1 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
            aria-haspopup="menu"
            :aria-expanded="identityOpen"
            :disabled="identityPending || sessionStatus === 'loading'"
            @click="identityOpen = !identityOpen"
          >
            <span v-if="sessionStatus === 'loading'" class="block h-4 w-16 animate-pulse rounded bg-muted"></span>
            <span v-else class="max-w-[10rem] truncate">{{ identityLabel }}</span>
            <span aria-hidden="true" class="shrink-0">▾</span>
          </button>
          <div
            v-if="identityOpen"
            role="menu"
            class="lc-identity-menu absolute top-full right-0 z-10 mt-1 w-48 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
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
        :hide-votes="moderator"
        :pending-moderation="pendingModeration"
        :edit-window-minutes="props.editWindowMinutes ?? DEFAULT_EDIT_WINDOW_MINUTES"
        :sign-in-href="signInUrl"
        :on-sign-in="startSignIn"
        :on-vote="vote"
        :on-reply="(id: string) => (replyTo = id)"
        :on-edit="edit"
        :on-delete="remove"
        :on-moderate="moderate"
        :on-block-user="blockUser"
      />
      <div v-if="loadingPage" class="space-y-3">
        <CommentSkeleton :count="2" />
      </div>
      <!-- `roots.length > limit`: after Prev to page 1 at the end of the stream
           hasMore is false, yet later pages are loaded and must stay reachable. -->
      <nav
        v-if="page > 1 || hasMore || roots.length > limit"
        aria-label="Comments pagination"
        class="flex flex-wrap items-center justify-between gap-2 text-sm"
      >
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          :disabled="page === 1 || loadingPage"
          @click="previousPage"
        >
          <span aria-hidden="true">&lsaquo;</span> Previous
        </button>
        <span class="text-muted-foreground">
          Page <span aria-current="page" class="font-medium text-foreground">{{ page }}</span>
        </span>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          :disabled="nextDisabled || loadingPage"
          @click="nextPage"
        >
          Next <span aria-hidden="true">&rsaquo;</span>
        </button>
      </nav>
    </template>
  </section>
</template>
