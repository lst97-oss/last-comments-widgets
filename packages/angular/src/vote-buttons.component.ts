import { Component, input, output } from '@angular/core'
import type { Comment, VoteValue } from '@last-comments-widgets/client'

export type VoteEvent = { id: string; value: VoteValue } | { id: string; clear: true }

// ▲/▼ vote buttons. Clicking the active vote clears it.
@Component({
  selector: 'lc-vote-buttons',
  standalone: true,
  template: `
    <div class="lc-vote flex items-center gap-1" role="group" aria-label="Vote on comment">
      <button
        type="button"
        [attr.aria-pressed]="comment().viewerVote === 1"
        [attr.aria-label]="'Upvote comment by ' + comment().authorName"
        (click)="cast(1)"
        [class]="
          'rounded px-1.5 py-0.5 text-sm transition-colors hover:bg-accent ' +
          (comment().viewerVote === 1 ? 'text-primary' : 'text-muted-foreground')
        "
      >
        ▲
      </button>
      <span class="min-w-6 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">{{
        comment().score
      }}</span>
      <button
        type="button"
        [attr.aria-pressed]="comment().viewerVote === -1"
        [attr.aria-label]="'Downvote comment by ' + comment().authorName"
        (click)="cast(-1)"
        [class]="
          'rounded px-1.5 py-0.5 text-sm transition-colors hover:bg-accent ' +
          (comment().viewerVote === -1 ? 'text-primary' : 'text-muted-foreground')
        "
      >
        ▼
      </button>
    </div>
  `,
})
export class LcVoteButtonsComponent {
  comment = input.required<Comment>()
  vote = output<VoteEvent>()
  cast(value: VoteValue): void {
    const comment = this.comment()
    if (comment.viewerVote === value) this.vote.emit({ id: comment.id, clear: true })
    else this.vote.emit({ id: comment.id, value })
  }
}
