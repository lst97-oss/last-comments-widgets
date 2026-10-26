import { Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import {
  LcCommentsComponent,
  LcCommentViewerComponent,
  type ActionMode,
  type Theme,
  type TurnstileOptions,
} from '@lst97-oss/last-comments-widgets/angular'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, LcCommentsComponent, LcCommentViewerComponent],
  template: `
    <main class="lc-theme demo">
      <h1>last-comments Angular demo</h1>
      <p>
        The dev server proxies <code>/api</code> to <code>http://localhost:3000</code>, so the widgets use this origin
        for cookies and moderation. Enter a Turnstile site key to exercise posting.
      </p>
      <label>
        Widget theme
        <select [(ngModel)]="theme">
          <option value="system">system</option>
          <option value="light">light</option>
          <option value="dark">dark</option>
        </select>
      </label>
      <lc-comments
        [site]="site"
        [baseUrl]="baseUrl"
        [pageUrl]="pageUrl || undefined"
        [theme]="theme"
        [turnstileSiteKey]="turnstileSiteKey || undefined"
        [turnstileOptions]="turnstileOptions"
        [viewerUserId]="viewerUserId || undefined"
        [viewerRole]="viewerRole || undefined"
        [actionMode]="actionMode"
        [bodyLimit]="bodyLimit"
        [math]="math"
        [mermaid]="mermaid"
        [codeHighlight]="codeHighlight"
      />
      <h2>Read-only viewer</h2>
      <lc-comment-viewer
        [site]="site"
        [baseUrl]="baseUrl"
        [pageUrl]="pageUrl || undefined"
        [theme]="theme"
        [math]="math"
        [mermaid]="mermaid"
        [codeHighlight]="codeHighlight"
      />
      <details>
        <summary>Advanced settings</summary>
        <label>Site key <input [(ngModel)]="site" /></label>
        <label>API base URL <input [(ngModel)]="baseUrl" /></label>
        <label>Page URL (empty = current page) <input [(ngModel)]="pageUrl" /></label>
        <label>Turnstile site key <input [(ngModel)]="turnstileSiteKey" /></label>
        <label>
          Turnstile theme override
          <select [ngModel]="turnstileTheme" (ngModelChange)="onTurnstileThemeChange($event)">
            <option value="">widget mode</option>
            <option value="auto">auto</option>
            <option value="light">light</option>
            <option value="dark">dark</option>
          </select>
        </label>
        <label>Viewer user ID (empty = guest) <input [(ngModel)]="viewerUserId" /></label>
        <label>
          Viewer role (admin shows inline moderation; needs a same-origin API)
          <select [(ngModel)]="viewerRole">
            <option value="">none</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label>
          Action mode
          <select [(ngModel)]="actionMode">
            <option value="icon">icon</option>
            <option value="icon-text">icon-text</option>
            <option value="text">text</option>
          </select>
        </label>
        <label>Body limit <input type="number" [(ngModel)]="bodyLimit" /></label>
      </details>
    </main>
  `,
})
export class AppComponent {
  site = 'demo'
  // Same-origin by default so the CLI proxy carries cookies and rewrites Origin
  // for the moderator endpoints; the advanced settings can point elsewhere.
  baseUrl = typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin
  pageUrl = ''
  turnstileSiteKey = ''
  turnstileTheme: '' | 'auto' | 'light' | 'dark' = ''
  turnstileOptions: TurnstileOptions | undefined = undefined
  viewerUserId = ''
  viewerRole: '' | 'admin' = ''
  actionMode: ActionMode = 'icon-text'
  theme: Theme = 'system'
  bodyLimit = 10_000
  // mount-time only: ?math / ?mermaid / ?noHighlight exercise the render flags
  math = new URLSearchParams(window.location.search).has('math')
  mermaid = new URLSearchParams(window.location.search).has('mermaid')
  codeHighlight = !new URLSearchParams(window.location.search).has('noHighlight')

  onTurnstileThemeChange(value: string): void {
    this.turnstileTheme = value === 'auto' || value === 'light' || value === 'dark' ? value : ''
    this.turnstileOptions = this.turnstileTheme ? { theme: this.turnstileTheme } : undefined
  }
}
