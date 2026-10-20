import { renderMarkdown } from '@last-comments-widgets/client'
import { type ReactNode, useCallback, useMemo } from 'react'
import { enhanceCodeBlocks } from './lib/codeBlock'

type MarkdownProps = {
  source: string
  className?: string
  // Rendered when the markdown has no output (e.g. an empty composer preview).
  empty?: ReactNode
}

// The only place the widget turns comment markdown into DOM. The div is keyed
// by its rendered HTML so a new body gets a fresh ref callback; the callback
// returns the Shiki enhancer's cleanup, which React 19 runs on change/unmount.
// No effect is needed for the post-paint upgrade.
export function Markdown({ source, className, empty }: MarkdownProps) {
  const html = useMemo(() => renderMarkdown(source), [source])
  const attach = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    return enhanceCodeBlocks(node)
  }, [])
  if (!html) return empty ?? null
  return (
    <div
      key={html}
      ref={attach}
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by shared renderMarkdown (strips raw HTML, allowlists http(s)/mailto links); the only DOM mutation is the local Shiki upgrade.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
