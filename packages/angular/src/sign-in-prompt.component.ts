import { Component, input, output } from '@angular/core'
import type { ErrorInfo } from '@last-comments-widgets/client'

// A sign-in request, not a failure: the neutral prompt on login and private sites. Its colours come from
// the theme tokens (--lc-signin-*), so a host retheme reaches it. The button is wired like LcCommentErrorComponent's.
@Component({
  selector: 'lc-sign-in-prompt',
  standalone: true,
  template: `
    @if (info(); as prompt) {
      <div class="lc-signin" role="status" data-lc-signin="" [attr.data-signin-context]="context()">
        <p class="font-medium">{{ prompt.title }}</p>
        <p>{{ prompt.message }}</p>
        @if (signInHref(); as signInLink) {
          <a class="lc-signin-button" [href]="signInLink">Sign in</a>
        } @else {
          <button type="button" class="lc-signin-button" (click)="signIn.emit()">Sign in</button>
        }
      </div>
    }
  `,
})
export class LcSignInPromptComponent {
  info = input<ErrorInfo | null>(null)
  // Which action was refused, so the prompt can be told apart in markup and tests.
  context = input<'read' | 'write' | 'reply' | 'vote'>('write')
  signInHref = input<string | undefined>(undefined)
  signIn = output<void>()
}
