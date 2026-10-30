import { Directive, effect, ElementRef, inject, input, NgZone, type OnDestroy, output } from '@angular/core'
import {
  loadTurnstile,
  resolveTurnstileConfig,
  type TurnstileApi,
  type TurnstileOptions,
  type TurnstileRenderConfig,
} from '@last-comments-widgets/client/enhance'

// Renders a Cloudflare Turnstile challenge inside the host element and emits
// the token. Call reset() after every submit (the token is single-use). The
// effect re-renders only when the resolved render params actually change, so a
// host binding an object literal cannot thrash the widget.
@Directive({ selector: '[lcTurnstile]', standalone: true })
export class LcTurnstileDirective implements OnDestroy {
  siteKey = input<string | undefined>(undefined, { alias: 'lcTurnstile' })
  dark = input(false)
  turnstileOptions = input<TurnstileOptions | undefined>(undefined)
  token = output<string>()
  expired = output<void>()

  #api: TurnstileApi | undefined
  #widgetId: string | undefined
  #renderKey = ''
  #generation = 0
  #destroyed = false

  private el = inject<ElementRef<HTMLElement>>(ElementRef)
  private zone = inject(NgZone)

  constructor() {
    effect(() => {
      const siteKey = this.siteKey()
      const config = resolveTurnstileConfig(this.dark(), this.turnstileOptions())
      const renderKey = [
        siteKey ?? '',
        config.theme,
        config.size ?? '',
        config.appearance ?? '',
        config.language ?? '',
      ].join('|')
      if (renderKey === this.#renderKey) return
      this.#renderKey = renderKey
      void this.#mount(siteKey, config)
    })
  }

  async #mount(siteKey: string | undefined, config: TurnstileRenderConfig): Promise<void> {
    const generation = ++this.#generation
    // A widget re-render is a token reset: the old challenge cannot be posted.
    this.#remove(true)
    if (!siteKey || typeof document === 'undefined') return
    let api: TurnstileApi
    try {
      api = await loadTurnstile()
    } catch (error) {
      console.error('[last-comments-widgets] Turnstile failed to load', error)
      return
    }
    if (generation !== this.#generation || this.#destroyed) return
    this.#api = api
    this.zone.runOutsideAngular(() => {
      try {
        this.#widgetId =
          api.render(this.el.nativeElement, {
            sitekey: siteKey,
            ...config,
            callback: (token: string) => this.zone.run(() => this.#emitToken(token)),
            'expired-callback': () => this.zone.run(() => this.#emitExpired()),
            'error-callback': () => this.zone.run(() => this.#emitExpired()),
          }) ?? undefined
      } catch (error) {
        // Turnstile rejects invalid render parameters by throwing rather than
        // calling error-callback; clear the token so submit stays off.
        console.error('[last-comments-widgets] Turnstile rejected the widget parameters', error)
        this.zone.run(() => this.#emitExpired())
      }
    })
  }

  #emitToken(token: string): void {
    if (!this.#destroyed) this.token.emit(token)
  }

  #emitExpired(): void {
    if (!this.#destroyed) this.expired.emit()
  }

  #remove(emitExpired: boolean): void {
    if (this.#widgetId === undefined) return
    const id = this.#widgetId
    this.#widgetId = undefined
    try {
      this.#api?.remove(id)
    } catch {
      // Already gone with its DOM.
    }
    if (emitExpired) this.zone.run(() => this.#emitExpired())
  }

  ngOnDestroy(): void {
    this.#destroyed = true
    this.#generation += 1
    this.#remove(false)
  }

  reset(): void {
    if (this.#widgetId !== undefined) this.#api?.reset(this.#widgetId)
  }
}
