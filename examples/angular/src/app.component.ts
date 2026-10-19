import { Component, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { BrowserModule } from '@angular/platform-browser'
import { LcCommentsComponent, LcCommentViewerComponent } from '@lst97-oss/last-comments-widgets/angular'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [BrowserModule, FormsModule, LcCommentsComponent, LcCommentViewerComponent],
  template: `
    <main class="lc-theme" style="max-width: 42rem; margin: 0 auto; padding: 1.5rem; display: grid; gap: 1rem;">
      <h1>last-comments Angular demo</h1>
      <lc-comments
        [site]="site()"
        [baseUrl]="baseUrl()"
        [turnstileSiteKey]="turnstileSiteKey() || undefined"
        [viewerUserId]="viewerUserId() || undefined"
        [viewerRole]="viewerRole() || undefined"
        [actionMode]="actionMode()"
        [bodyLimit]="bodyLimit()"
      />
      <h2>Read-only viewer</h2>
      <lc-comment-viewer [site]="site()" [baseUrl]="baseUrl()" />
      <details>
        <summary>Advanced settings</summary>
        <label>Site key <input [(ngModel)]="site" /></label>
        <label>API base URL <input [(ngModel)]="baseUrl" /></label>
        <label>Turnstile site key <input [(ngModel)]="turnstileSiteKey" /></label>
        <label>Viewer user ID (empty = guest) <input [(ngModel)]="viewerUserId" /></label>
        <label>
          Viewer role (admin/moderator show inline moderation; needs a same-origin API)
          <select [(ngModel)]="viewerRole">
            <option value="">none</option>
            <option value="admin">admin</option>
            <option value="moderator">moderator</option>
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
  site = signal('demo')
  baseUrl = signal('http://localhost:3000')
  turnstileSiteKey = signal('')
  viewerUserId = signal('')
  viewerRole = signal<'admin' | 'moderator' | ''>('')
  actionMode = signal<'icon' | 'icon-text' | 'text'>('icon-text')
  bodyLimit = signal(10_000)
}
