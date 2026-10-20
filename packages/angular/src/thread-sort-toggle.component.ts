import { Component, input, output } from '@angular/core'
import type { ThreadSort } from '@last-comments-widgets/client'
import { buttonClass } from './button-classes'

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
          [class]="value() === option.value ? activeClass : idleClass"
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
  protected readonly activeClass = buttonClass('secondary', 'sm')
  protected readonly idleClass = buttonClass('ghost', 'sm')

  protected readonly options: readonly { value: ThreadSort; label: string }[] = [
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'best', label: 'Best' },
  ]
}
