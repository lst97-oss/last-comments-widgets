import { Component, input, output } from '@angular/core'
import type { ThreadSort } from '@last-comments-widgets/client'

// Size/shape of the shadcn `sm` button; the toggle only switches variants.
const BUTTON_CLASS =
  'inline-flex shrink-0 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border border-transparent px-2.5 h-7 text-[length:calc(var(--lc-font-size,1rem)*0.8)] font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
const ACTIVE_CLASS =
  'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]'
const IDLE_CLASS = 'hover:bg-muted hover:text-foreground'

// Sort toolbar: pinned rows lead every mode, these three order the unpinned ones.
@Component({
  selector: 'lc-thread-sort-toggle',
  template: `
    <div class="flex items-center gap-1" role="toolbar" aria-label="Sort comments">
      <span class="mr-1 text-xs text-muted-foreground">Sort</span>
      @for (option of options; track option.value) {
        <button
          type="button"
          [attr.aria-pressed]="value() === option.value"
          (click)="sortChange.emit(option.value)"
          [class]="buttonClass(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class LcThreadSortToggleComponent {
  readonly value = input.required<ThreadSort>()
  readonly sortChange = output<ThreadSort>()

  protected readonly options: readonly { value: ThreadSort; label: string }[] = [
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'best', label: 'Best' },
  ]

  protected buttonClass(value: ThreadSort): string {
    return `${BUTTON_CLASS} ${this.value() === value ? ACTIVE_CLASS : IDLE_CLASS}`
  }
}
