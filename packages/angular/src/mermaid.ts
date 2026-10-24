// Client-side upgrade for ```mermaid fences: marked emits the safe fallback
// `<pre><code class="language-mermaid">`, then this module lazily loads Mermaid
// and replaces the block with its rendered svg. The source <pre> is kept hidden
// inside the figure so a theme flip can re-render it.

import type Mermaid from 'mermaid'

let mermaidPromise: Promise<typeof Mermaid> | null = null
let counter = 0

function loadMermaid(): Promise<typeof Mermaid> {
  mermaidPromise ??= import('mermaid').then((module) => module.default)
  return mermaidPromise
}

// Mermaid sanitizes under `securityLevel: 'strict'`; this is the second lock:
// an svg that still carries script, event handlers or a javascript: url is
// discarded and the source block stays.
export function isSafeSvg(svg: string): boolean {
  return !/<script[\s>]/i.test(svg) && !/\son[a-z]+\s*=/i.test(svg) && !/javascript:/i.test(svg)
}

function parseSvg(svg: string): SVGSVGElement | null {
  const template = document.createElement('template')
  template.innerHTML = svg.trim()
  const rendered = template.content.firstElementChild
  return rendered instanceof SVGSVGElement ? rendered : null
}

function isDark(root: ParentNode): boolean {
  const host =
    root instanceof Element
      ? (root.closest('.lc-comments, .lc-theme') ?? document.documentElement)
      : document.documentElement
  return host.classList.contains('dark')
}

function clearPending(pre: HTMLPreElement) {
  if (pre.getAttribute('data-mermaid') === 'pending') pre.removeAttribute('data-mermaid')
  pre.removeAttribute('aria-busy')
}

export function enhanceMermaid(root: ParentNode): () => void {
  const codes = Array.from(root.querySelectorAll<HTMLElement>('pre:not(.shiki):not([data-mermaid]) > code'))
  const pres = new Set<HTMLPreElement>()
  for (const code of codes) {
    if (!/(?:^|\s)language-mermaid(?:\s|$)/.test(code.className)) continue
    const pre = code.parentElement
    if (!(pre instanceof HTMLPreElement)) continue
    pres.add(pre)
    pre.setAttribute('data-mermaid', 'pending')
    pre.setAttribute('aria-busy', 'true')
  }
  if (pres.size === 0) return () => {}

  let cancelled = false
  let observer: MutationObserver | null = null
  let dark = isDark(root)
  const figures: { figure: HTMLElement; source: string }[] = []

  const clearAll = () => {
    for (const pre of pres) if (pre.isConnected) clearPending(pre)
  }

  void (async () => {
    const mermaid = await loadMermaid()
    for (const pre of pres) {
      if (cancelled) return
      const source = pre.textContent ?? ''
      if (!source.trim()) {
        clearPending(pre)
        continue
      }
      try {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' })
        const { svg } = await mermaid.render(`lc-angular-mermaid-${++counter}`, source)
        if (cancelled) return
        const rendered = isSafeSvg(svg) ? parseSvg(svg) : null
        if (!rendered) {
          clearPending(pre)
          continue
        }
        const figure = document.createElement('div')
        figure.className = 'lc-mermaid'
        figure.setAttribute('data-mermaid', 'done')
        // Attach first, then move the source inside: appending the pre to the
        // detached figure would otherwise orphan it from the document.
        pre.replaceWith(figure)
        pre.className = 'lc-mermaid-source'
        pre.removeAttribute('aria-busy')
        figure.append(rendered, pre)
        pres.delete(pre)
        figures.push({ figure, source })
      } catch {
        // Parse/diagram failure: keep the source block visible.
        clearPending(pre)
      }
    }
    if (cancelled) return
    observeTheme()
  })().catch(() => {
    clearAll()
  })

  // A mermaid svg bakes its colours, so a light/dark flip re-renders from source.
  function observeTheme() {
    if (figures.length === 0 || typeof MutationObserver === 'undefined') return
    const host =
      root instanceof Element
        ? (root.closest('.lc-comments, .lc-theme') ?? document.documentElement)
        : document.documentElement
    observer = new MutationObserver(() => {
      const next = isDark(root)
      if (next === dark) return
      dark = next
      void rerender()
    })
    observer.observe(host, { attributes: true, attributeFilter: ['class'] })
  }

  async function rerender() {
    const mermaid = await loadMermaid()
    if (cancelled) return
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' })
    for (const item of figures) {
      if (cancelled) return
      if (!item.figure.isConnected) continue
      try {
        const { svg } = await mermaid.render(`lc-angular-mermaid-${++counter}`, item.source)
        if (cancelled) return
        const rendered = isSafeSvg(svg) ? parseSvg(svg) : null
        if (rendered) item.figure.firstElementChild?.replaceWith(rendered)
      } catch {
        // Keep the previous svg rather than flashing the raw source.
      }
    }
  }

  return () => {
    cancelled = true
    observer?.disconnect()
    clearAll()
  }
}
