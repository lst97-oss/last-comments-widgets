import { Component, computed, input } from '@angular/core'

// Placeholder cards shared by the list and viewer roots: 3 on a first load,
// 2 while the next page is fetched.
@Component({
  selector: 'lc-comment-skeletons',
  standalone: true,
  template: `
    <div role="status" aria-busy="true" class="grid gap-3">
      <span class="sr-only">Loading comments…</span>
      <div class="grid gap-3" aria-hidden="true">
        @for (index of range(); track index) {
          <div class="rounded-lg border border-border p-4">
            <div class="flex items-center gap-3">
              <div class="lc-avatar h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted"></div>
              <div class="h-4 w-32 lc-skeleton animate-pulse rounded bg-muted"></div>
            </div>
            <div class="mt-3 space-y-2">
              <div class="h-4 w-full lc-skeleton animate-pulse rounded bg-muted"></div>
              <div class="h-4 w-4/5 lc-skeleton animate-pulse rounded bg-muted"></div>
            </div>
            <div class="mt-3 flex gap-2">
              <div class="h-6 w-16 lc-skeleton animate-pulse rounded bg-muted"></div>
              <div class="h-6 w-20 lc-skeleton animate-pulse rounded bg-muted"></div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class LcCommentSkeletonsComponent {
  count = input(3)
  readonly range = computed(() => Array.from({ length: this.count() }, (_, index) => index))
}
