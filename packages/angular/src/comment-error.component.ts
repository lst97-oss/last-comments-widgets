import { Component, input, output } from '@angular/core'
import type { ErrorInfo } from '@lst97-oss/client'

// The one error block every surface renders; copy comes from the shared
// describeError, so no widget invents strings. Hidden while info is null.
@Component({
  selector: 'lc-comment-error',
  standalone: true,
  template: `
    @if (info(); as error) {
      <div
        role="alert"
        data-lc-error
        [attr.data-error-code]="error.code ?? ''"
        class="lc-error flex items-start gap-2 rounded-lg border bg-card px-2.5 py-2 text-left text-sm text-destructive"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          class="mt-px size-4 shrink-0"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
        <div class="min-w-0 flex-1">
          <p class="font-medium">{{ error.title }}</p>
          <p class="mt-0.5 text-destructive/90">{{ error.message }}</p>
          @if (error.action !== 'none') {
            <div class="mt-2 flex flex-wrap items-center gap-2">
              @if (error.action === 'retry') {
                <button
                  type="button"
                  (click)="retry.emit()"
                  class="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-sm font-medium hover:bg-accent"
                >
                  Try again
                </button>
              } @else {
                @if (signInHref(); as signInLink) {
                  <a
                    [href]="signInLink"
                    class="inline-flex h-8 items-center rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >Sign in</a
                  >
                } @else {
                  <button
                    type="button"
                    (click)="signIn.emit()"
                    class="inline-flex h-8 items-center rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Sign in
                  </button>
                }
              }
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class LcCommentErrorComponent {
  info = input<ErrorInfo | null>(null)
  signInHref = input<string | undefined>(undefined)
  retry = output<void>()
  signIn = output<void>()
}
