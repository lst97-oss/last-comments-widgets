// Client-side upgrade for `$…$` / `$$…$$`: marked emits the escaped tex inside a
// `.lc-math` placeholder, then this module lazily loads KaTeX and replaces the
// placeholder's content with the rendered formula. No markup is generated from
// user HTML — the tex travels as an attribute the shared renderer escaped.

import type Katex from 'katex'

let katexPromise: Promise<typeof Katex> | null = null
let cssRequested = false

// The stylesheet is best effort: bundlers inline it, and a host that ships the
// CSS itself simply gets a failed dynamic import that is ignored.
function loadKatex(): Promise<typeof Katex> {
  katexPromise ??= import('katex').then((module) => module.default)
  if (!cssRequested) {
    cssRequested = true
    void Promise.resolve(import('katex/dist/katex.min.css')).catch(() => {})
  }
  return katexPromise
}

function clearPending(node: HTMLElement) {
  if (node.getAttribute('data-math') === 'pending') node.removeAttribute('data-math')
  node.removeAttribute('aria-busy')
}

// Returns a cleanup so React 19's ref callback can cancel an in-flight upgrade
// when the rendered HTML changes or the component unmounts.
export function enhanceMath(root: ParentNode): () => void {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.lc-math:not([data-math])'))
  for (const node of nodes) {
    node.setAttribute('data-math', 'pending')
    node.setAttribute('aria-busy', 'true')
  }
  if (nodes.length === 0) return () => {}

  let cancelled = false
  const clearAll = () => {
    for (const node of nodes) if (node.isConnected) clearPending(node)
  }

  void (async () => {
    const katex = await loadKatex()
    for (const node of nodes) {
      if (cancelled) return
      // Angular's [innerHTML] sanitizer drops `data-tex`; the escaped tex is
      // also the span's text, so either source works.
      const tex = node.getAttribute('data-tex') ?? node.textContent ?? ''
      if (!tex.trim()) {
        clearPending(node)
        continue
      }
      try {
        const html = katex.renderToString(tex, {
          displayMode: node.classList.contains('lc-math-block'),
          throwOnError: false,
          strict: false,
        })
        if (cancelled) return
        const template = document.createElement('template')
        template.innerHTML = html.trim()
        const rendered = template.content.firstElementChild
        if (!rendered) {
          clearPending(node)
          continue
        }
        node.replaceChildren(rendered)
        node.setAttribute('data-math', 'done')
        node.removeAttribute('aria-busy')
      } catch {
        // KaTeX rejected the tex: keep the literal formula.
        clearPending(node)
      }
    }
  })().catch(() => {
    clearAll()
  })

  return () => {
    cancelled = true
    clearAll()
  }
}
