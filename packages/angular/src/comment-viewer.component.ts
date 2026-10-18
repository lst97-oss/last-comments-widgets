import { CommonModule } from '@angular/common'
import {
  type AfterViewInit,
  Component,
  computed,
  ElementRef,
  effect,
  inject,
  input,
  type OnDestroy,
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
} from '@lst97-oss/client'
import { LcCommentErrorComponent } from './comment-error.component'
import { LcCommentListComponent } from './comment-list.component'
import type { Theme } from './types'

type Status = 'loading' | 'ready' | 'error'

// Read-only comment viewer: same list endpoint, no posting or voting.
@Component({
  selector: 'lc-comment-viewer',
  standalone: true,
  imports: [CommonModule, LcCommentListComponent, LcCommentErrorComponent],
  template: `
    <section class="lc-comments grid gap-4" [class.dark]="dark()" [ngStyle]="themeStyle()" aria-label="Comments">
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
export class LcCommentViewerComponent implements AfterViewInit, OnDestroy {
  site = input.required<string>()
  baseUrl = input.required<string>()
  pageUrl = input<string | undefined>(undefined)
  limit = input<number | undefined>(undefined)
  theme = input<Theme>('system')
  themeVars = input<WidgetTheme | undefined>(undefined)
  fetchImpl = input<typeof fetch | undefined>(undefined)
  lazy = input(false)

  dark = signal(false)
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
  // Skeleton card counts: 3 for the initial load, 2 for an in-flight page fetch.
  readonly skeletonCards = [0, 1, 2]
  readonly pageSkeletonCards = [0, 1]

  #host = inject<ElementRef<HTMLElement>>(ElementRef)
  #observer: IntersectionObserver | null = null
  #visible = signal(false)
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
    effect(() => {
      this.site()
      this.baseUrl()
      this.pageUrl()
      this.limit()
      if (this.lazy() && !this.#visible()) return
      void this.load()
    })
  }

  // Below-the-fold embeds defer the first request until the root is near the
  // viewport; no IntersectionObserver (SSR/test) loads immediately.
  ngAfterViewInit(): void {
    if (!this.lazy() || typeof IntersectionObserver === 'undefined') {
      this.#visible.set(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        this.#observer = null
        this.#visible.set(true)
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

  url(): string {
    return this.pageUrl() ?? window.location.href
  }

  async load(): Promise<void> {
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
      this.comments.set(window.comments)
      this.hasMore.set(window.hasMore)
      this.status.set('ready')
    } catch (err) {
      this.error.set(describeError(err))
      this.status.set('error')
    }
  }

  async nextPage(): Promise<void> {
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
      this.comments.set(window.comments)
      this.hasMore.set(window.hasMore)
      this.page.set(page + 1)
    } catch (err) {
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
