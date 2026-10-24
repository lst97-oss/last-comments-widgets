import { renderMarkdown } from '@last-comments-widgets/client'
import { type ReactNode, useCallback, useMemo } from 'react'
import { enhanceCodeBlocks } from './lib/codeBlock'
import { enhanceMath } from './lib/math'
import { enhanceMermaid } from './lib/mermaid'

type MarkdownProps = {
  source: string
  className?: string
  // Rendered when the markdown has no output (e.g. an empty composer preview).
  empty?: ReactNode
  // `$…$` / `$$…$$` formulas, upgraded after paint with a lazily loaded KaTeX.
  math?: boolean
  // ```mermaid fences, upgraded after paint with a lazily loaded Mermaid.
  mermaid?: boolean
  // Syntax highlighting for fenced code (default on), upgraded after paint.
  codeHighlight?: boolean
}

// The only place the widget turns comment markdown into DOM. The div is keyed
// by its rendered HTML so a new body gets a fresh ref callback; the callback
// returns the enhancers' cleanup, which React 19 runs on change/unmount. No
// effect is needed for the post-paint upgrades.
export function Markdown({
  source,
  className,
  empty,
  math = false,
  mermaid = false,
  codeHighlight = true,
}: MarkdownProps) {
  const html = useMemo(() => renderMarkdown(source, { math }), [source, math])
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return
      const cleanups = [
        ...(codeHighlight ? [enhanceCodeBlocks(node)] : []),
        ...(mermaid ? [enhanceMermaid(node)] : []),
        ...(math ? [enhanceMath(node)] : []),
      ]
      if (cleanups.length === 0) return
      return () => {
        for (const cleanup of cleanups) cleanup()
      }
    },
    [math, mermaid, codeHighlight],
  )
  if (!html) return empty ?? null
  return (
    <div
      key={html}
      ref={attach}
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by shared renderMarkdown (strips raw HTML, allowlists http(s)/mailto links); the only DOM mutations are the local lazy upgrades.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
