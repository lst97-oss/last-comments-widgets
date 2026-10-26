import '@angular/compiler'
import { Component } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { LcCommentsComponent, LcCommentViewerComponent } from '@last-comments-widgets/angular'

// The browser fixture loads the published partial compilation output through JIT, as the examples do.
// `?viewer` mounts the read-only viewer instead, so its gate is checked on the same policy.
class Fixture {
  readonly viewer = new URLSearchParams(location.search).has('viewer')
}
Component({
  selector: 'lc-settings-fixture',
  standalone: true,
  imports: [LcCommentsComponent, LcCommentViewerComponent],
  template: `@if (viewer) {
    <lc-comment-viewer site="s" baseUrl="http://api.test" pageUrl="http://localhost/p" />
  } @else {
    <lc-comments site="s" baseUrl="http://api.test" pageUrl="http://localhost/p" />
  }`,
})(Fixture)
await bootstrapApplication(Fixture)
