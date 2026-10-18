import { CommonModule } from '@angular/common'
import {
  type AfterViewInit,
  Component,
  computed,
  ElementRef,
  effect,
  HostListener,
  inject,
  input,
  type OnDestroy,
  type OnInit,
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
import { type CommentSubmit, LcCommentFormComponent } from './comment-form.component'
import { LcCommentListComponent } from './comment-list.component'
import type { Theme } from './types'
import type { VoteEvent } from './vote-buttons.component'

type Status = 'loading' | 'ready' | 'error'

// Root widget: comment list + guest/authed form + vote toggle/clear.
// Voting needs the Better Auth cookie; cross-origin hosts must proxy
// /api/comments same-origin (reference API sends no ACAO-credentials).
@Component({
  selector: 'lc-comments',
  standalone: true,
  imports: [CommonModule, LcCommentFormComponent, LcCommentListComponent, LcCommentErrorComponent],
  template: `
    <div class="lc-comments grid gap-4" [class.dark]="dark()" [ngStyle]="themeStyle()">
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
        <!-- One root node per block: NG8011 refuses to match the [lcSignIn] slot otherwise. -->
        <div lcSignIn class="flex min-w-0 items-center gap-2 text-sm">
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
                <span class="max-w-[10rem] truncate">{{ identityLabel() }}</span>
              }
              <span aria-hidden="true">▾</span>
            </button>
            @if (identityOpen()) {
              <div
                role="menu"
                class="lc-identity-menu absolute left-0 z-10 mt-1 w-48 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-1 text-sm shadow-md"
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
        <div role="status" aria-busy="true" class="grid gap-3">
          <span class="sr-only">Loading comments…</span>
          <div class="grid gap-3" aria-hidden="true">
            @for (card of skeletonCards; track card) {
              <div class="rounded-lg border border-border p-4">
                <div class="flex items-center gap-3">
                  <div class="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted"></div>
                  <div class="h-4 w-32 animate-pulse rounded bg-muted"></div>
                </div>
                <div class="mt-3 space-y-2">
                  <div class="h-4 w-full animate-pulse rounded bg-muted"></div>
                  <div class="h-4 w-4/5 animate-pulse rounded bg-muted"></div>
                </div>
                <div class="mt-3 flex gap-2">
                  <div class="h-6 w-16 animate-pulse rounded bg-muted"></div>
                  <div class="h-6 w-20 animate-pulse rounded bg-muted"></div>
                </div>
              </div>
            }
          </div>
        </div>
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
          [hideVotes]="moderator()"
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
        <div role="status" aria-busy="true" class="grid gap-3">
          <span class="sr-only">Loading comments…</span>
          <div class="grid gap-3" aria-hidden="true">
            @for (card of pageSkeletonCards; track card) {
              <div class="rounded-lg border border-border p-4">
                <div class="flex items-center gap-3">
                  <div class="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted"></div>
                  <div class="h-4 w-32 animate-pulse rounded bg-muted"></div>
                </div>
                <div class="mt-3 space-y-2">
                  <div class="h-4 w-full animate-pulse rounded bg-muted"></div>
                  <div class="h-4 w-4/5 animate-pulse rounded bg-muted"></div>
                </div>
                <div class="mt-3 flex gap-2">
                  <div class="h-6 w-16 animate-pulse rounded bg-muted"></div>
                  <div class="h-6 w-20 animate-pulse rounded bg-muted"></div>
                </div>
              </div>
            }
          </div>
        </div>
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
export class LcCommentsComponent implements OnInit, AfterViewInit, OnDestroy {
  site = input.required<string>()
  baseUrl = input.required<string>()
  pageUrl = input<string | undefined>(undefined)
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

  dark = signal(false)
  themeStyle = computed<Record<string, string>>(() => themeVarsToStyle(this.themeVars(), this.dark()))
  safeSignInUrl = computed(() => safeUrl(this.signInUrl()))
  moderator = computed(() => canModerate(this.viewerRole()))
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
  comments = signal<Comment[]>([])
  roots = computed<ThreadNode[]>(() => buildCommentTree(this.comments()))
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
  // Skeleton card counts: 3 for the initial load, 2 for an in-flight page fetch.
  readonly skeletonCards = [0, 1, 2]
  readonly pageSkeletonCards = [0, 1]
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
  #observer: IntersectionObserver | null = null
  #media: MediaQueryList | null = null
  #mediaListener: ((event: MediaQueryListEvent) => void) | null = null

  constructor() {
    effect(() => {
      const mode = this.theme()
      if (this.#media && this.#mediaListener) this.#media.removeEventListener('change', this.#mediaListener)
      this.#media = null
      this.#mediaListener = null
      if (mode !== 'system' || typeof window === 'undefined') {
        this.dark.set(mode === 'dark')
        return
      }
      const query = window.matchMedia('(prefers-color-scheme: dark)')
      this.#media = query
      this.dark.set(query.matches)
      this.#mediaListener = (event: MediaQueryListEvent) => this.dark.set(event.matches)
      query.addEventListener('change', this.#mediaListener)
    })
  }

  ngOnInit(): void {
    if (!this.lazy()) this.#start()
  }

  // Below-the-fold embeds defer the first request until the root is near the
  // viewport; no IntersectionObserver (SSR/test) loads immediately.
  ngAfterViewInit(): void {
    if (!this.lazy()) return
    if (typeof IntersectionObserver === 'undefined') {
      this.#start()
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        this.#observer = null
        this.#start()
      },
      { rootMargin: '200px' },
    )
    this.#observer = observer
    observer.observe(this.#host.nativeElement)
  }

  ngOnDestroy(): void {
    this.#observer?.disconnect()
    if (this.#media && this.#mediaListener) this.#media.removeEventListener('change', this.#mediaListener)
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

  // Both listeners stay registered for the widget's lifetime; they no-op while the menu is closed.
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.identityOpen.set(false)
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.identityOpen() && !this.identityMenu()?.nativeElement.contains(event.target as Node))
      this.identityOpen.set(false)
  }

  client(): LastCommentsClient {
    if (!this.#client)
      this.#client = createClient({ baseUrl: this.baseUrl(), site: this.site(), fetchImpl: this.fetchImpl() })
    return this.#client
  }

  url(): string {
    return this.pageUrl() ?? window.location.href
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
    this.status.set('loading')
    this.error.set(null)
    this.actionError.set(null)
    this.page.set(1)
    try {
      const limit = this.limit()
      if (this.moderator()) {
        // Resolve this page from the site's page list, then read its thread
        // including hidden/deleted rows.
        const overview = await this.client().listModeration({ limit: 1 })
        const normalized = normalizePageUrl(this.url())
        const match = overview.pages.find((page) => normalizePageUrl(page.canonicalUrl) === normalized) ?? null
        this.pageLock.set(match ? { pageId: match.id, locked: match.isLocked } : null)
        if (!match) {
          this.comments.set([])
          this.hasMore.set(false)
          this.status.set('ready')
          return
        }
        const page = await this.client().listModeration({ pageId: match.id, limit, offset: 0 })
        const rows = page.comments.map(moderationCommentToComment)
        this.comments.set(rows)
        this.hasMore.set(rows.length < page.total)
        await this.#fillModerationWindow(limit, limit)
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
      this.comments.set(window.comments)
      this.hasMore.set(window.hasMore)
      this.status.set('ready')
    } catch (err) {
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
        await this.#fillModerationWindow((page + 1) * limit, limit)
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
        this.comments.set(window.comments)
        this.hasMore.set(window.hasMore)
      }
      this.page.set(page + 1)
    } catch (err) {
      this.error.set(describeError(err))
      this.status.set('error')
    } finally {
      this.loadingPage.set(false)
    }
  }

  // Moderation rows come from listModeration, which loadThreadWindow cannot
  // read; keep its own loop. Fetches `limit`-row batches until `target` roots
  // are loaded or the stream ends, recomputing roots on every pass.
  async #fillModerationWindow(target: number, limit: number): Promise<void> {
    while (this.roots().length < target && this.hasMore()) {
      const before = this.comments().length
      const next = await this.client().listModeration({
        pageId: this.pageLock()?.pageId,
        limit,
        offset: before,
      })
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
      const created = await this.client().postComment({
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
      const vote =
        'clear' in event ? await this.client().clearVote(event.id) : await this.client().castVote(event.id, event.value)
      this.comments.set(
        this.comments().map((c) => (c.id === event.id ? { ...c, score: vote.score, viewerVote: vote.viewerVote } : c)),
      )
    } catch (err) {
      this.actionError.set(describeError(err, { title: "Your vote wasn't saved" }))
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') this.signIn.emit()
    }
  }

  async onEdited(event: { id: string; submit: CommentSubmit }): Promise<void> {
    this.editing.set(true)
    this.actionError.set(null)
    try {
      const updated = await this.client().editOwnComment({ commentId: event.id, bodyMarkdown: event.submit.body })
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
    } catch (err) {
      this.actionError.set(describeError(err, { title: 'That moderation action failed' }))
    } finally {
      this.lockPending.set(false)
    }
  }
}
