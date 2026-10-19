import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core'
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
  type LastCommentsClient,
  loadThreadWindow,
  type ModerationAction,
  moderationCommentToComment,
  normalizePageUrl,
  safeUrl,
  signOutViewerSession,
  type ThreadNode,
  themeVarsToStyle,
  type ViewerRole,
  type ViewerSession,
  type WidgetTheme,
} from '@last-comments-widgets/client'
import { LcCommentErrorComponent } from './comment-error.component'
import { LcCommentSkeletonsComponent } from './comment-skeletons.component'
import { type CommentSubmit, LcCommentFormComponent } from './comment-form.component'
import { LcCommentListComponent } from './comment-list.component'
import { observeInView } from './observe-in-view'
import { prefersDark, subscribeSystemTheme } from './theme-media'
import { applyVoteOverlay, type Theme, type VoteOverlay, resolvePageUrl } from './types'
import type { VoteEvent } from './vote-buttons.component'

type Status = 'loading' | 'ready' | 'error'

// Root widget: comment list + guest/authed form + vote toggle/clear.
// Voting needs the Better Auth cookie; cross-origin hosts must proxy
// /api/comments same-origin (reference API sends no ACAO-credentials).
@Component({
  selector: 'lc-comments',
  standalone: true,
  imports: [LcCommentFormComponent, LcCommentListComponent, LcCommentErrorComponent, LcCommentSkeletonsComponent],
  template: `
    <div class="lc-comments grid gap-4" [class.dark]="dark()" [style]="themeStyle()">
      @if (moderator() && pageLock(); as lock) {
        <div class="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">
          <span class="text-muted-foreground">
            {{ lock.locked ? 'Comments are locked on this page.' : 'Comments are open on this page.' }}
          </span>
          <button
            type="button"
            [disabled]="lockPending()"
            (click)="toggleLock()"
            class="ml-auto rounded-md border border-border px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
          >
            {{ lock.locked ? 'Unlock' : 'Lock' }}
          </button>
        </div>
      }
      @if (actionError(); as actionFailure) {
        <lc-comment-error
          [info]="actionFailure"
          [signInHref]="safeSignInUrl()"
          (retry)="load()"
          (signIn)="signInFromError()"
        />
      }
      <lc-comment-form
        [guest]="guest()"
        [turnstileSiteKey]="turnstileSiteKey()"
        [parentId]="null"
        [submitting]="posting()"
        [sessionPending]="sessionLoading()"
        [error]="formError()"
        (submitted)="onTopLevelSubmit($event)"
        (signIn)="signInFromError()"
      >
        <!-- One root node per block: NG8011 refuses to match the [lcSignIn] slot otherwise.
             Moderators post as themselves through the moderation endpoint, so the
             anonymous/account switcher does not apply and the block stays empty. -->
        <div lcSignIn class="flex min-w-0 items-center gap-2 text-sm">
          @if (!moderator()) {
            <span class="text-muted-foreground">Comment as</span>
            <div #identityMenu class="relative">
              <button
                type="button"
                aria-haspopup="menu"
                [attr.aria-expanded]="identityOpen()"
                [disabled]="sessionLoading() || signInPending() || signOutPending()"
                (click)="identityOpen.set(!identityOpen())"
                class="lc-identity-trigger inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                @if (sessionLoading()) {
                  <span class="block h-4 w-16 animate-pulse rounded bg-muted"></span>
                } @else {
                  <span class="max-w-[calc(var(--spacing)*40)] truncate">{{ identityLabel() }}</span>
                }
                <span aria-hidden="true">▾</span>
              </button>
              @if (identityOpen()) {
                <div
                  role="menu"
                  class="lc-identity-menu absolute left-0 mt-1 w-48 max-w-[calc(var(--spacing)*8)] rounded-lg border border-border bg-popover p-1 text-sm"
                >
                  <button
                    type="button"
                    role="menuitemradio"
                    [attr.aria-checked]="commentAs() === 'anonymous'"
                    (click)="selectIdentity('anonymous')"
                    class="lc-identity-item block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                  >
                    Anonymous
                  </button>
                  @if (signedIn()) {
                    <button
                      type="button"
                      role="menuitemradio"
                      [attr.aria-checked]="commentAs() === 'account'"
                      (click)="selectIdentity('account')"
                      class="lc-identity-item block w-full truncate rounded-md px-2 py-1.5 text-left hover:bg-accent"
                    >
                      {{ identityName() }} (you)
                    </button>
                  } @else if (safeSignInUrl(); as signInHref) {
                    <a
                      role="menuitem"
                      [href]="signInHref"
                      (click)="identityOpen.set(false)"
                      class="lc-identity-item block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                      >Sign in…</a
                    >
                  } @else {
                    <button
                      type="button"
                      role="menuitem"
                      [disabled]="signInPending()"
                      (click)="startOAuthSignIn()"
                      class="lc-identity-item block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
                    >
                      Sign in…
                    </button>
                  }
                  @if (session() !== null) {
                    <div role="separator" class="my-1 h-px bg-border"></div>
                    <button
                      type="button"
                      role="menuitem"
                      [disabled]="signOutPending()"
                      (click)="signOut()"
                      class="lc-identity-item block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
                    >
                      Sign out
                    </button>
                  }
                </div>
              }
            </div>
          }
        </div>
        @if (signInError(); as identityFailure) {
          <lc-comment-error
            lcSignIn
            [info]="identityFailure"
            [signInHref]="safeSignInUrl()"
            (retry)="retryIdentityFailure()"
            (signIn)="signInFromError()"
          />
        }
      </lc-comment-form>
      @if (status() === 'loading') {
        <lc-comment-skeletons [count]="3" />
      }
      @if (status() === 'error') {
        <lc-comment-error
          [info]="error()"
          [signInHref]="safeSignInUrl()"
          (retry)="load()"
          (signIn)="signInFromError()"
        />
      }
      @if (status() === 'ready' && roots().length === 0) {
        <section class="rounded-lg border border-border p-6 text-sm text-muted-foreground">No comments yet.</section>
      }
      @if (roots().length > 0 && pageRoots().length > 0) {
        <lc-comment-list
          [nodes]="pageRoots()"
          [guest]="guest()"
          [turnstileSiteKey]="turnstileSiteKey()"
          [viewerUserId]="viewerIdentity()"
          [viewerRole]="viewerRole()"
          [hideVotes]="votesHidden()"
          [pendingModeration]="pendingModeration()"
          [editWindowMinutes]="editWindowMinutes()"
          [replySubmitting]="posting()"
          [replyError]="formError()"
          [editSaving]="editing()"
          (vote)="onVote($event)"
          (reply)="onReply($event)"
          (edited)="onEdited($event)"
          (deleted)="onDeleted($event)"
          (moderate)="onModerate($event)"
          (blockUser)="onBlockUser($event)"
          (signIn)="signInFromError()"
        />
      }
      @if (loadingPage()) {
        <lc-comment-skeletons [count]="2" />
      }
      @if (displayPage() > 1 || hasMore() || roots().length > limit()) {
        <nav aria-label="Comments pagination" class="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button
            type="button"
            [disabled]="displayPage() === 1 || loadingPage()"
            (click)="previousPage()"
            class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            <span aria-hidden="true">&lsaquo;</span> Previous
          </button>
          <span class="text-muted-foreground"
            >Page
            <span aria-current="page" class="font-medium text-foreground">{{ displayPage() }}</span>
          </span>
          <button
            type="button"
            [disabled]="!hasNext() || loadingPage()"
            (click)="nextPage()"
            class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            Next <span aria-hidden="true">&rsaquo;</span>
          </button>
        </nav>
      }
    </div>
  `,
})
export class LcCommentsComponent {
  site = input.required<string>()
  baseUrl = input.required<string>()
  pageUrl = input<string | undefined>(undefined)
  // Host-known thread id: moderator mode then addresses this page directly
  // instead of matching `pageUrl` against the site's (capped) page list.
  pageId = input<string | undefined>(undefined)
  turnstileSiteKey = input<string | undefined>(undefined)
  limit = input(20)
  theme = input<Theme>('system')
  themeVars = input<WidgetTheme | undefined>(undefined)
  signInUrl = input<string | undefined>(undefined)
  viewerUserId = input<string | undefined>(undefined)
  viewerRole = input<ViewerRole | undefined>(undefined)
  editWindowMinutes = input<number>(DEFAULT_EDIT_WINDOW_MINUTES)
  fetchImpl = input<typeof fetch | undefined>(undefined)
  lazy = input(false)
  signIn = output<void>()
  // Fires after a successful moderation action, lock change or moderator post,
  // so a dashboard can refresh its own thread list (counts, lock badge).
  moderated = output<void>()

  readonly systemDark = prefersDark()
  dark = computed(() => (this.theme() === 'dark' ? true : this.theme() === 'light' ? false : this.systemDark()))
  themeStyle = computed<Record<string, string>>(() => themeVarsToStyle(this.themeVars(), this.dark()))
  safeSignInUrl = computed(() => safeUrl(this.signInUrl()))
  moderator = computed(() => canModerate(this.viewerRole()))
  // Only the page lock hides votes list-wide; single rows are handled by the
  // list component (voting is rejected on hidden/deleted comments).
  votesHidden = computed(() => this.moderator() && Boolean(this.pageLock()?.locked))
  session = signal<ViewerSession | null>(null)
  sessionStatus = signal<'loading' | 'ready'>('loading')
  sessionLoading = computed(() => this.sessionStatus() === 'loading')
  commentAs = signal<'account' | 'anonymous'>('account')
  identityOpen = signal(false)
  signedIn = computed(() => Boolean(this.session()) || Boolean(this.viewerUserId()))
  // Ownership/vote identity: the host-provided id wins, else the fetched session's.
  viewerIdentity = computed(() => this.viewerUserId() ?? this.session()?.userId)
  identityName = computed(() => this.session()?.name || 'Your account')
  identityLabel = computed(() =>
    this.commentAs() === 'anonymous' || !this.signedIn() ? 'Anonymous' : this.identityName(),
  )
  guest = computed(() => !this.signedIn() || this.commentAs() === 'anonymous')
  // Thread the moderator UI is pointed at: the `pageId` input, or the page the
  // URL matched. Rows and moderator posts both address it.
  threadPageId = signal<string | null>(null)
  comments = signal<Comment[]>([])
  // Votes land in an overlay over the cached tree: rebuilding the tree on each
  // vote would hand every row a fresh node object and defeat OnPush.
  votes = signal<VoteOverlay>({})
  baseRoots = computed<ThreadNode[]>(() => buildCommentTree(this.comments()))
  roots = computed<ThreadNode[]>(() => applyVoteOverlay(this.baseRoots(), this.votes()))
  // A page is a window over roots: pages over raw rows would either grow the
  // list (prefix) or split threads (replies without their parent).
  // shortcut: a reply created after the stream moved past its thread's page
  // stays hidden until more rows load — the list endpoint has no per-thread query.
  // A delete/edit shrinks the rows locally, so the current window can go empty
  // while the page state stays put: render the last page that still has roots
  // (derived, never fetched).
  displayPage = computed(() => {
    const length = this.roots().length
    let page = this.page()
    while (page > 1 && length <= (page - 1) * this.limit()) page -= 1
    return page
  })
  pageRoots = computed<ThreadNode[]>(() =>
    this.roots().slice((this.displayPage() - 1) * this.limit(), this.displayPage() * this.limit()),
  )
  hasNext = computed(() => this.roots().length > this.displayPage() * this.limit() || this.hasMore())
  page = signal(1)
  status = signal<Status>('loading')
  error = signal<ErrorInfo | null>(null)
  hasMore = signal(false)
  loadingPage = signal(false)
  posting = signal(false)
  formError = signal<ErrorInfo | null>(null)
  editing = signal(false)
  replyTo = signal<string | null>(null)
  pageLock = signal<{ pageId: string; locked: boolean } | null>(null)
  lockPending = signal(false)
  pendingModeration = signal<Record<string, boolean>>({})
  actionError = signal<ErrorInfo | null>(null)
  signInPending = signal(false)
  signInError = signal<ErrorInfo | null>(null)
  signOutPending = signal(false)
  identityMenu = viewChild<ElementRef<HTMLElement>>('identityMenu')
  // The composer keeps the draft on failure; the widget clears it after a save.
  composer = viewChild(LcCommentFormComponent)

  #client: LastCommentsClient | null = null
  #host = inject<ElementRef<HTMLElement>>(ElementRef)
  #destroyRef = inject(DestroyRef)
  // Load generation: a response from an older load never commits.
  #seq = 0

  constructor() {
    // The media query is a shared singleton; only system-themed instances join it.
    effect((onCleanup) => {
      if (this.theme() !== 'system') return
      onCleanup(subscribeSystemTheme())
    })
    // Below-the-fold embeds defer the first request until the root is near the
    // viewport; no IntersectionObserver (SSR/test) loads immediately.
    afterNextRender(() => {
      const cleanup = observeInView(
        this.#host.nativeElement,
        this.lazy(),
        typeof IntersectionObserver === 'undefined' ? undefined : IntersectionObserver,
        () => this.#start(),
      )
      if (cleanup) this.#destroyRef.onDestroy(cleanup)
    })
    // Menu dismissal listeners exist only while the menu is open, so idle page
    // clicks never mark the widget dirty.
    effect((onCleanup) => {
      if (!this.identityOpen() || typeof document === 'undefined') return
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.identityOpen.set(false)
      }
      const onClick = (event: MouseEvent) => {
        if (!this.identityMenu()?.nativeElement.contains(event.target as Node)) this.identityOpen.set(false)
      }
      document.addEventListener('keydown', onKey)
      document.addEventListener('click', onClick)
      onCleanup(() => {
        document.removeEventListener('keydown', onKey)
        document.removeEventListener('click', onClick)
      })
    })
  }

  #start(): void {
    void this.load()
    void this.loadSession()
  }

  // Best-effort: a signed-out (or unreachable) session just keeps the guest row.
  async loadSession(): Promise<void> {
    try {
      this.session.set(await fetchViewerSession({ baseUrl: this.baseUrl(), fetchImpl: this.fetchImpl() }))
    } catch {
      this.session.set(null)
    } finally {
      this.sessionStatus.set('ready')
    }
  }

  selectIdentity(value: 'account' | 'anonymous'): void {
    this.commentAs.set(value)
    this.identityOpen.set(false)
  }

  async signOut(): Promise<void> {
    this.signOutPending.set(true)
    this.signInError.set(null)
    try {
      await signOutViewerSession({ baseUrl: this.baseUrl(), fetchImpl: this.fetchImpl() })
      this.session.set(null)
      this.commentAs.set('anonymous')
    } catch (err) {
      this.signInError.set(describeError(err, { title: "Sign-out didn't work" }))
    } finally {
      this.signOutPending.set(false)
      this.identityOpen.set(false)
    }
  }

  client(): LastCommentsClient {
    if (!this.#client)
      this.#client = createClient({ baseUrl: this.baseUrl(), site: this.site(), fetchImpl: this.fetchImpl() })
    return this.#client
  }

  url(): string {
    return resolvePageUrl(this.pageUrl())
  }

  // better-auth's social sign-in endpoint is POST-only, so the guest row must
  // fetch the provider URL before navigating to it.
  async startOAuthSignIn(): Promise<void> {
    this.identityOpen.set(false)
    this.signInPending.set(true)
    this.signInError.set(null)
    try {
      const providerUrl = await beginOAuthSignIn({
        baseUrl: this.baseUrl(),
        pageUrl: this.url(),
        fetchImpl: this.fetchImpl(),
      })
      window.location.assign(providerUrl)
    } catch (err) {
      this.signInError.set(describeError(err, { title: "Sign-in didn't start" }))
    } finally {
      this.signInPending.set(false)
    }
  }

  // The error block's sign-in action: the identity menu's fallback chain.
  signInFromError(): void {
    const href = this.safeSignInUrl()
    if (href) window.location.assign(href)
    else {
      this.signIn.emit()
      void this.startOAuthSignIn()
    }
  }

  // The identity block offers one retry: sign-out retries sign-out, the rest start sign-in.
  retryIdentityFailure(): void {
    if (this.signInError()?.code === 'SIGN_OUT_FAILED') void this.signOut()
    else void this.startOAuthSignIn()
  }

  async load(): Promise<void> {
    const seq = ++this.#seq
    this.status.set('loading')
    this.error.set(null)
    this.actionError.set(null)
    this.page.set(1)
    try {
      const limit = this.limit()
      if (this.moderator()) {
        // Resolve this page from the site's page list, then read its thread
        // including hidden/deleted rows.
        // A host-supplied `pageId` wins over the URL match: the page list is
        // capped, so a match can miss on a busy site.
        const overview = await this.client().listModeration({ limit: 1 })
        if (seq !== this.#seq) return
        const normalized = normalizePageUrl(this.url())
        const hostPageId = this.pageId()
        const match = hostPageId
          ? (overview.pages.find((page) => page.id === hostPageId) ?? null)
          : (overview.pages.find((page) => normalizePageUrl(page.canonicalUrl) === normalized) ?? null)
        const threadId = hostPageId ?? match?.id ?? null
        // Unknown lock state stays unknown: the lock bar is hidden rather than
        // claiming the thread is open.
        this.pageLock.set(match ? { pageId: match.id, locked: match.isLocked } : null)
        this.threadPageId.set(threadId)
        if (!threadId) {
          this.comments.set([])
          this.votes.set({})
          this.hasMore.set(false)
          this.status.set('ready')
          return
        }
        const page = await this.client().listModeration({ pageId: threadId, limit, offset: 0 })
        if (seq !== this.#seq) return
        const rows = page.comments.map(moderationCommentToComment)
        this.comments.set(rows)
        this.votes.set({})
        this.hasMore.set(rows.length < page.total)
        await this.#fillModerationWindow(limit, limit, seq)
        if (seq !== this.#seq) return
        this.status.set('ready')
        return
      }
      // Fill the first thread window (pages: 1) before rendering it: replies
      // consume rows, so one `limit`-row fetch yields fewer than `limit` roots.
      const window = await loadThreadWindow({
        site: this.site(),
        baseUrl: this.baseUrl(),
        pageUrl: this.url(),
        limit,
        fetchImpl: this.fetchImpl(),
        pages: 1,
      })
      if (seq !== this.#seq) return
      this.comments.set(window.comments)
      this.votes.set({})
      this.hasMore.set(window.hasMore)
      this.status.set('ready')
    } catch (err) {
      if (seq !== this.#seq) return
      this.error.set(this.#loadFailure(err))
      this.status.set('error')
    }
  }

  // Copy comes from the shared table; only the moderation framing is widget-specific.
  #loadFailure(err: unknown): ErrorInfo {
    if (!this.moderator()) return describeError(err)
    if (err instanceof ApiError) return describeError(err, { title: 'Comments could not be loaded' })
    return describeError(err, {
      title: 'Moderation is unavailable',
      message: 'Moderation is only available when the comments API is served from this origin.',
    })
  }

  async nextPage(): Promise<void> {
    const seq = ++this.#seq
    const limit = this.limit()
    // Anchor on the clamped page: the page state can sit above the last
    // non-empty window after a delete emptied it.
    const page = this.displayPage()
    // Cache hit: the next root window is already loaded.
    if (this.roots().length > page * limit || !this.hasMore()) {
      this.page.set(page + 1)
      return
    }
    this.loadingPage.set(true)
    this.error.set(null)
    try {
      // Fill the window being ENTERED, not the one being left: a fetch returns
      // `limit` rows but a page shows `limit` roots, and replies eat rows.
      if (this.moderator()) {
        await this.#fillModerationWindow((page + 1) * limit, limit, seq)
      } else {
        const window = await loadThreadWindow({
          site: this.site(),
          baseUrl: this.baseUrl(),
          pageUrl: this.url(),
          limit,
          fetchImpl: this.fetchImpl(),
          pages: page + 1,
          existing: this.comments(),
        })
        if (seq !== this.#seq) return
        this.comments.set(window.comments)
        this.hasMore.set(window.hasMore)
      }
      if (seq !== this.#seq) return
      this.page.set(page + 1)
    } catch (err) {
      if (seq !== this.#seq) return
      this.error.set(describeError(err))
      this.status.set('error')
    } finally {
      this.loadingPage.set(false)
    }
  }

  // Moderation rows come from listModeration, which loadThreadWindow cannot
  // read; keep its own loop. Fetches `limit`-row batches until `target` roots
  // are loaded or the stream ends, recomputing roots on every pass.
  async #fillModerationWindow(target: number, limit: number, seq: number): Promise<void> {
    while (this.roots().length < target && this.hasMore()) {
      const before = this.comments().length
      const next = await this.client().listModeration({
        pageId: this.threadPageId() ?? undefined,
        limit,
        offset: before,
      })
      if (seq !== this.#seq) return
      const rows = next.comments.map(moderationCommentToComment)
      this.comments.set([...this.comments(), ...rows])
      this.hasMore.set(this.comments().length < next.total)
      // A page that added no rows can never fill the window: stop instead of
      // re-requesting the same offset forever.
      if (this.comments().length === before) {
        this.hasMore.set(false)
        break
      }
    }
  }

  // Cache-only: every earlier page's rows are already loaded.
  previousPage(): void {
    this.page.set(this.displayPage() - 1)
  }

  async submit(input: CommentSubmit, parentId: string | null): Promise<void> {
    this.posting.set(true)
    this.formError.set(null)
    try {
      // Moderators post through the moderation endpoint: the public create path
      // checks the site's origin allow-list, which a dashboard origin is not on.
      const threadId = this.threadPageId()
      const created =
        this.moderator() && threadId
          ? await this.client().createModerationComment({
              pageId: threadId,
              bodyMarkdown: input.body,
              ...(parentId ? { parentId } : {}),
            })
          : await this.client().postComment({
              url: this.url(),
              bodyMarkdown: input.body,
              // Guest posts never carry the session cookie (covers an unreachable session endpoint with a cookie present).
              anonymous: this.guest(),
              ...(parentId ? { parentId } : { title: typeof document !== 'undefined' ? document.title : undefined }),
              ...(input.authorName ? { authorName: input.authorName } : {}),
              ...(input.token ? { verificationToken: input.token } : {}),
            })
      this.comments.set([...this.comments(), created])
      this.replyTo.set(null)
      // Reply/edit drafts clear by unmounting with the rebuilt thread.
      if (parentId === null) this.composer()?.reset()
      if (this.status() !== 'ready') this.status.set('ready')
      if (this.moderator()) this.moderated.emit()
    } catch (err) {
      this.formError.set(describeError(err, { title: "Your comment wasn't posted" }))
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') this.signIn.emit()
    } finally {
      this.posting.set(false)
    }
  }

  onTopLevelSubmit(input: CommentSubmit): void {
    void this.submit(input, null)
  }

  onReply(event: { parentId: string; submit: CommentSubmit }): void {
    void this.submit(event.submit, event.parentId)
  }

  async onVote(event: VoteEvent): Promise<void> {
    this.actionError.set(null)
    try {
      // Moderators vote through the moderation endpoint: the public vote route
      // checks the site's origin allow-list, which a dashboard origin is not on.
      const vote = this.moderator()
        ? await this.client().setModerationVote({
            commentId: event.id,
            value: 'clear' in event ? null : event.value,
          })
        : 'clear' in event
          ? await this.client().clearVote(event.id)
          : await this.client().castVote(event.id, event.value)
      this.votes.set({ ...this.votes(), [event.id]: { score: vote.score, viewerVote: vote.viewerVote } })
    } catch (err) {
      this.actionError.set(describeError(err, { title: "Your vote wasn't saved" }))
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') this.signIn.emit()
    }
  }

  async onEdited(event: { id: string; submit: CommentSubmit }): Promise<void> {
    this.editing.set(true)
    this.actionError.set(null)
    try {
      // Moderators edit through the moderation endpoint for the same reason they
      // post through it: the public PATCH checks the site's origins.
      const updated = this.moderator()
        ? await this.client().editModerationComment({ commentId: event.id, bodyMarkdown: event.submit.body })
        : await this.client().editOwnComment({ commentId: event.id, bodyMarkdown: event.submit.body })
      this.comments.set(this.comments().map((c) => (c.id === event.id ? updated : c)))
    } catch (err) {
      // The editor closes on submit, so the failure belongs in the page-level block.
      this.actionError.set(describeError(err, { title: "Your edit wasn't saved" }))
    } finally {
      this.editing.set(false)
    }
  }

  async onDeleted(id: string): Promise<void> {
    this.actionError.set(null)
    try {
      await this.client().deleteOwnComment(id)
      this.comments.set(this.comments().filter((c) => c.id !== id))
    } catch (err) {
      this.actionError.set(describeError(err, { title: "Your comment wasn't deleted" }))
    }
  }

  async onModerate(event: { comment: Comment; action: ModerationAction }): Promise<void> {
    const id = event.comment.id
    this.pendingModeration.set({ ...this.pendingModeration(), [id]: true })
    this.actionError.set(null)
    try {
      const patch = await this.client().moderateComment({ commentId: id, action: event.action })
      this.comments.set(
        this.comments().map((c) => (c.id === id ? { ...c, status: patch.status, pinnedAt: patch.pinnedAt } : c)),
      )
      this.moderated.emit()
    } catch (err) {
      this.actionError.set(describeError(err, { title: 'That moderation action failed' }))
    } finally {
      this.pendingModeration.set({ ...this.pendingModeration(), [id]: false })
    }
  }

  async onBlockUser(event: { comment: Comment; blocked: boolean }): Promise<void> {
    const userId = event.comment.userId
    if (!userId) return
    const id = event.comment.id
    this.pendingModeration.set({ ...this.pendingModeration(), [id]: true })
    this.actionError.set(null)
    try {
      await this.client().setUserBlocked({ userId, blocked: event.blocked })
      this.comments.set(this.comments().map((c) => (c.userId === userId ? { ...c, userBlocked: event.blocked } : c)))
      this.moderated.emit()
    } catch (err) {
      this.actionError.set(describeError(err, { title: 'That moderation action failed' }))
    } finally {
      this.pendingModeration.set({ ...this.pendingModeration(), [id]: false })
    }
  }

  async toggleLock(): Promise<void> {
    const lock = this.pageLock()
    if (!lock) return
    this.lockPending.set(true)
    this.actionError.set(null)
    try {
      const next = await this.client().setPageLocked({ pageId: lock.pageId, locked: !lock.locked })
      this.pageLock.set({ pageId: next.id, locked: next.isLocked })
      this.moderated.emit()
    } catch (err) {
      this.actionError.set(describeError(err, { title: 'That moderation action failed' }))
    } finally {
      this.lockPending.set(false)
    }
  }
}
