import { OverlayContainer } from '@angular/cdk/overlay'
import { Component, computed, effect, input } from '@angular/core'
import { themeVarsToStyle, type WidgetTheme } from '@last-comments-widgets/client'
import { LcWidgetOverlayContainer } from './overlay-container'
import { prefersDark, subscribeSystemTheme } from './theme-media'
import type { Theme } from './types'

// Scope and portal ownership for hosts composing the exported pieces: the theme tokens, dark mode and
// the menus' root, so a composed comment inherits the same look as the widget.
@Component({
  selector: 'lc-comments-theme',
  template: `<div class="lc-theme" [class.dark]="dark()" [style]="themeStyle()"><ng-content /></div>`,
  providers: [{ provide: OverlayContainer, useClass: LcWidgetOverlayContainer }],
})
export class LcCommentsThemeComponent {
  readonly theme = input<Theme>('system')
  readonly themeVars = input<WidgetTheme | undefined>(undefined)

  readonly systemDark = prefersDark()
  readonly dark = computed(() =>
    this.theme() === 'dark' ? true : this.theme() === 'light' ? false : this.systemDark(),
  )
  readonly themeStyle = computed<Record<string, string>>(() => themeVarsToStyle(this.themeVars(), this.dark()))

  constructor() {
    // The media query is a shared singleton; only system-themed instances join it.
    effect((onCleanup) => {
      if (this.theme() !== 'system') return
      onCleanup(subscribeSystemTheme())
    })
  }
}
