import { Component, input, output } from '@angular/core'
import { LucideArrowDown, LucideArrowUp } from '@lucide/angular'
import type { Comment, VoteValue } from '@last-comments-widgets/client'

export type VoteEvent = { id: string; value: VoteValue } | { id: string; clear: true }

// Size/shape of the shadcn `sm` button; the vote only switches variants.
const BUTTON_CLASS =
  'inline-flex shrink-0 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border border-transparent px-2.5 h-7 font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
const ACTIVE_CLASS = 'bg-primary text-primary-foreground hover:bg-primary/80'
const IDLE_CLASS = 'hover:bg-muted hover:text-foreground'

// Arrow vote buttons. Clicking the active vote clears it.
@Component({
  selector: 'lc-vote-buttons',
  imports: [LucideArrowUp, LucideArrowDown],
  template: `
    <div class="lc-vote flex items-center gap-0.5" role="group" aria-label="Vote on comment">
      <button
        type="button"
        [attr.aria-pressed]="comment().viewerVote === 1"
        aria-label="Upvote"
        (click)="cast(1)"
        [class]="buttonClass(1)"
      >
        <svg lucideArrowUp [size]="14"></svg>
      </button>
      <span class="min-w-6 text-center text-sm text-muted-foreground" aria-live="polite">{{ comment().score }}</span>
      <button
        type="button"
        [attr.aria-pressed]="comment().viewerVote === -1"
        aria-label="Downvote"
        (click)="cast(-1)"
        [class]="buttonClass(-1)"
      >
        <svg lucideArrowDown [size]="14"></svg>
      </button>
    </div>
  `,
})
export class LcVoteButtonsComponent {
  readonly comment = input.required<Comment>()
  readonly vote = output<VoteEvent>()

  protected buttonClass(value: VoteValue): string {
    return `${BUTTON_CLASS} ${this.comment().viewerVote === value ? ACTIVE_CLASS : IDLE_CLASS}`
  }

  cast(value: VoteValue): void {
    const comment = this.comment()
    if (comment.viewerVote === value) this.vote.emit({ id: comment.id, clear: true })
    else this.vote.emit({ id: comment.id, value })
  }
}
