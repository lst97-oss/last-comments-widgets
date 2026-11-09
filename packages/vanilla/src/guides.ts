// Thread guide lines and the in-view observer: measured layout, no markup.

import type { ThreadGuideItem } from '@last-comments-widgets/client'
import { buildThreadGuidePath } from '@last-comments-widgets/client'

export { observeInView } from '@last-comments-widgets/client/enhance'

// Reply panels clip their contents while they fold, so measurement follows them.
export const PANEL_SELECTOR = '[data-slot="accordion-content"]'

// Rails ride the middle of a comment's own left padding, so a line stays inside
// the card it belongs to instead of crossing the card's edge.
export const GUTTER_INSET = 8

// Reading slice for the scroll spy: a comment is often taller than the Fumadocs
// TOC's top 20%, so this points at the middle of the viewport.
export const READING_POINT = 0.45

export type GuideRow = {
  depth: number
  // All coordinates are px in the list's own (padding-box) space.
  left: number
  top: number
  bottom: number
  paddingLeft: number
  hasReplies: boolean
  // Band of a folded reply group, so hidden replies still show as a stub.
  stub?: { top: number; bottom: number }
}

// The guide path for a measured page. Each thread head resets the path: a
// top-level comment carries no line, and one thread's line never runs across
// the rows of the next.
export function guidePath(rows: GuideRow[]): { d: string; width: number; height: number } {
  const items: ThreadGuideItem[] = []
  let started = false
  for (const row of rows) {
    const head = row.depth === 0
    if (head) started = false
    if (row.bottom > row.top && (!head || row.hasReplies)) {
      items.push({ x: row.left + row.paddingLeft / 2, top: row.top, bottom: row.bottom, break: !started })
      started = true
    }
    if (row.stub) {
      // Start one gutter below the junction: with the cubic's ±4px controls that
      // leaves a bend radius, so the join reads as round as the level changes.
      const top = row.stub.top + GUTTER_INSET * 2
      const bottom = row.stub.bottom
      if (bottom > top) {
        // The folded child's own rail: one reply indent in, then half the
        // reply's default inline padding (a host cardPadding shifts it).
        items.push({ x: row.left + row.paddingLeft + GUTTER_INSET * 3, top, bottom, break: !started })
        started = true
      }
    }
  }
  return buildThreadGuidePath(items)
}

// The comment nearest the top of the reading slice is the current one; nothing
// reached yet means the first row reads as current.
export function pickActive(spans: Iterable<[string, [number, number]]>, band: number): string | null {
  let current: string | null = null
  let first: string | null = null
  for (const [id, span] of spans) {
    if (first === null) first = id
    if (span[0] <= band) current = id
  }
  return current ?? first
}

export type GuidesSession = { measure(): void; destroy(): void }

let guideSeq = 0

function contentTop(list: HTMLElement): number {
  const rect = list.getBoundingClientRect()
  return rect.top + list.clientTop - list.scrollTop
}

// The list's overlay origin: the padding box, in the coordinates the guides are
// measured against. shortcut: left-to-right only — the widget ships no RTL
// styles, so under `dir="rtl"` rails would stack on the wrong edge.
function contentLeft(list: HTMLElement): number {
  const rect = list.getBoundingClientRect()
  return rect.left + list.clientLeft - list.scrollLeft
}

// Measures the rendered rows and paints the Fumadocs-style guide line. The
// scroll spy writes to the clip rectangle, never to state, so scrolling never
// re-renders the thread.
export function renderGuides(list: HTMLElement): GuidesSession {
  const clipId = `lc-thread-guide-${++guideSeq}`
  const spans = new Map<string, [number, number]>()
  let overlay: HTMLElement | null = null
  let clip: SVGRectElement | null = null
  let active: string | null = null
  let frame = 0
  let dead = false
  let spy: IntersectionObserver | null = null
  let observer: ResizeObserver | null = null

  function paint() {
    if (!clip) return
    const span = active ? spans.get(active) : undefined
    clip.setAttribute('y', String(span?.[0] ?? 0))
    clip.setAttribute('height', String(span ? Math.max(0, span[1] - span[0]) : 0))
  }

  function pick() {
    active = pickActive(spans, window.innerHeight * READING_POINT - contentTop(list))
    paint()
  }

  function draw(guide: { d: string; width: number; height: number }) {
    if (guide.d === '') {
      overlay?.remove()
      overlay = null
      clip = null
      return
    }
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.className = 'lc-thread-overlay'
      overlay.setAttribute('aria-hidden', 'true')
      list.prepend(overlay)
    }
    overlay.style.width = `${guide.width}px`
    overlay.innerHTML = `<svg viewBox="0 0 ${guide.width} ${guide.height}" width="${guide.width}" height="${guide.height}" aria-hidden="true"><defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="${guide.width}" height="0"></rect></clipPath></defs><path class="track" d="${guide.d}"></path><path class="thumb" d="${guide.d}" clip-path="url(#${clipId})"></path></svg>`
    clip = overlay.querySelector<SVGRectElement>('rect')
  }

  function measure() {
    // A repaint may land between a queued frame and this call.
    if (dead) return
    const baseY = contentTop(list)
    const baseX = contentLeft(list)
    const rows: GuideRow[] = []
    const articles: HTMLElement[] = []
    spans.clear()
    for (const article of list.querySelectorAll<HTMLElement>('article.lc-comment[data-comment-depth]')) {
      const rect = article.getBoundingClientRect()
      const style = getComputedStyle(article)
      const paddingTop = Number.parseFloat(style.paddingTop) || 0
      const paddingBottom = Number.parseFloat(style.paddingBottom) || 0
      const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
      const left = rect.left - baseX
      // Measure only the slice of the comment its reply panels leave visible.
      let visibleTop = rect.top
      let visibleBottom = rect.bottom
      for (let node = article.parentElement; node && node !== list; node = node.parentElement) {
        if (!node.matches(PANEL_SELECTOR)) continue
        const panel = node.getBoundingClientRect()
        visibleTop = Math.max(visibleTop, panel.top)
        visibleBottom = Math.min(visibleBottom, panel.bottom)
      }
      const top = visibleTop - baseY + paddingTop
      // A rail spans the comment's own rows and stops where its reply group starts.
      const group = article.querySelector<HTMLElement>('[data-lc-replies]')
      const ownBottom = group ? Math.min(group.getBoundingClientRect().top, visibleBottom) : visibleBottom
      const bottom = ownBottom - baseY - paddingBottom
      // A folded group keeps a stub beside its trigger, so hidden replies still
      // show in the guide instead of vanishing with them.
      const folded = group?.querySelector<HTMLElement>(PANEL_SELECTOR)?.dataset.state === 'closed'
      const band = folded && group ? group.getBoundingClientRect() : null
      rows.push({
        depth: Number(article.dataset.commentDepth) || 0,
        left,
        top,
        bottom,
        paddingLeft,
        hasReplies: Boolean(group),
        ...(band ? { stub: { top: band.top - baseY, bottom: band.bottom - baseY } } : {}),
      })
      const id = article.dataset.commentId
      if (id) spans.set(id, [top, bottom])
      articles.push(article)
    }
    draw(guidePath(rows))
    if (typeof IntersectionObserver !== 'undefined') {
      spy ??= new IntersectionObserver(pick, { rootMargin: '-40% 0px -55% 0px' })
      spy.disconnect()
      for (const article of articles) spy.observe(article)
    }
    pick()
  }

  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      // Folding a reply group resizes the list every frame: measure once a frame.
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    })
    observer.observe(list)
  }
  // Webfonts move the rows after the first paint.
  void document.fonts?.ready.then(() => measure()).catch(() => {})

  return {
    measure,
    destroy() {
      dead = true
      observer?.disconnect()
      spy?.disconnect()
      cancelAnimationFrame(frame)
      frame = 0
      overlay?.remove()
      overlay = null
      clip = null
    },
  }
}
