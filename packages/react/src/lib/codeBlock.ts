// Client-side upgrade for fenced code blocks: marked emits the safe fallback
// `<pre><code class="language-…">`, then this module lazily loads Shiki and
// replaces each block with the same docs-style chrome the last-comments blog
// uses (language label + copy button). No markup is generated from user HTML.

const CODE_THEMES = { light: 'vitesse-light', dark: 'vitesse-dark' } as const
const ICON_SIZE = 14
const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`

// Shiki ids are lowercase wordish; normalize the `language-*` class the base
// markdown pipeline emits so the highlighter gets a stable id. An unknown id
// is left to Shiki's throw and falls back to the plain <pre>.
export function normalizeCodeLanguage(raw: string | null | undefined): string {
  const cleaned = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^language-/, '')
    .replace(/[^a-z0-9+#_-]/g, '')
  return cleaned || 'text'
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  document.execCommand('copy')
  area.remove()
}

function buildCodeBlockChrome(lang: string, source: string, highlighted: HTMLPreElement): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'lc-codeblock'

  const header = document.createElement('div')
  header.className = 'lc-codeblock-header'

  const label = document.createElement('span')
  label.className = 'lc-codeblock-lang'
  label.textContent = lang

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'lc-codeblock-copy'
  button.setAttribute('aria-label', `Copy ${lang} code to clipboard`)
  button.innerHTML = COPY_SVG
  button.addEventListener('click', () => {
    void copyText(source)
      .then(() => {
        button.innerHTML = CHECK_SVG
        button.setAttribute('data-copied', 'true')
        window.setTimeout(() => {
          button.innerHTML = COPY_SVG
          button.removeAttribute('data-copied')
        }, 1500)
      })
      .catch(() => {
        // Clipboard unavailable: leave the copy icon in place.
      })
  })

  header.append(label, button)
  wrapper.append(header, highlighted)
  return wrapper
}

function clearPending(pre: HTMLPreElement) {
  pre.removeAttribute('data-shiki')
  pre.removeAttribute('aria-busy')
}

// Returns a cleanup so React 19's ref callback can cancel an in-flight upgrade
// when the rendered HTML changes or the component unmounts.
export function enhanceCodeBlocks(root: ParentNode): () => void {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('pre:not(.shiki) > code')).filter(
    // A mermaid fence is a diagram (or its source), never highlighted code.
    (code) => !/(?:^|\s)language-mermaid(?:\s|$)/.test(code.className),
  )
  const pres = new Set<HTMLPreElement>()
  for (const code of blocks) {
    const pre = code.parentElement
    if (!(pre instanceof HTMLPreElement)) continue
    pres.add(pre)
    pre.setAttribute('data-shiki', 'pending')
    pre.setAttribute('aria-busy', 'true')
  }
  if (pres.size === 0) return () => {}

  let cancelled = false
  const clearAll = () => {
    for (const pre of pres) if (pre.isConnected) clearPending(pre)
  }

  void (async () => {
    const { codeToHtml } = await import('shiki')
    for (const code of blocks) {
      if (cancelled) return
      const pre = code.parentElement
      if (!(pre instanceof HTMLPreElement)) continue
      const match = /(?:^|\s)language-([\w+#-]+)/.exec(code.className)
      const lang = normalizeCodeLanguage(match?.[1])
      const source = code.textContent ?? ''
      if (!source.trim()) {
        clearPending(pre)
        pres.delete(pre)
        continue
      }
      try {
        const html = await codeToHtml(source, { lang, themes: CODE_THEMES, defaultColor: false })
        if (cancelled) return
        const template = document.createElement('template')
        template.innerHTML = html.trim()
        const highlighted = template.content.firstElementChild
        if (highlighted instanceof HTMLPreElement) {
          pre.replaceWith(buildCodeBlockChrome(lang, source, highlighted))
          pres.delete(pre)
        } else {
          clearPending(pre)
          pres.delete(pre)
        }
      } catch {
        // Unknown language or highlighter failure: keep the plain fallback.
        clearPending(pre)
        pres.delete(pre)
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
