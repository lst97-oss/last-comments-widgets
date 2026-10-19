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
  resource,
  signal,
} from '@angular/core'
import {
  beginOAuthSignIn,
  buildCommentTree,
  type Comment,
  describeError,
  type ErrorInfo,
  loadThreadWindow,
  sortCommentRoots,
  type ThreadNode,
  type ThreadSort,
  themeVarsToStyle,
  type WidgetTheme,
} from '@last-comments-widgets/client'
import { LcCommentErrorComponent } from './comment-error.component'
import { LcCommentSkeletonsComponent } from './comment-skeletons.component'
import { LcCommentListComponent, type CommentSubmitHandler } from './comment-list.component'
import { observeInView } from './observe-in-view'
import { prefersDark, subscribeSystemTheme } from './theme-media'
import { threadSignature } from './thread-guides'
import { LcThreadSortToggleComponent } from './thread-sort-toggle.component'
import { type Theme, resolvePageUrl } from './types'

type Status = 'loading' | 'ready' | 'error'

type RootLoad = { comments: Comment[]; hasMore: boolean }

type LoadParams = {
  site: string
  baseUrl: string
  pageUrl: string | undefined
  limit: number | undefined
  fetchImpl: typeof fetch | undefined
}

// The read-only viewer never edits, deletes or votes.
const noopAsync: CommentSubmitHandler = async () => null

// Read-only comment viewer: same list endpoint, no posting or voting.
@Component({
  selector: 'lc-comment-viewer',
  imports: [LcCommentErrorComponent, LcCommentListComponent, LcCommentSkeletonsComponent, LcThreadSortToggleComponent],
  template: `
    <section class="lc-comments grid gap-4" [class.dark]="dark()" [style]="themeStyle()" aria-label="Comments">
      @if (status() === 'loading') {
        <lc-comment-skeletons [count]="3" />
      }
      @if (error(); as failure) {
        <lc-comment-error [info]="failure" (retry)="load()" (signIn)="signInFromError()" />
      }
      @if (status() === 'ready' && roots().length === 0) {
        <p class="text-sm text-muted-foreground">No comments yet.</p>
      }
      @if (roots().length > 0) {
        <lc-thread-sort-toggle [value]="sort()" (sortChange)="changeSort($event)" />
      }
      @if (pageRoots().length > 0) {
        <lc-comment-list
          [nodes]="pageRoots()"
          [readOnly]="true"
          [editComment]="noop"
          [replyComment]="noop"
          [measureKey]="measureKey()"
        />
      }
      @if (loadingPage()) {
        <lc-comment-skeletons [count]="2" />
      }
      @if (page() > 1 || hasMore() || roots().length > pageSize()) {
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
    </section>
  `,
})
export class LcCommentViewerComponent {
  site = input.required<string>()
  baseUrl = input.required<string>()
  pageUrl = input<string | undefined>(undefined)
  limit = input<number | undefined>(undefined)
  theme = input<Theme>('system')
  themeVars = input<WidgetTheme | undefined>(undefined)
  fetchImpl = input<typeof fetch | undefined>(undefined)
  lazy = input(false)

  readonly noop = noopAsync
  readonly systemDark = prefersDark()
  dark = computed(() => (this.theme() === 'dark' ? true : this.theme() === 'light' ? false : this.systemDark()))
  themeStyle = computed<Record<string, string>>(() => themeVarsToStyle(this.themeVars(), this.dark()))
  sort = signal<ThreadSort>('newest')
  loadingPage = signal(false)
  // Paging runs outside the root resource, so its failure needs its own slot.
  pageError = signal<ErrorInfo | null>(null)

  readonly root = resource<RootLoad, LoadParams>({
    params: (): LoadParams => ({
      site: this.site(),
      baseUrl: this.baseUrl(),
      pageUrl: this.pageUrl(),
      limit: this.limit(),
      fetchImpl: this.fetchImpl(),
    }),
    loader: async ({ params }) => {
      // Hold the first request until the lazy gate opens.
      await this.#gate
      // Fill the first thread window (pages: 1) before rendering it: replies
      // consume rows, so one `limit`-row fetch yields fewer than `limit` roots.
      const window = await loadThreadWindow({
        site: params.site,
        baseUrl: params.baseUrl,
        pageUrl: resolvePageUrl(params.pageUrl),
        limit: params.limit,
        fetchImpl: params.fetchImpl,
        pages: 1,
      })
      return { comments: window.comments, hasMore: window.hasMore }
    },
  })
  readonly status = computed<Status>(() => {
    const status = this.root.status()
    if (status === 'error') return 'error'
    return status === 'resolved' || status === 'local' ? 'ready' : 'loading'
  })
  readonly error = computed<ErrorInfo | null>(() => {
    const failure = this.pageError()
    if (failure) return failure
    const thrown = this.root.error()
    return thrown ? describeError(thrown) : null
  })
  // Row cache: replaced by a load or by paging; a fresh load resets the page.
  readonly comments = linkedSignal<RootLoad | undefined, Comment[]>({
    source: () => this.root.value(),
    computation: (value) => value?.comments ?? [],
  })
  readonly hasMore = linkedSignal<RootLoad | undefined, boolean>({
    source: () => this.root.value(),
    computation: (value) => value?.hasMore ?? false,
  })
  readonly roots = computed<ThreadNode[]>(() => sortCommentRoots(buildCommentTree(this.comments()), this.sort()))
  // Page size is `limit` threads (rows per request); 20 matches the API default.
  pageSize = computed(() => this.limit() ?? 20)
  // A delete/edit shrinks the rows locally, so the current window can go empty
  // while the page state stays put: clamp to the last page that still has roots.
  readonly page = linkedSignal<{ loaded: RootLoad | undefined; roots: number; size: number }, number>({
    source: () => ({ loaded: this.root.value(), roots: this.roots().length, size: this.pageSize() }),
    computation: ({ loaded, roots, size }, previous) => {
      const requested = previous && previous.source.loaded === loaded ? previous.value : 1
      return Math.min(requested, Math.max(1, Math.ceil(roots / size)))
    },
  })
  readonly pageRoots = computed<ThreadNode[]>(() =>
    this.roots().slice((this.page() - 1) * this.pageSize(), this.page() * this.pageSize()),
  )
  readonly hasNext = computed(() => this.roots().length > this.page() * this.pageSize() || this.hasMore())
  // New window, sort order or row order re-measures the rails.
  readonly measureKey = computed(() => `${this.page()}:${this.sort()}:${threadSignature(this.pageRoots())}`)

  #host = inject<ElementRef<HTMLElement>>(ElementRef)
  #destroyRef = inject(DestroyRef)
  // The first request waits for the viewport gate (a resolved no-op when eager).
  #openGate: (() => void) | null = null
  readonly #gate = new Promise<void>((resolve) => {
    this.#openGate = resolve
  })

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
        () => {
          this.#openGate?.()
          this.#openGate = null
        },
      )
      if (cleanup) this.#destroyRef.onDestroy(cleanup)
    })
  }

  url(): string {
    return resolvePageUrl(this.pageUrl())
  }

  // Retry: a fresh load replaces the cached rows and resets the page.
  load(): void {
    this.pageError.set(null)
    this.root.reload()
  }

  changeSort(next: ThreadSort): void {
    this.sort.set(next)
    // Window boundaries follow the new order, so start from its first page.
    this.page.set(1)
  }

  async nextPage(): Promise<void> {
    const size = this.pageSize()
    const page = this.page()
    // Cache hit: the next root window is already loaded.
    if (this.roots().length > page * size || !this.hasMore()) {
      this.page.set(page + 1)
      return
    }
    this.loadingPage.set(true)
    this.pageError.set(null)
    try {
      // Fill the destination window, then render it: a fetch returns `limit`
      // rows but a page shows `limit` roots, and replies eat rows.
      const window = await loadThreadWindow({
        site: this.site(),
        baseUrl: this.baseUrl(),
        pageUrl: this.url(),
        limit: this.limit(),
        fetchImpl: this.fetchImpl(),
        pages: page + 1,
        existing: this.comments(),
      })
      this.comments.set(window.comments)
      this.hasMore.set(window.hasMore)
      this.page.set(page + 1)
    } catch (err) {
      this.pageError.set(describeError(err, { title: 'Failed to load more comments' }))
    } finally {
      this.loadingPage.set(false)
    }
  }

  // The viewer has no identity control, so the block's sign-in action starts OAuth itself.
  async signInFromError(): Promise<void> {
    try {
      const providerUrl = await beginOAuthSignIn({
        baseUrl: this.baseUrl(),
        pageUrl: this.url(),
        fetchImpl: this.fetchImpl(),
      })
      window.location.assign(providerUrl)
    } catch {
      // Navigation failed: the error block already explains the sign-in state.
    }
  }

  // Cache-only: every earlier page's rows are already loaded.
  previousPage(): void {
    this.page.set(this.page() - 1)
  }
}
