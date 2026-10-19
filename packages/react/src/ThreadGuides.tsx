import { buildThreadGuidePath, type ThreadGuideItem, type ThreadNode } from '@last-comments-widgets/client'
import { type RefObject, useCallback, useEffect, useId, useRef, useState } from 'react'

// Reply panels clip their contents while they fold, so measurement follows them.
const PANEL_SELECTOR = '[data-slot="accordion-content"]'
// Rails ride the middle of the 1rem gutters (the list's and each reply group's),
// so a line never crosses a comment's content.
const GUTTER_INSET = 8
// Reading slice for the scroll spy. The Fumadocs TOC watches its top 20%, but a
// comment is often taller than that slice, so this points at the middle of the
// viewport: whatever the reader is looking at is the highlighted comment.
const READING_POINT = 0.45
const EMPTY_GUIDE = { d: '', width: 0, height: 0 }

type Guide = { d: string; width: number; height: number }

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

// Render order of the rows as a string: the guides re-measure on change.
// A re-rank (best sort, a vote, a pin) moves rows without resizing the list, so
// the ResizeObserver stays silent and stale rails would overlap the new order.
export function threadSignature(nodes: ThreadNode[]): string {
  return nodes
    .map((node) =>
      node.children.length === 0 ? node.comment.id : `${node.comment.id}(${threadSignature(node.children)})`,
    )
    .join(',')
}

export function ThreadGuides({ listRef }: { listRef: RefObject<HTMLElement | null> }) {
  const clipId = `lc-thread-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const clipRef = useRef<SVGRectElement>(null)
  const spansRef = useRef(new Map<string, [number, number]>())
  const activeRef = useRef<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const frameRef = useRef(0)
  const [guide, setGuide] = useState<Guide>(EMPTY_GUIDE)

  // Revealing the current comment writes to the clip rectangle instead of state:
  // scrolling must not re-render the thread.
  const paint = useCallback(() => {
    const clip = clipRef.current
    if (!clip) return
    const span = activeRef.current ? spansRef.current.get(activeRef.current) : undefined
    clip.setAttribute('y', String(span?.[0] ?? 0))
    clip.setAttribute('height', String(span ? Math.max(0, span[1] - span[0]) : 0))
  }, [])

  // The comment nearest the top of the reading slice is the current one.
  const pick = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const band = window.innerHeight * READING_POINT - contentTop(list)
    let current: string | null = null
    let first: string | null = null
    for (const [id, span] of spansRef.current) {
      if (first === null) first = id
      if (span[0] <= band) current = id
    }
    // Nothing has reached the band yet: the first comment reads as current.
    activeRef.current = current ?? first
    paint()
  }, [listRef, paint])

  const measure = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const baseY = contentTop(list)
    const baseX = contentLeft(list)
    const items: ThreadGuideItem[] = []
    const spans = new Map<string, [number, number]>()
    const articles: HTMLElement[] = []
    // Each thread head resets the path: a top-level comment carries no line, and
    // one thread's line never runs across the rows of the next.
    let started = false
    for (const article of list.querySelectorAll<HTMLElement>('article.lc-comment[data-comment-depth]')) {
      const rect = article.getBoundingClientRect()
      const style = getComputedStyle(article)
      const paddingTop = Number.parseFloat(style.paddingTop) || 0
      const paddingBottom = Number.parseFloat(style.paddingBottom) || 0
      const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
      const left = rect.left - baseX
      const head = Number(article.dataset.commentDepth) === 0
      if (head) started = false
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
      const group = article.querySelector('[data-lc-replies]')
      const ownBottom = group ? Math.min(group.getBoundingClientRect().top, visibleBottom) : visibleBottom
      const bottom = ownBottom - baseY - paddingBottom
      // A head draws a line only when it has replies, and never joins the thread
      // above it: the head's line starts its own subpath.
      if (bottom > top && (!head || group)) {
        items.push({ x: left - GUTTER_INSET, top, bottom, break: !started })
        started = true
      }
      // A folded group keeps a stub beside its trigger, so hidden replies still
      // show in the guide instead of vanishing with them. Base UI unmounts a
      // folded panel, so "no visible child" is the folded state.
      const child = group?.querySelector<HTMLElement>('article.lc-comment')
      if (group && (!child || child.offsetHeight === 0)) {
        const stub = group.getBoundingClientRect()
        // Start one gutter below the junction: with the cubic's ±4px controls that
        // leaves a bend radius, so the join reads as round as the level changes.
        const stubTop = stub.top - baseY + GUTTER_INSET * 2
        const stubBottom = stub.bottom - baseY
        if (stubBottom > stubTop) {
          items.push({
            x: left + paddingLeft + GUTTER_INSET,
            top: stubTop,
            bottom: stubBottom,
            break: !started,
          })
          started = true
        }
      }
      const id = article.dataset.commentId
      if (id) spans.set(id, [top, bottom])
      articles.push(article)
    }
    spansRef.current = spans
    setGuide(buildThreadGuidePath(items))
    if (typeof IntersectionObserver !== 'undefined') {
      observerRef.current ??= new IntersectionObserver(pick, { rootMargin: '-40% 0px -55% 0px' })
      const observer = observerRef.current
      observer.disconnect()
      for (const article of articles) observer.observe(article)
    }
    pick()
  }, [listRef, pick])

  useEffect(() => {
    measure()
    const list = listRef.current
    if (!list || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      // Folding a reply group resizes the list every frame: measure once a frame.
      if (frameRef.current) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0
        measure()
      })
    })
    observer.observe(list)
    // Webfonts move the rows after the first paint.
    void document.fonts?.ready.then(measure).catch(() => {})
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [measure, listRef])

  // The path lands in the DOM with this commit: the callback ref re-attaches on
  // every new guide and repaints the band against the committed rect, instead
  // of a second effect round-trip.
  const attachClip = useCallback(
    (node: SVGRectElement | null) => {
      clipRef.current = node
      if (node && guide.d !== '') paint()
    },
    [guide, paint],
  )

  if (guide.d === '') return null
  return (
    <div className="lc-thread-overlay" style={{ width: guide.width }} aria-hidden="true">
      <svg viewBox={`0 0 ${guide.width} ${guide.height}`} width={guide.width} height={guide.height} aria-hidden="true">
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            {/* The active comment's band; scroll updates y and height in the DOM. */}
            <rect ref={attachClip} x={0} y={0} width={guide.width} height={0} />
          </clipPath>
        </defs>
        <path className="track" d={guide.d} />
        <path className="thumb" d={guide.d} clipPath={`url(#${clipId})`} />
      </svg>
    </div>
  )
}
