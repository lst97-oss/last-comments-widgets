import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core'
import {
  beginOAuthSignIn,
  buildCommentTree,
  type Comment,
  describeError,
  type ErrorInfo,
  loadThreadWindow,
  type ThreadNode,
  themeVarsToStyle,
  type WidgetTheme,
} from '@last-comments-widgets/client'
import { LcCommentErrorComponent } from './comment-error.component'
import { LcCommentSkeletonsComponent } from './comment-skeletons.component'
import { LcCommentListComponent } from './comment-list.component'
import { observeInView } from './observe-in-view'
import { prefersDark, subscribeSystemTheme } from './theme-media'
import { type Theme, resolvePageUrl } from './types'

type Status = 'loading' | 'ready' | 'error'

// Read-only comment viewer: same list endpoint, no posting or voting.
@Component({
  selector: 'lc-comment-viewer',
  standalone: true,
  imports: [LcCommentListComponent, LcCommentErrorComponent, LcCommentSkeletonsComponent],
  template: `
    <section class="lc-comments grid gap-4" [class.dark]="dark()" [style]="themeStyle()" aria-label="Comments">
      @if (status() === 'loading') {
        <lc-comment-skeletons [count]="3" />
      }
      @if (error(); as failure) {
        <lc-comment-error [info]="failure" (retry)="load()" (signIn)="signInFromError()" />
      }
      @if (status() === 'ready' && tree().length === 0) {
        <p class="text-sm text-muted-foreground">No comments yet.</p>
      }
      @if (pageRoots().length > 0) {
        <lc-comment-list [nodes]="pageRoots()" [readOnly]="true" />
      }
      @if (loadingPage()) {
        <lc-comment-skeletons [count]="2" />
      }
      @if (page() > 1 || hasMore() || tree().length > pageSize()) {
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

  readonly systemDark = prefersDark()
  dark = computed(() => (this.theme() === 'dark' ? true : this.theme() === 'light' ? false : this.systemDark()))
  themeStyle = computed<Record<string, string>>(() => themeVarsToStyle(this.themeVars(), this.dark()))
  comments = signal<Comment[]>([])
  tree = computed<ThreadNode[]>(() => buildCommentTree(this.comments()))
  page = signal(1)
  hasMore = signal(false)
  loadingPage = signal(false)
  // Page size is `limit` threads (rows per request); 20 matches the API default.
  pageSize = computed(() => this.limit() ?? 20)
  pageRoots = computed<ThreadNode[]>(() =>
    this.tree().slice((this.page() - 1) * this.pageSize(), this.page() * this.pageSize()),
  )
  hasNext = computed(() => this.tree().length > this.page() * this.pageSize() || this.hasMore())
  status = signal<Status>('loading')
  error = signal<ErrorInfo | null>(null)

  #host = inject<ElementRef<HTMLElement>>(ElementRef)
  #destroyRef = inject(DestroyRef)
  #visible = signal(false)
  // Load generation: a response from an older load never commits.
  #seq = 0

  constructor() {
    // The media query is a shared singleton; only system-themed instances join it.
    effect((onCleanup) => {
      if (this.theme() !== 'system') return
      onCleanup(subscribeSystemTheme())
    })
    effect(() => {
      this.site()
      this.baseUrl()
      this.pageUrl()
      this.limit()
      if (this.lazy() && !this.#visible()) return
      void this.load()
    })
    // Below-the-fold embeds defer the first request until the root is near the
    // viewport; no IntersectionObserver (SSR/test) loads immediately.
    afterNextRender(() => {
      const cleanup = observeInView(
        this.#host.nativeElement,
        this.lazy(),
        typeof IntersectionObserver === 'undefined' ? undefined : IntersectionObserver,
        () => this.#visible.set(true),
      )
      if (cleanup) this.#destroyRef.onDestroy(cleanup)
    })
  }

  url(): string {
    return resolvePageUrl(this.pageUrl())
  }

  async load(): Promise<void> {
    const seq = ++this.#seq
    this.status.set('loading')
    this.error.set(null)
    this.page.set(1)
    try {
      // Fill the first thread window (pages: 1) before rendering it: replies
      // consume rows, so one `limit`-row fetch yields fewer than `limit` roots.
      const window = await loadThreadWindow({
        site: this.site(),
        baseUrl: this.baseUrl(),
        pageUrl: this.url(),
        limit: this.limit(),
        fetchImpl: this.fetchImpl(),
        pages: 1,
      })
      if (seq !== this.#seq) return
      this.comments.set(window.comments)
      this.hasMore.set(window.hasMore)
      this.status.set('ready')
    } catch (err) {
      if (seq !== this.#seq) return
      this.error.set(describeError(err))
      this.status.set('error')
    }
  }

  async nextPage(): Promise<void> {
    const seq = ++this.#seq
    const limit = this.pageSize()
    const page = this.page()
    // Cache hit: the next root window is already loaded.
    if (this.tree().length > page * limit || !this.hasMore()) {
      this.page.set(page + 1)
      return
    }
    this.loadingPage.set(true)
    this.error.set(null)
    try {
      const window = await loadThreadWindow({
        site: this.site(),
        baseUrl: this.baseUrl(),
        pageUrl: this.url(),
        limit: this.limit(),
        fetchImpl: this.fetchImpl(),
        pages: page + 1,
        existing: this.comments(),
      })
      if (seq !== this.#seq) return
      this.comments.set(window.comments)
      this.hasMore.set(window.hasMore)
      this.page.set(page + 1)
    } catch (err) {
      if (seq !== this.#seq) return
      this.error.set(describeError(err))
      this.status.set('error')
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
    } catch (err) {
      this.error.set(describeError(err, { title: "Sign-in didn't start" }))
    }
  }

  // Cache-only: every earlier page's rows are already loaded.
  previousPage(): void {
    this.page.set(this.page() - 1)
  }
}
