import { Component, input, output } from '@angular/core'
import { LucideArrowDown, LucideArrowUp } from '@lucide/angular'
import type { Comment, VoteValue } from '@last-comments-widgets/client'
import { buttonClass } from './button-classes'

export type VoteEvent = { id: string; value: VoteValue } | { id: string; clear: true }

// Arrow vote buttons. Clicking the active vote clears it.
@Component({
  selector: 'lc-vote-buttons',
  imports: [LucideArrowUp, LucideArrowDown],
  template: `
    <div class="lc-vote flex items-center gap-0.5">
      <button
        type="button"
        [attr.aria-pressed]="comment().viewerVote === 1"
        aria-label="Upvote"
        (click)="cast(1)"
        [class]="comment().viewerVote === 1 ? activeClass : idleClass"
      >
        <svg lucideArrowUp [size]="14"></svg>
      </button>
      <span class="min-w-6 text-center text-sm text-muted-foreground" aria-live="polite">{{ comment().score }}</span>
      <button
        type="button"
        [attr.aria-pressed]="comment().viewerVote === -1"
        aria-label="Downvote"
        (click)="cast(-1)"
        [class]="comment().viewerVote === -1 ? activeClass : idleClass"
      >
        <svg lucideArrowDown [size]="14"></svg>
      </button>
    </div>
  `,
})
export class LcVoteButtonsComponent {
  readonly comment = input.required<Comment>()
  readonly vote = output<VoteEvent>()
  protected readonly activeClass = buttonClass('default', 'sm')
  protected readonly idleClass = buttonClass('ghost', 'sm')

  cast(value: VoteValue): void {
    const comment = this.comment()
    if (comment.viewerVote === value) this.vote.emit({ id: comment.id, clear: true })
    else this.vote.emit({ id: comment.id, value })
  }
}
