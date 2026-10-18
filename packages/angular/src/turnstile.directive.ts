import { Directive, ElementRef, inject, input, NgZone, type OnDestroy, type OnInit, output } from '@angular/core'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove?: (id?: string) => void
    }
    __lcTurnstileLoading?: Promise<void>
  }
}

function loadTurnstileScript(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (!window.__lcTurnstileLoading) {
    window.__lcTurnstileLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => {
        window.__lcTurnstileLoading = undefined
        reject(new Error('Failed to load Turnstile'))
      }
      document.head.appendChild(script)
    })
  }
  return window.__lcTurnstileLoading
}

// Renders a Cloudflare Turnstile challenge inside the host element and
// emits the token. Call reset() after every submit (token is single-use).
@Directive({ selector: '[lcTurnstile]', standalone: true })
export class LcTurnstileDirective implements OnInit, OnDestroy {
  siteKey = input<string | undefined>(undefined, { alias: 'lcTurnstile' })
  token = output<string>()
  expired = output<void>()

  #widgetId: string | undefined

  private el = inject<ElementRef<HTMLElement>>(ElementRef)
  private zone = inject(NgZone)

  async ngOnInit(): Promise<void> {
    const key = this.siteKey()
    if (!key || typeof document === 'undefined') return
    await loadTurnstileScript()
    this.zone.runOutsideAngular(() => {
      this.#widgetId = window.turnstile?.render(this.el.nativeElement, {
        sitekey: key,
        callback: (token: string) => this.zone.run(() => this.token.emit(token)),
        'expired-callback': () => this.zone.run(() => this.expired.emit()),
        'error-callback': () => this.zone.run(() => this.expired.emit()),
      })
    })
  }

  ngOnDestroy(): void {
    if (this.#widgetId !== undefined) window.turnstile?.remove?.(this.#widgetId)
    this.#widgetId = undefined
  }

  reset(): void {
    if (this.#widgetId !== undefined) window.turnstile?.reset(this.#widgetId)
  }
}
