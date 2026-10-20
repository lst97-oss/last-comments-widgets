// Minimal Cloudflare Turnstile loader, modelled on @marsidev/react-turnstile's
// script handling (MIT) but reduced to what this widget needs: one cached
// script for the page and explicit rendering into a container we own.
// The Vue component attaches to it from a template ref — see ../Turnstile.vue.

// Cloudflare draws the challenge itself inside a cross-origin iframe (in a
// closed shadow root), so light/dark is the only design surface it exposes.
// Background, border, radius and shadow of the widget box cannot be styled —
// hosts can only theme the container around it.
export type TurnstileWidgetTheme = 'auto' | 'light' | 'dark'
export type TurnstileWidgetSize = 'normal' | 'compact' | 'flexible'
export type TurnstileWidgetAppearance = 'always' | 'interaction-only'

// TurnstileOptions are the Cloudflare render knobs the widget exposes to hosts.
export type TurnstileOptions = {
  theme?: TurnstileWidgetTheme
  size?: TurnstileWidgetSize
  appearance?: TurnstileWidgetAppearance
  language?: string
}

export type TurnstileRenderConfig = {
  theme: TurnstileWidgetTheme
  size?: TurnstileWidgetSize
  appearance?: TurnstileWidgetAppearance
  language?: string
}

export type TurnstileRenderParams = TurnstileRenderConfig & {
  sitekey: string
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': (code: string) => void
}

// Follow the widget's own light/dark mode by default so the challenge box
// matches the theme it is embedded in instead of the OS preference; an explicit
// host `theme` wins. Nothing else about the box is styleable.
export function resolveTurnstileConfig(dark: boolean, options?: TurnstileOptions): TurnstileRenderConfig {
  const config: TurnstileRenderConfig = { theme: options?.theme ?? (dark ? 'dark' : 'light') }
  if (options?.size !== undefined) config.size = options.size
  if (options?.appearance !== undefined) config.appearance = options.appearance
  if (options?.language !== undefined) config.language = options.language
  return config
}

// The slice of window.turnstile this widget calls. Cloudflare accepts widget
// ids as the container argument for reset/remove.
export type TurnstileApi = {
  render: (container: HTMLElement, params: TurnstileRenderParams) => string | null | undefined
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
const SCRIPT_ID = 'cf-turnstile-script'
const ONLOAD_CALLBACK = 'onloadTurnstileCallback'
const EXPLICIT_SRC = `${SCRIPT_URL}?onload=${ONLOAD_CALLBACK}&render=explicit`
// A host page (or a hot reload) may already own the tag; give it this long to
// define window.turnstile before giving up instead of injecting a duplicate.
const POLL_INTERVAL_MS = 50
const LOAD_TIMEOUT_MS = 10_000

type TurnstileGlobals = typeof globalThis & {
  turnstile?: TurnstileApi
  onloadTurnstileCallback?: () => void
}

function getApi(): TurnstileApi | undefined {
  return (globalThis as TurnstileGlobals).turnstile
}

function hasScript(): boolean {
  return (
    document.getElementById(SCRIPT_ID) !== null ||
    document.querySelector<HTMLScriptElement>(`script[src="${EXPLICIT_SRC}"]`) !== null
  )
}

function waitForApi(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const interval = setInterval(() => {
      const api = getApi()
      if (api) {
        clearInterval(interval)
        resolve(api)
      } else if (Date.now() - startedAt >= LOAD_TIMEOUT_MS) {
        clearInterval(interval)
        reject(new Error('Turnstile did not initialise'))
      }
    }, POLL_INTERVAL_MS)
  })
}

// Returns a load function so tests can own one loader per case; the widget
// shares the singleton below, which keeps the script count at one per page.
export function createTurnstileLoader(): () => Promise<TurnstileApi> {
  let pending: Promise<TurnstileApi> | null = null

  return function load(): Promise<TurnstileApi> {
    const ready = getApi()
    if (ready) return Promise.resolve(ready)
    if (pending) return pending
    if (typeof document === 'undefined') return Promise.reject(new Error('Turnstile requires a browser'))

    if (hasScript()) {
      pending = waitForApi().catch((error: unknown) => {
        pending = null
        throw error
      })
      return pending
    }

    pending = new Promise<TurnstileApi>((resolve, reject) => {
      const globals = globalThis as TurnstileGlobals
      // api.js calls this global once it has defined window.turnstile.
      globals.onloadTurnstileCallback = () => {
        delete globals.onloadTurnstileCallback
        const api = getApi()
        if (api) resolve(api)
        else reject(new Error('Turnstile loaded without defining window.turnstile'))
      }
      const script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = EXPLICIT_SRC
      script.async = true
      script.defer = true
      script.onerror = () => {
        delete globals.onloadTurnstileCallback
        script.remove()
        reject(new Error('Failed to load Turnstile'))
      }
      document.head.appendChild(script)
    }).catch((error: unknown) => {
      // A failed load must be retryable by the next mount, so drop the cache.
      pending = null
      throw error
    })
    return pending
  }
}

export const loadTurnstile = createTurnstileLoader()
