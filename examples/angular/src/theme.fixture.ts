import '@angular/compiler'
import { Component, signal } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { LcCommentsComponent, LcCommentViewerComponent } from '@lst97-oss/last-comments-widgets/angular'
import { branded, options } from '../../../scripts/fixtures/theme'

// The browser fixture loads the published partial compilation output through JIT.
class Fixture {
  options = options
  themeVars = signal(branded)
  constructor() {
    window.updateTheme = (theme) => this.themeVars.set(theme)
  }
}
Component({
  selector: 'lc-theme-fixture',
  standalone: true,
  imports: [LcCommentsComponent, LcCommentViewerComponent],
  template: `
    <div id="a"><lc-comments site="demo" [baseUrl]="options.baseUrl" [pageUrl]="options.pageUrl" [themeVars]="themeVars()" /></div>
    <div id="b"><lc-comments site="demo" [baseUrl]="options.baseUrl" [pageUrl]="options.pageUrl" theme="light" [themeVars]="{ vars: { primary: '#abcdef' } }" /></div>
    <div id="viewer"><lc-comment-viewer site="demo" [baseUrl]="options.baseUrl" [pageUrl]="options.pageUrl" [themeVars]="themeVars()" /></div>
  `,
})(Fixture)
await bootstrapApplication(Fixture)
