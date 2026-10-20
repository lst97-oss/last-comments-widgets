import { Component, computed, input } from '@angular/core'

// Placeholder rows shared by the list and viewer roots: 3 on a first load,
// 2 while the next page is fetched. The viewer variant omits the interactive
// slots the real read-only row never renders (menu, vote buttons, Reply).
@Component({
  selector: 'lc-comment-skeletons',
  standalone: true,
  template: `
    <div role="status" aria-busy="true">
      <span class="sr-only">Loading comments…</span>
      <div class="grid gap-3" aria-hidden="true">
        @for (index of range(); track index) {
          <div class="lc-comment-skeleton" data-lc-skeleton>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <div class="size-6 rounded-md lc-skeleton animate-pulse bg-muted"></div>
              <div class="size-6 rounded-full lc-skeleton animate-pulse bg-muted"></div>
              <div [class]="nameClasses[index % nameClasses.length]"></div>
              <div class="h-3 w-10 lc-skeleton animate-pulse bg-muted"></div>
              @if (readOnly()) {
                <div class="ml-auto h-4 w-6 lc-skeleton animate-pulse bg-muted"></div>
              } @else {
                <div class="ml-auto size-6 rounded-md lc-skeleton animate-pulse bg-muted"></div>
                <div class="h-6 w-20 rounded-full lc-skeleton animate-pulse bg-muted"></div>
              }
            </div>
            <div class="my-3 space-y-2">
              <div class="h-4 w-full lc-skeleton animate-pulse bg-muted"></div>
              <div [class]="bodyClasses[index % bodyClasses.length]"></div>
            </div>
            @if (!readOnly()) {
              <div class="h-7 w-16 rounded-md lc-skeleton animate-pulse bg-muted"></div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class LcCommentSkeletonsComponent {
  count = input(3)
  readOnly = input(false)
  readonly range = computed(() => Array.from({ length: this.count() }, (_, index) => index))
  // Widths cycle so rows read like real comments without extra template state.
  protected readonly nameClasses = [
    'h-4 w-24 lc-skeleton animate-pulse bg-muted',
    'h-4 w-32 lc-skeleton animate-pulse bg-muted',
    'h-4 w-20 lc-skeleton animate-pulse bg-muted',
  ]
  protected readonly bodyClasses = [
    'h-4 w-3/4 lc-skeleton animate-pulse bg-muted',
    'h-4 w-2/3 lc-skeleton animate-pulse bg-muted',
    'h-4 w-4/5 lc-skeleton animate-pulse bg-muted',
  ]
}
