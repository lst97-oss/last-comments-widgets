import { Component, computed, input, output, signal } from '@angular/core'
import type { ReactionSummary } from '@last-comments-widgets/client'
import { LucideSmilePlus } from '@lucide/angular'
import { buttonClass } from './button-classes'
import type { ReactionMode } from './types'

export type ReactionEvent = { emoji: string; viewerReacted: boolean }

// One row of reaction chips. `picker` (a comment) shows the reactions it has, and a control that opens the
// whole allowed set; without it (the page bar) the row is the allowed set.
@Component({
  selector: 'lc-reaction-bar',
  imports: [LucideSmilePlus],
  template: `
    @if (mode() !== 'off' && (shown().length > 0 || (picker() && mode() === 'interactive'))) {
      <div class="lc-reactions flex flex-wrap items-center gap-1" role="group" [attr.aria-label]="label()">
        @for (emoji of shown(); track emoji) {
          <button
            type="button"
            [class]="'lc-reaction ' + chipClass"
            [attr.aria-pressed]="reactionFor(emoji).viewerReacted"
            [attr.aria-label]="emoji + ', ' + reactionFor(emoji).count + ' ' + reactionWord(emoji)"
            [disabled]="pending() || mode() === 'counts'"
            (click)="react.emit({ emoji, viewerReacted: reactionFor(emoji).viewerReacted })"
          >
            <span aria-hidden="true">{{ emoji }}</span>
            @if (reactionFor(emoji).count > 0) {
              <span class="lc-reaction-count text-xs tabular-nums">{{ reactionFor(emoji).count }}</span>
            }
          </button>
        }
        @if (picker() && mode() === 'interactive') {
          <button
            type="button"
            [class]="'lc-action lc-reaction-add ' + iconClass"
            [attr.aria-expanded]="picking()"
            [attr.aria-label]="picking() ? 'Close reactions' : 'Add reaction'"
            [disabled]="pending()"
            (click)="picking.set(!picking())"
          >
            <svg lucideSmilePlus [size]="14" aria-hidden="true"></svg>
          </button>
        }
      </div>
    }
  `,
})
export class LcReactionBarComponent {
  readonly label = input('Reactions')
  readonly mode = input<ReactionMode>('off')
  readonly allowed = input<string[]>([])
  readonly reactions = input<ReactionSummary[]>([])
  readonly pending = input(false)
  readonly picker = input(false)
  readonly react = output<ReactionEvent>()
  protected readonly picking = signal(false)
  protected readonly chipClass = buttonClass('ghost', 'sm')
  protected readonly iconClass = buttonClass('ghost', 'icon-xs')
  protected readonly shown = computed<string[]>(() => {
    if (this.picker() && !(this.picking() && this.mode() === 'interactive')) {
      return this.reactions().map((reaction) => reaction.emoji)
    }
    return this.allowed()
  })

  protected reactionFor(emoji: string): ReactionSummary {
    return this.reactions().find((reaction) => reaction.emoji === emoji) ?? { emoji, count: 0, viewerReacted: false }
  }

  protected reactionWord(emoji: string): string {
    return this.reactionFor(emoji).count === 1 ? 'reaction' : 'reactions'
  }
}
