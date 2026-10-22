import { type Ref, useCallback, useContext, useImperativeHandle, useRef } from 'react'
import { loadTurnstile, resolveTurnstileConfig, type TurnstileApi } from './lib/turnstile'
import { TurnstileConfigContext } from './TurnstileConfig'

export type TurnstileInstance = {
  reset: () => void
}

type TurnstileProps = {
  siteKey: string
  // Must be stable (pass a state setter): it is a dependency of the ref
  // callback below, so a new function every render would detach and re-render
  // the challenge on every keystroke.
  onToken: (token: string | undefined) => void
  ref?: Ref<TurnstileInstance>
}

type AttachedWidget = { api: TurnstileApi; id: string }

// Cloudflare Turnstile for the composer, driven by a React 19 ref
// callback instead of an effect: committing the div is the moment to attach an
// external widget, the callback identity change is exactly a re-attach, and
// the cleanup it returns covers unmount and the extra StrictMode cycle.
export function Turnstile({ siteKey, onToken, ref }: TurnstileProps) {
  const { dark, options } = useContext(TurnstileConfigContext)
  // Cloudflare draws the challenge inside a cross-origin iframe, so light/dark
  // is the only design surface it has. Following the widget's own mode keeps
  // the box consistent with the theme it is embedded in.
  const { theme, size, appearance, language } = resolveTurnstileConfig(dark, options)
  const widgetRef = useRef<AttachedWidget | null>(null)

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return
      let disposed = false
      loadTurnstile().then(
        (api) => {
          if (disposed) return
          try {
            const id = api.render(node, {
              sitekey: siteKey,
              theme,
              size,
              appearance,
              language,
              callback: onToken,
              'expired-callback': () => onToken(undefined),
              'error-callback': () => onToken(undefined),
            })
            widgetRef.current = id ? { api, id } : null
          } catch (error) {
            // Turnstile rejects invalid render parameters by throwing rather
            // than calling error-callback; clear the token so submit stays off.
            console.error('[last-comments-widgets] Turnstile rejected the widget parameters', error)
            onToken(undefined)
          }
        },
        (error: unknown) => {
          if (!disposed) console.error('[last-comments-widgets] Turnstile failed to load', error)
        },
      )
      return () => {
        disposed = true
        const widget = widgetRef.current
        widgetRef.current = null
        if (widget) widget.api.remove(widget.id)
      }
    },
    [siteKey, onToken, theme, size, appearance, language],
  )

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        const widget = widgetRef.current
        if (widget) widget.api.reset(widget.id)
      },
    }),
    [],
  )

  // `.lc-turnstile` is the shared DOM hook for the container. Cloudflare owns
  // everything inside the iframe, so hosts can only position/spacing-style this
  // wrapper (and pick a light/dark theme) — not its background, border or shadow.
  return <div ref={attach} className="lc-turnstile" />
}
