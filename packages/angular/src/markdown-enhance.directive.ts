import { afterRenderEffect, DestroyRef, Directive, ElementRef, inject, input } from '@angular/core'
import { enhanceMath } from './math'
import { enhanceMermaid } from './mermaid'

// Hooks the shared post-paint upgrades onto whichever element holds rendered
// markdown. `[lcMarkdownEnhance]` is the html trigger: when Angular rewrites
// the [innerHTML] binding the trigger string changes, the previous enhancers
// are cleaned up and the new markup is upgraded.
@Directive({ selector: '[lcMarkdownEnhance]' })
export class LcMarkdownEnhanceDirective {
  readonly lcMarkdownEnhance = input('')
  readonly math = input(false)
  readonly mermaid = input(false)
  readonly codeHighlight = input(true)

  private readonly host = inject(ElementRef<HTMLElement>)
  private readonly destroyRef = inject(DestroyRef)
  private cleanup: (() => void) | null = null
  private last: { html: string; math: boolean; mermaid: boolean } | null = null

  constructor() {
    afterRenderEffect(() => {
      const next = { html: this.lcMarkdownEnhance(), math: this.math(), mermaid: this.mermaid() }
      const previous = this.last
      this.last = next
      if (previous && previous.html === next.html && previous.math === next.math && previous.mermaid === next.mermaid)
        return
      this.run()
    })
    this.destroyRef.onDestroy(() => {
      this.cleanup?.()
      this.cleanup = null
    })
  }

  private run() {
    this.cleanup?.()
    this.cleanup = null
    const node = this.host.nativeElement
    if (!node) return
    // `codeHighlight` is API parity only: Shiki lives in the React bundle today.
    const cleanups = [...(this.mermaid() ? [enhanceMermaid(node)] : []), ...(this.math() ? [enhanceMath(node)] : [])]
    if (cleanups.length === 0) return
    this.cleanup = () => {
      for (const dispose of cleanups) dispose()
    }
  }
}
