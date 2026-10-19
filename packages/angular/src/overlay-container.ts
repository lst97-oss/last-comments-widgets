import { OverlayContainer } from '@angular/cdk/overlay'
import { ElementRef, inject, Injectable } from '@angular/core'

// The CDK appends its overlay container to <body>, which sits outside the
// widget's `@scope (.lc-comments)` theme root — a portaled menu would lose every
// token. Re-parent the container into the themed root once, on creation.
@Injectable()
export class LcWidgetOverlayContainer extends OverlayContainer {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef)

  protected override _createContainer(): void {
    super._createContainer()
    const container = this._containerElement
    if (!container) return
    const host = this.#host.nativeElement
    // A root component owns its `.lc-comments` div; a bare list sits inside one.
    const root = host.closest('.lc-comments') ?? host.querySelector('.lc-comments')
    if (root) root.appendChild(container)
  }
}
