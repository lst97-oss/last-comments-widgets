import { CdkConnectedOverlay, type ConnectedPosition, OverlayContainer } from '@angular/cdk/overlay'
import { LucideCheck, LucideChevronDown } from '@lucide/angular'
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  resource,
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
  describeError,
  type ErrorInfo,
  type CommentSettings,
  fetchCommentSettings,
  fetchViewerSession,
  gateFor,
  isCompleteSettings,
  resolveSettings,
  signInRequired,
  signInRequiredError,
  forgetEditKey,
  getEditKey,
  type LastCommentsClient,
  loadThreadWindow,
  type ModerationAction,
  moderationCommentToComment,
  normalizePageUrl,
  safeUrl,
  saveEditKey,
  signOutViewerSession,
  sortCommentRoots,
  takeSignInFailure,
  type ThreadNode,
  type ThreadSort,
  themeVarsToStyle,
  type ViewerRole,
  type ViewerSession,
  type WidgetTheme,
} from '@last-comments-widgets/client'
import { buttonClass } from './button-classes'
import { LcCommentErrorComponent } from './comment-error.component'
import { LcSignInPromptComponent } from './sign-in-prompt.component'
import { LcCommentSkeletonsComponent } from './comment-skeletons.component'
import { type CommentSubmit, LcCommentFormComponent } from './comment-form.component'
import { LcCommentListComponent, type CommentSubmitHandler } from './comment-list.component'
import { observeInView } from './observe-in-view'
import { LcWidgetOverlayContainer } from './overlay-container'
import { prefersDark, subscribeSystemTheme } from './theme-media'
import { threadSignature } from './thread-guides'
import { LcThreadSortToggleComponent } from './thread-sort-toggle.component'
import {
  type ActionMode,
  applyVoteOverlay,
  type Theme,
  type TurnstileOptions,
  type VoteOverlay,
  resolvePageUrl,
} from './types'
import type { VoteEvent } from './vote-buttons.component'

type Status = 'loading' | 'ready' | 'error'

// One load of the thread: rows, paging tail, and the moderator context the
// mutation paths address.
type RootLoad = {
  comments: Comment[]
  hasMore: boolean
  pageLock: { pageId: string; locked: boolean } | null
  threadPageId: string | null
}

type LoadParams = {
  site: string
  baseUrl: string
  pageUrl: string | undefined
  pageId: string | undefined
  limit: number
  moderator: boolean
  fetchImpl: typeof fetch | undefined
  // False when the site asks a visitor to sign in before reading.
  readAllowed: boolean
}

// Identity menu classes: the same strings the React DropdownMenu primitives emit.
const IDENTITY_MENU_CLASS =
  'lc-identity-menu z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10 outline-none left-0 max-w-[calc(100vw-2rem)]'
const IDENTITY_RADIO_CLASS =
  "lc-identity-item relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
const IDENTITY_ITEM_CLASS =
  "lc-identity-item group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive"
const IDENTITY_INDICATOR_CLASS = 'pointer-events-none absolute right-2 flex items-center justify-center'

/**
 * Root comment widget (`<lc-comments>`): list, composer, replies, votes, paging
 * and inline moderation. A `private` site renders one sign-in card instead of
 * the thread.
 *
 * Import `@lst97-oss/last-comments-widgets/angular/styles.css` once and route
 * `/api/*` through a same-origin proxy: the API sends no
 * `Access-Control-Allow-Credentials`, and voting needs the session cookie.
 */
@Component({
  selector: 'lc-comments',
  imports: [
    CdkConnectedOverlay,
    LcCommentFormComponent,
    LcCommentListComponent,
    LcCommentErrorComponent,
    LcSignInPromptComponent,
    LcCommentSkeletonsComponent,
    LcThreadSortToggleComponent,
    LucideCheck,
    LucideChevronDown,
  ],
  // Menus portal into the themed root, not <body>.
  providers: [{ provide: OverlayContainer, useClass: LcWidgetOverlayContainer }],
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
        @if (actionFailure.action === 'sign-in') {
          <lc-sign-in-prompt
            [info]="actionFailure"
            context="vote"
            [signInHref]="safeSignInUrl()"
            (signIn)="signInFromError()"
          />
        } @else {
          <lc-comment-error
            [info]="actionFailure"
            [signInHref]="safeSignInUrl()"
            (retry)="load()"
            (signIn)="signInFromError()"
          />
        }
      }
      <!-- A private site shows one sign-in card, in the list slot below: no composer card here. -->
      @if (showComposer() && readGate() !== 'sign-in') {
        <lc-comment-form
          [guest]="guest()"
          [turnstileSiteKey]="policy().turnstileSiteKey ?? undefined"
          [dark]="dark()"
          [turnstileOptions]="turnstileOptions()"
          [parentId]="null"
          [submitting]="posting()"
          [sessionPending]="sessionLoading()"
          [error]="formError()"
          [bodyLimit]="policy().bodyLimit"
          [math]="math()"
          [mermaid]="mermaid()"
          [codeHighlight]="codeHighlight()"
          (submitted)="onTopLevelSubmit($event)"
          (signIn)="signInFromError()"
        >
          <!-- One root node per block: NG8011 refuses to match the [lcSignIn] slot otherwise.
             Moderators post as themselves through the moderation endpoint, so the
             anonymous/account switcher does not apply and the block stays empty. -->
          <div lcSignIn class="flex min-w-0 items-center gap-2 text-sm">
            @if (!moderator()) {
              <span class="text-xs text-muted-foreground">Comment as</span>
              <button
                #identityOrigin
                type="button"
                aria-haspopup="menu"
                [attr.aria-expanded]="identityOpen()"
                [disabled]="sessionLoading() || signInPending() || signOutPending()"
                (click)="identityOpen.set(!identityOpen())"
                [class]="identityTriggerClass"
              >
                @if (sessionLoading()) {
                  <span class="block h-4 w-16 animate-pulse rounded bg-muted"></span>
                } @else {
                  <span class="label max-w-[10rem] truncate">{{ identityLabel() }}</span>
                }
                <svg lucideChevronDown aria-hidden="true"></svg>
              </button>
              <ng-template
                cdkConnectedOverlay
                [cdkConnectedOverlayOrigin]="identityOrigin"
                [cdkConnectedOverlayOpen]="identityOpen()"
                [cdkConnectedOverlayPositions]="identityPositions"
                (detach)="identityOpen.set(false)"
                (overlayOutsideClick)="identityOpen.set(false)"
              >
                <div role="menu" [class]="identityMenuClass">
                  <div role="group">
                    @if (policy().access === 'open') {
                      <div
                        role="menuitemradio"
                        tabindex="-1"
                        [attr.aria-checked]="commentAs() === 'anonymous'"
                        (click)="selectIdentity('anonymous')"
                        (keydown.enter)="selectIdentity('anonymous')"
                        (keydown.space)="selectIdentity('anonymous'); $event.preventDefault()"
                        [class]="identityRadioClass"
                      >
                        <span [class]="identityIndicatorClass">
                          @if (commentAs() === 'anonymous') {
                            <svg lucideCheck aria-hidden="true"></svg>
                          }
                        </span>
                        Anonymous
                      </div>
                    }
                    @if (signedIn()) {
                      <div
                        role="menuitemradio"
                        tabindex="-1"
                        [attr.aria-checked]="commentAs() === 'account'"
                        (click)="selectIdentity('account')"
                        (keydown.enter)="selectIdentity('account')"
                        (keydown.space)="selectIdentity('account'); $event.preventDefault()"
                        [class]="identityRadioClass"
                      >
                        <span [class]="identityIndicatorClass">
                          @if (commentAs() === 'account') {
                            <svg lucideCheck aria-hidden="true"></svg>
                          }
                        </span>
                        {{ identityName() }} (you)
                      </div>
                    } @else if (safeSignInUrl(); as signInHref) {
                      <a
                        role="menuitem"
                        [href]="signInHref"
                        (click)="identityOpen.set(false)"
                        [class]="identityItemClass"
                        >Sign in…</a
                      >
                    } @else {
                      <div
                        role="menuitem"
                        tabindex="-1"
                        (click)="startOAuthSignIn()"
                        (keydown.enter)="startOAuthSignIn()"
                        (keydown.space)="startOAuthSignIn(); $event.preventDefault()"
                        [class]="identityItemClass"
                      >
                        Sign in…
                      </div>
                    }
                  </div>
                  @if (session() !== null) {
                    <div role="separator" class="-mx-1 my-1 h-px bg-border"></div>
                    <div
                      role="menuitem"
                      tabindex="-1"
                      (click)="signOut()"
                      (keydown.enter)="signOut()"
                      (keydown.space)="signOut(); $event.preventDefault()"
                      [class]="identityItemClass"
                    >
                      Sign out
                    </div>
                  }
                </div>
              </ng-template>
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
      } @else if (readGate() !== 'sign-in') {
        <lc-sign-in-prompt
          [info]="signInWriteInfo"
          context="write"
          [signInHref]="safeSignInUrl()"
          (signIn)="signInFromError()"
        />
      }
      @if (status() !== 'error' && roots().length > 0) {
        <lc-thread-sort-toggle [value]="sort()" (sortChange)="changeSort($event)" />
      }
      @if (status() === 'loading') {
        <lc-comment-skeletons [count]="3" />
      }
      @if (status() === 'error' && error(); as loadFailure) {
        @if (loadFailure.action === 'sign-in') {
          <lc-sign-in-prompt
            [info]="loadFailure"
            context="read"
            [signInHref]="safeSignInUrl()"
            (signIn)="signInFromError()"
          />
        } @else {
          <lc-comment-error
            [info]="loadFailure"
            [signInHref]="safeSignInUrl()"
            (retry)="load()"
            (signIn)="signInFromError()"
          />
        }
      }
      @if (status() === 'ready' && roots().length === 0) {
        <section class="rounded-lg border border-border p-6 text-sm text-muted-foreground">No comments yet.</section>
      }
      @if (pageRoots().length > 0) {
        <lc-comment-list
          [nodes]="pageRoots()"
          [guest]="guest()"
          [turnstileSiteKey]="policy().turnstileSiteKey ?? undefined"
          [dark]="dark()"
          [turnstileOptions]="turnstileOptions()"
          [viewerUserId]="viewerIdentity()"
          [viewerRole]="viewerRole()"
          [hideVotes]="votesHidden()"
          [pendingModeration]="pendingModeration()"
          [writeAllowed]="writeAllowed()"
          [anonWindowMinutes]="policy().anonEditWindowMinutes"
          [actionMode]="actionMode()"
          [bodyLimit]="policy().bodyLimit"
          [math]="math()"
          [mermaid]="mermaid()"
          [codeHighlight]="codeHighlight()"
          [replyTo]="replyTo()"
          [editComment]="submitEdit"
          [replyComment]="submitReply"
          [measureKey]="measureKey()"
          (vote)="onVote($event)"
          (deleted)="onDeleted($event)"
          (moderate)="onModerate($event)"
          (blockUser)="onBlockUser($event)"
          (openReply)="replyTo.set($event)"
          (closeReply)="replyTo.set(null)"
          (signIn)="signInFromError()"
        />
      }
      @if (loadingPage()) {
        <lc-comment-skeletons [count]="2" />
      }
      @if (page() > 1 || hasMore() || roots().length > limit()) {
        <nav aria-label="Comments pagination" class="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button
            type="button"
            [disabled]="page() === 1 || loadingPage()"
            (click)="previousPage()"
            class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            <span aria-hidden="true">&lsaquo;</span> Previous
          </button>
          <span class="text-muted-foreground"
            >Page
            <span aria-current="page" class="font-medium text-foreground">{{ page() }}</span>
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
    </div>
  `,
})
export class LcCommentsComponent {
  /** Site key the last-comments server registered for this host. */
  site = input.required<string>()
  /** Origin of the last-comments server; `/api/*` on it must be same-origin (see the class note). */
  baseUrl = input.required<string>()
  /** Thread identity; defaults to `window.location.href`. */
  pageUrl = input<string | undefined>(undefined)
  /**
   * Host-known thread id: moderator mode then addresses this page directly
   * instead of matching `pageUrl` against the site's (capped) page list.
   */
  pageId = input<string | undefined>(undefined)
  /** Public Cloudflare Turnstile key for guest posting; without it guests solve no challenge. */
  turnstileSiteKey = input<string | undefined>(undefined)
  /** Cloudflare's supported design knobs for the challenge. */
  turnstileOptions = input<TurnstileOptions | undefined>(undefined)
  /** Top-level threads per page (default 20); a thread's replies come with it. */
  limit = input(20)
  /** `'system'` (default) follows the OS preference. */
  theme = input<Theme>('system')
  /** Per-instance design-token overrides; see `WidgetTheme`. */
  themeVars = input<WidgetTheme | undefined>(undefined)
  /**
   * Host-owned sign-in page for `login`/`private` sites. Without it the widget
   * starts the API's OAuth flow in place.
   */
  signInUrl = input<string | undefined>(undefined)
  /** Fallback viewer identity when the session probe cannot answer (no same-origin proxy). */
  viewerUserId = input<string | undefined>(undefined)
  /** `'admin'` turns on the moderation UI; the server authorizes every call. */
  viewerRole = input<ViewerRole | undefined>(undefined)
  /**
   * Guest-authored comments may be edited for this many minutes from this
   * browser (default 10; 0 = unlimited). Signed-in authors have no window.
   */
  anonEditWindowMinutes = input<number | undefined>(undefined)
  /** Reply/Edit/Delete (and moderator) action rendering, default `'icon-text'`. */
  actionMode = input<ActionMode>('icon-text')
  /** Max body characters, counted before trimming. Overrides the site's own limit when set. */
  bodyLimit = input<number | undefined>(undefined)
  /** The site's public policy. Anything given here wins over the public settings endpoint. */
  settings = input<Partial<CommentSettings> | undefined>(undefined)
  /** Custom fetch, e.g. one that rewrites requests to a same-origin proxy. */
  fetchImpl = input<typeof fetch | undefined>(undefined)
  /** Embed below the fold: hold the first fetch until the widget nears the viewport. */
  lazy = input(false)
  /** Render `$…$` / `$$…$$` with KaTeX (lazy; off by default). */
  math = input(false)
  /** Render ```mermaid fences as diagrams (lazy; off by default). */
  mermaid = input(false)
  /** Syntax highlighting for fenced code (lazy; on by default; React only today). */
  codeHighlight = input(true)
  /** Fires before the widget starts the OAuth flow; `signInUrl` navigates instead. */
  signIn = output<void>()
  /**
   * Fires after a successful moderation action, lock change or moderator post,
   * so a dashboard can refresh its own thread list (counts, lock badge).
   */
  moderated = output<void>()

  readonly systemDark = prefersDark()
  dark = computed(() => (this.theme() === 'dark' ? true : this.theme() === 'light' ? false : this.systemDark()))
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
  // Opened by the viewport gate: a below-the-fold embed reads nothing until it nears the viewport.
  readonly #viewportOpen = signal(false)
  // The public policy, read once per site (fetchCommentSettings caches it for a minute).
  readonly settingsRes = resource<
    CommentSettings | null,
    { baseUrl: string; site: string; fetchImpl: typeof fetch | undefined } | undefined
  >({
    params: () =>
      this.#viewportOpen() && !isCompleteSettings(this.settings())
        ? { baseUrl: this.baseUrl(), site: this.site(), fetchImpl: this.fetchImpl() }
        : undefined,
    loader: ({ params }) => fetchCommentSettings(params),
  })
  // Known once the host's complete `settings` is in hand, or the fetched document has settled.
  readonly settingsReady = computed(
    () => isCompleteSettings(this.settings()) || this.settingsRes.status() === 'resolved',
  )
  readonly policy = computed(() =>
    resolveSettings(
      {
        bodyLimit: this.bodyLimit(),
        anonEditWindowMinutes: this.anonEditWindowMinutes(),
        turnstileSiteKey: this.turnstileSiteKey(),
      },
      this.settings(),
      this.settingsRes.value() ?? null,
    ),
  )
  readonly gateSignedIn = computed(() => this.signedIn() || this.moderator())
  readonly readGate = computed(() => gateFor(this.policy().access, 'read', this.gateSignedIn()))
  readonly writeAllowed = computed(() => gateFor(this.policy().access, 'write', this.gateSignedIn()) === 'allow')
  // A locked site waits for the identity probe before it asks anyone to sign in.
  readonly identityPending = computed(() => this.sessionLoading() && this.policy().access !== 'open')
  readonly showComposer = computed(() => !this.settingsReady() || this.identityPending() || this.writeAllowed())
  readonly signInWriteInfo = signInRequired('write')
  guest = computed(() => !this.signedIn() || (this.commentAs() === 'anonymous' && this.policy().access === 'open'))
  sort = signal<ThreadSort>('newest')
  replyTo = signal<string | null>(null)
  posting = signal(false)
  formError = signal<ErrorInfo | null>(null)
  lockPending = signal(false)
  pendingModeration = signal<Record<string, boolean>>({})
  actionError = signal<ErrorInfo | null>(null)
  signInPending = signal(false)
  signInError = signal<ErrorInfo | null>(null)
  signOutPending = signal(false)
  loadingPage = signal(false)
  // The identity menu portals into the widget root, like the React DropdownMenu.
  readonly identityTriggerClass = `${buttonClass('outline', 'sm')} lc-identity-trigger`
  readonly identityMenuClass = IDENTITY_MENU_CLASS
  readonly identityRadioClass = IDENTITY_RADIO_CLASS
  readonly identityItemClass = IDENTITY_ITEM_CLASS
  readonly identityIndicatorClass = IDENTITY_INDICATOR_CLASS
  readonly identityPositions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  ]
  // The composer keeps the draft on failure; the widget clears it after a save.
  composer = viewChild(LcCommentFormComponent)

  // The root request is a resource: a prop flip cancels the superseded load, and
  // its value identity is what resets the local row cache and the page.
  readonly root = resource<RootLoad, LoadParams | undefined>({
    // Held until the policy is known and, on a locked site, the identity has settled.
    params: (): LoadParams | undefined => {
      if (!this.settingsReady() || this.identityPending()) return undefined
      return {
        site: this.site(),
        baseUrl: this.baseUrl(),
        pageUrl: this.pageUrl(),
        pageId: this.pageId(),
        limit: this.limit(),
        moderator: this.moderator(),
        fetchImpl: this.fetchImpl(),
        readAllowed: this.readGate() === 'allow',
      }
    },
    loader: ({ params, abortSignal }) => this.#load(params, abortSignal),
  })
  readonly status = computed<Status>(() => {
    const status = this.root.status()
    if (status === 'error') return 'error'
    return status === 'resolved' || status === 'local' ? 'ready' : 'loading'
  })
  readonly error = computed(() => {
    const failure = this.root.error()
    return failure ? this.#loadFailure(failure) : null
  })
  // A failed load has no value, and reading one throws: the row state reads it only when there is one.
  readonly rootValue = computed(() => (this.root.hasValue() ? this.root.value() : undefined))
  // Row cache: rewritten in place by posts/edits/deletes, reset by a fresh load.
  readonly comments = linkedSignal<RootLoad | undefined, Comment[]>({
    source: () => this.rootValue(),
    computation: (value) => value?.comments ?? [],
  })
  readonly hasMore = linkedSignal<RootLoad | undefined, boolean>({
    source: () => this.rootValue(),
    computation: (value) => value?.hasMore ?? false,
  })
  // A reload fetches authoritative scores, so its value identity drops stale patches.
  readonly votes = linkedSignal<RootLoad | undefined, VoteOverlay>({
    source: () => this.rootValue(),
    computation: (): VoteOverlay => ({}),
  })
  readonly pageLock = linkedSignal<RootLoad | undefined, { pageId: string; locked: boolean } | null>({
    source: () => this.rootValue(),
    computation: (value) => value?.pageLock ?? null,
  })
  // Thread the moderator UI is pointed at: the `pageId` input, or the page the
  // URL matched. Rows and moderator posts both address it.
  readonly threadPageId = computed(() => this.rootValue()?.threadPageId ?? null)
  // Votes land in an overlay over the cached tree: rebuilding the tree on each
  // vote would hand every row a fresh node object.
  readonly roots = computed<ThreadNode[]>(() =>
    sortCommentRoots(applyVoteOverlay(buildCommentTree(this.comments()), this.votes()), this.sort()),
  )
  // A page is a window over roots: pages over raw rows would either grow the
  // list (prefix) or split threads (replies without their parent).
  // shortcut: a reply created after the stream moved past its thread's page
  // stays hidden until more rows load — the list endpoint has no per-thread query.
  // A delete/edit shrinks the rows locally, so the current window can go empty
  // while the page state stays put: clamp to the last page that still has roots.
  readonly page = linkedSignal<{ loaded: RootLoad | undefined; roots: number; limit: number }, number>({
    source: () => ({ loaded: this.rootValue(), roots: this.roots().length, limit: this.limit() }),
    computation: ({ loaded, roots, limit }, previous) => {
      const requested = previous && previous.source.loaded === loaded ? previous.value : 1
      return Math.min(requested, Math.max(1, Math.ceil(roots / limit)))
    },
  })
  readonly pageRoots = computed<ThreadNode[]>(() =>
    this.roots().slice((this.page() - 1) * this.limit(), this.page() * this.limit()),
  )
  readonly hasNext = computed(() => this.roots().length > this.page() * this.limit() || this.hasMore())
  // New window, sort order or row order re-measures the rails.
  readonly measureKey = computed(() => `${this.page()}:${this.sort()}:${threadSignature(this.pageRoots())}`)
  // Only the page lock hides votes list-wide; single rows are handled by the
  // list component (voting is rejected on hidden/deleted comments).
  votesHidden = computed(() => !this.policy().features.votes || (this.moderator() && Boolean(this.pageLock()?.locked)))

  #host = inject<ElementRef<HTMLElement>>(ElementRef)
  #destroyRef = inject(DestroyRef)

  constructor() {
    // The media query is a shared singleton; only system-themed instances join it.
    effect((onCleanup) => {
      if (this.theme() !== 'system') return
      onCleanup(subscribeSystemTheme())
    })
    // A sign-in the provider rejected returns here with a failure marker. Explain it
    // once in the identity control, then drop the marker so a reload does not repeat it.
    afterNextRender(() => {
      const failure = takeSignInFailure(window.location.href)
      if (!failure) return
      this.signInError.set(failure.info)
      window.history.replaceState(window.history.state, '', failure.cleanHref)
    })
    // Below-the-fold embeds defer the first request until the root is near the
    // viewport; no IntersectionObserver (SSR/test) loads immediately.
    afterNextRender(() => {
      const cleanup = observeInView(
        this.#host.nativeElement,
        this.lazy(),
        typeof IntersectionObserver === 'undefined' ? undefined : IntersectionObserver,
        () => {
          this.#viewportOpen.set(true)
          void this.loadSession()
        },
      )
      if (cleanup) this.#destroyRef.onDestroy(cleanup)
    })
    // The overlay dismisses itself on an outside click; Escape needs a listener
    // because focus can still sit on the trigger.
    effect((onCleanup) => {
      if (!this.identityOpen() || typeof document === 'undefined') return
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.identityOpen.set(false)
      }
      document.addEventListener('keydown', onKey)
      onCleanup(() => document.removeEventListener('keydown', onKey))
    })
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

  // Copy comes from the shared table; only the moderation framing is widget-specific.
  #loadFailure(err: unknown): ErrorInfo {
    if (!this.moderator()) return describeError(err)
    if (err instanceof ApiError) return describeError(err, { title: 'Comments could not be loaded' })
    return describeError(err, {
      title: 'Moderation is unavailable',
      message: 'Moderation is only available when the comments API is served from this origin.',
    })
  }

  async #load(params: LoadParams, abortSignal: AbortSignal): Promise<RootLoad> {
    // A gated visitor gets the refusal the server would send, before any list request.
    if (!params.readAllowed) throw signInRequiredError('read')
    const client = createClient({ baseUrl: params.baseUrl, site: params.site, fetchImpl: params.fetchImpl })
    const pageUrl = resolvePageUrl(params.pageUrl)
    if (!params.moderator) {
      // Fill the first thread window (pages: 1) before rendering it: replies
      // consume rows, so one `limit`-row fetch yields fewer than `limit` roots.
      const window = await loadThreadWindow({
        site: params.site,
        baseUrl: params.baseUrl,
        pageUrl,
        limit: params.limit,
        fetchImpl: params.fetchImpl,
        pages: 1,
      })
      return { comments: window.comments, hasMore: window.hasMore, pageLock: null, threadPageId: null }
    }
    // Resolve this page from the site's page list, then read its thread
    // including hidden/deleted rows. A host-supplied `pageId` wins: the page
    // list is capped, so a URL match can miss.
    const overview = await client.listModeration({ limit: 1 })
    const normalized = normalizePageUrl(pageUrl)
    const match = params.pageId
      ? (overview.pages.find((page) => page.id === params.pageId) ?? null)
      : (overview.pages.find((page) => normalizePageUrl(page.canonicalUrl) === normalized) ?? null)
    const threadPageId = params.pageId ?? match?.id ?? null
    // Unknown lock state stays unknown: the lock bar is hidden rather than
    // claiming the thread is open.
    const pageLock = match ? { pageId: match.id, locked: match.isLocked } : null
    if (!threadPageId) return { comments: [], hasMore: false, pageLock, threadPageId: null }
    const page = await client.listModeration({ pageId: threadPageId, limit: params.limit, offset: 0 })
    const rows = page.comments.map(moderationCommentToComment)
    let hasMore = rows.length < page.total
    // Replies consume rows, so one limit-row fetch can yield fewer than `limit`
    // roots: fill window 1 before rendering it.
    while (hasMore && buildCommentTree(rows).length < params.limit) {
      if (abortSignal.aborted) break
      const next = await client.listModeration({ pageId: threadPageId, limit: params.limit, offset: rows.length })
      const batch = next.comments.map(moderationCommentToComment)
      if (batch.length === 0) break
      rows.push(...batch)
      hasMore = rows.length < next.total
    }
    return { comments: rows, hasMore, pageLock, threadPageId }
  }

  client(): LastCommentsClient {
    return createClient({ baseUrl: this.baseUrl(), site: this.site(), fetchImpl: this.fetchImpl() })
  }

  url(): string {
    return resolvePageUrl(this.pageUrl())
  }

  // Retry: a fresh load replaces the cached rows and resets the page.
  load(): void {
    this.actionError.set(null)
    this.root.reload()
  }

  changeSort(next: ThreadSort): void {
    this.sort.set(next)
    // Window boundaries follow the new order, so start from its first page.
    this.page.set(1)
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

  async nextPage(): Promise<void> {
    const limit = this.limit()
    // Anchor on the clamped page: the page state can sit above the last
    // non-empty window after a delete emptied it.
    const page = this.page()
    // Cache hit: the next root window is already loaded.
    if (this.roots().length > page * limit || !this.hasMore()) {
      this.page.set(page + 1)
      return
    }
    this.loadingPage.set(true)
    this.actionError.set(null)
    try {
      // Fill the window being ENTERED, not the one being left: a fetch returns
      // `limit` rows but a page shows `limit` roots, and replies eat rows.
      if (this.moderator()) {
        await this.#fillModerationWindow((page + 1) * limit)
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
      this.actionError.set(describeError(err, { title: 'Failed to load more comments' }))
    } finally {
      this.loadingPage.set(false)
    }
  }

  // Moderation rows come from listModeration, which loadThreadWindow cannot
  // read; keep its own loop. Fetches `limit`-row batches until `target` roots
  // are loaded or the stream ends, recomputing roots on every pass.
  async #fillModerationWindow(target: number): Promise<void> {
    const limit = this.limit()
    const threadPageId = this.threadPageId()
    while (this.roots().length < target && this.hasMore()) {
      const before = this.comments().length
      const next = await this.client().listModeration({ pageId: threadPageId ?? undefined, limit, offset: before })
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
    this.page.set(this.page() - 1)
  }

  // Shared create path: head comments and inline replies differ only in the
  // parent, so the moderation/origin branching lives here once.
  async #post(input: CommentSubmit, parentId: string | null): Promise<Comment> {
    const bodyMarkdown = input.body.trim()
    const threadPageId = this.threadPageId()
    // Moderators post through the moderation endpoint: the public create path
    // checks the site's origin allow-list, which a dashboard origin is not on.
    const created =
      this.moderator() && threadPageId
        ? await this.client().createModerationComment({
            pageId: threadPageId,
            bodyMarkdown,
            ...(parentId ? { parentId } : {}),
          })
        : await this.client().postComment({
            url: this.url(),
            bodyMarkdown,
            // Guest posts never carry the session cookie (covers an unreachable session endpoint with a cookie present).
            anonymous: this.guest(),
            ...(parentId ? { parentId } : { title: typeof document !== 'undefined' ? document.title : undefined }),
            ...(input.authorName ? { authorName: input.authorName } : {}),
            ...(input.token ? { verificationToken: input.token } : {}),
          })
    // The create routes return the raw row, which has no computed score; without
    // the neutral fields a `best` sort would compare NaNs.
    const normalized = { ...created, score: created.score ?? 0, viewerVote: created.viewerVote ?? null }
    // The server returns the guest edit key exactly once.
    if (normalized.editKey) saveEditKey(normalized.id, normalized.editKey)
    return normalized
  }

  async onTopLevelSubmit(input: CommentSubmit): Promise<void> {
    // The in-flight lock: a second click must not post the same comment twice.
    if (this.posting()) return
    this.posting.set(true)
    this.formError.set(null)
    try {
      const created = await this.#post(input, null)
      this.comments.set([...this.comments(), created])
      this.page.set(1)
      this.replyTo.set(null)
      // The head composer clears by resetting its own draft.
      this.composer()?.reset()
      if (this.moderator()) this.moderated.emit()
    } catch (err) {
      this.formError.set(describeError(err, { title: "Your comment wasn't posted" }))
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') this.signIn.emit()
    } finally {
      this.posting.set(false)
    }
  }

  // The inline reply slot owns its pending/error state, so failures return to
  // the item instead of the page-level composer block.
  readonly submitReply: CommentSubmitHandler = async (commentId, input) => {
    if (input.body.trim().length === 0) {
      return { code: null, title: "Your reply wasn't posted", message: 'Please write a reply first.', action: 'none' }
    }
    try {
      const created = await this.#post(input, commentId)
      this.comments.set([...this.comments(), created])
      this.page.set(1)
      this.replyTo.set(null)
      if (this.moderator()) this.moderated.emit()
      return null
    } catch (err) {
      return describeError(err, { title: "Your reply wasn't posted" })
    }
  }

  // The item keeps the editor (and its draft) open on failure, so the page-level
  // action block must stay out of the edit path.
  readonly submitEdit: CommentSubmitHandler = async (commentId, input) => {
    this.actionError.set(null)
    try {
      // Moderators edit through the moderation endpoint for the same reason
      // they post through it: the public PATCH checks the site's origins.
      const editKey = this.moderator() ? null : getEditKey(commentId)
      const updated = this.moderator()
        ? await this.client().editModerationComment({ commentId, bodyMarkdown: input.body })
        : await this.client().editOwnComment({
            commentId,
            bodyMarkdown: input.body,
            ...(editKey ? { editKey } : {}),
          })
      this.comments.set(
        this.comments().map((c) =>
          c.id === commentId
            ? { ...c, ...updated, score: updated.score ?? c.score, viewerVote: updated.viewerVote ?? c.viewerVote }
            : c,
        ),
      )
      return null
    } catch (err) {
      return describeError(err, { title: "Your edit wasn't saved" })
    }
  }

  async onVote(event: VoteEvent): Promise<void> {
    this.actionError.set(null)
    // Votes need a signed-in session: a guest is told so, rather than sent a request that is refused.
    if (!this.gateSignedIn()) {
      this.actionError.set(signInRequired('vote'))
      return
    }
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

  async onDeleted(id: string): Promise<void> {
    this.actionError.set(null)
    try {
      // A guest proves ownership with the edit key kept in this browser; a signed-in author sends none.
      await this.client().deleteOwnComment(id, getEditKey(id) ?? undefined)
      forgetEditKey(id)
      // Keep the row as a tombstone: the thread keeps its shape and the normal
      // view renders the deleted placeholder instead of the body.
      this.comments.set(this.comments().map((c) => (c.id === id ? { ...c, status: 'deleted' } : c)))
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
