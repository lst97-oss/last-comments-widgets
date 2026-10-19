import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core'
import { EMPTY_GUIDE, type Guide, type GuideSpan, measureGuides, pickActive, READING_POINT } from './thread-guides'

// One clip id per widget: `<clipPath>` ids are document-global.
let guideSeq = 0

// Fumadocs' TOC line, adapted to comment rows: every comment draws its own rail,
// and the segment at the reader's scroll position is painted in the accent.
@Component({
  selector: 'lc-thread-guides',
  template: `
    <section #list class="lc-thread-guides relative grid grid-cols-1 gap-3" aria-label="Comments">
      <!-- Scroll drives the clip rect, not signals: only this overlay re-reads it. -->
      <div class="lc-thread-overlay" [style.width.px]="guide().width" aria-hidden="true">
        <svg [attr.viewBox]="viewBox()" [attr.width]="guide().width" [attr.height]="guide().height" aria-hidden="true">
          <defs>
            <clipPath [attr.id]="clipId" clipPathUnits="userSpaceOnUse">
              <rect #clip x="0" y="0" [attr.width]="guide().width" height="0" />
            </clipPath>
          </defs>
          <path class="track" [attr.d]="guide().d" />
          <path class="thumb" [attr.d]="guide().d" [attr.clip-path]="'url(#' + clipId + ')'" />
        </svg>
      </div>
      <ng-content />
    </section>
  `,
})
export class LcThreadGuidesComponent {
  // Remount input: a new window, sort order or row order must re-measure.
  readonly measureKey = input('')

  protected readonly clipId = `lc-thread-${++guideSeq}`
  protected readonly guide = signal<Guide>(EMPTY_GUIDE)
  protected readonly viewBox = () => `0 0 ${this.guide().width} ${this.guide().height}`

  protected readonly list = viewChild<ElementRef<HTMLElement>>('list')
  protected readonly clip = viewChild<ElementRef<SVGRectElement>>('clip')
  readonly #destroyRef = inject(DestroyRef)
  #spans = new Map<string, GuideSpan>()
  #active: string | null = null
  #observer: IntersectionObserver | null = null
  #frame = 0

  constructor() {
    // The path lands with the committed DOM, so re-measure after the view updates.
    effect(() => {
      this.measureKey()
      this.#measure()
    })
    afterNextRender(() => {
      const list = this.list()?.nativeElement
      if (!list) return
      const cleanup: (() => void)[] = []
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          // Folding a reply group resizes the list every frame: measure once a frame.
          if (this.#frame) return
          this.#frame = requestAnimationFrame(() => {
            this.#frame = 0
            this.#measure()
          })
        })
        observer.observe(list)
        cleanup.push(() => observer.disconnect())
      }
      // Webfonts move the rows after the first paint.
      void document.fonts?.ready.then(() => this.#measure()).catch(() => {})
      this.#destroyRef.onDestroy(() => {
        for (const dispose of cleanup) dispose()
        cancelAnimationFrame(this.#frame)
        this.#frame = 0
        this.#observer?.disconnect()
      })
    })
  }

  // Revealing the current comment writes to the clip rectangle instead of state:
  // scrolling must not re-render the thread.
  #paint(): void {
    const clip = this.clip()?.nativeElement
    if (!clip) return
    const span = this.#active ? this.#spans.get(this.#active) : undefined
    clip.setAttribute('y', String(span?.[0] ?? 0))
    clip.setAttribute('height', String(span ? Math.max(0, span[1] - span[0]) : 0))
  }

  #pick(list: HTMLElement): void {
    const listRect = list.getBoundingClientRect()
    const band = window.innerHeight * READING_POINT - (listRect.top + list.clientTop - list.scrollTop)
    this.#active = pickActive(this.#spans, band)
    this.#paint()
  }

  #measure(): void {
    const list = this.list()?.nativeElement
    if (!list) return
    const measurement = measureGuides(list)
    this.#spans = measurement.spans
    this.guide.set(measurement.guide)
    if (typeof IntersectionObserver !== 'undefined') {
      this.#observer ??= new IntersectionObserver(() => this.#pick(list), { rootMargin: '-40% 0px -55% 0px' })
      this.#observer.disconnect()
      for (const article of measurement.articles) this.#observer.observe(article)
    }
    this.#pick(list)
  }
}
