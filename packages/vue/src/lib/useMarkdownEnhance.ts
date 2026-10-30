import { enhanceMath, enhanceMermaid } from '@last-comments-widgets/client/enhance'
import { onBeforeUnmount, onMounted, type Ref, watch } from 'vue'

type EnhanceFlags = { math: () => boolean; mermaid: () => boolean }

// This port bundles KaTeX's stylesheet; the import stays here so the bundle that owns the CSS requests it.
const loadKatexStyles = () => import('katex/dist/katex.min.css')

// Runs the post-paint upgrades against whichever element currently holds the
// rendered markdown. Vue replaces that markup wholesale (v-html) or the row
// remounts, so every run starts by dropping the previous cleanups.
export function useMarkdownEnhance(el: Ref<HTMLElement | null>, html: Ref<string>, flags: EnhanceFlags) {
  let cleanup: (() => void) | null = null

  function run() {
    cleanup?.()
    cleanup = null
    const node = el.value
    if (!node) return
    const cleanups = [
      ...(flags.mermaid() ? [enhanceMermaid(node)] : []),
      ...(flags.math() ? [enhanceMath(node, { loadStyles: loadKatexStyles })] : []),
    ]
    if (cleanups.length === 0) return
    cleanup = () => {
      for (const dispose of cleanups) dispose()
    }
  }

  onMounted(run)
  // The element changes when a row swaps its editor for the body (or back) with
  // the same html, so the ref is watched alongside the rendered string.
  watch([el, html, flags.math, flags.mermaid], run, { flush: 'post' })
  onBeforeUnmount(() => {
    cleanup?.()
    cleanup = null
  })
}
