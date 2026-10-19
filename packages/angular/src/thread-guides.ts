import { buildThreadGuidePath, type ThreadGuideItem, type ThreadNode } from '@last-comments-widgets/client'

// Reply panels clip their contents while they fold, so measurement follows them.
export const PANEL_SELECTOR = '[data-slot="accordion-content"]'
// Rails ride the middle of the 1rem gutters (the list's and each reply group's),
// so a line never crosses a comment's content.
export const GUTTER_INSET = 8
// Reading slice for the scroll spy. A comment is often taller than the Fumadocs
// top band, so this points at the middle of the viewport: whatever the reader is
// looking at is the highlighted comment.
export const READING_POINT = 0.45

export type Guide = { d: string; width: number; height: number }
export const EMPTY_GUIDE: Guide = { d: '', width: 0, height: 0 }

// Row id -> [top, bottom] in the list's own coordinate space.
export type GuideSpan = [number, number]
export type GuideMeasurement = { guide: Guide; spans: Map<string, GuideSpan>; articles: HTMLElement[] }

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

// The comment nearest above the reading band is the current one; with nothing
// reached yet the first comment reads as current.
export function pickActive(spans: Map<string, GuideSpan>, band: number): string | null {
  let current: string | null = null
  let first: string | null = null
  for (const [id, span] of spans) {
    if (first === null) first = id
    if (span[0] <= band) current = id
  }
  return current ?? first
}

// Measures every row of `list` into the guide path the overlay draws. Reads the
// DOM only; the component owns observers and painting.
export function measureGuides(list: HTMLElement): GuideMeasurement {
  const listRect = list.getBoundingClientRect()
  // The overlay origin is the list's padding box. shortcut: left-to-right only —
  // the widget ships no RTL styles, so rails would stack on the wrong edge.
  const baseY = listRect.top + list.clientTop - list.scrollTop
  const baseX = listRect.left + list.clientLeft - list.scrollLeft
  const items: ThreadGuideItem[] = []
  const spans = new Map<string, GuideSpan>()
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
    // show in the guide instead of vanishing with them. The panel unmounts when
    // folded, so "no visible child" is the folded state.
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
  return { guide: buildThreadGuidePath(items), spans, articles }
}
