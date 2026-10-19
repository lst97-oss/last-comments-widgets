---
'@lst97-oss/last-comments-widgets': patch
---

React: the guest composer's Cloudflare Turnstile challenge is rendered in-package (a minimal loader plus a ref-callback component), so `@marsidev/react-turnstile` is no longer a runtime dependency. The challenge now follows the widget's light/dark mode instead of the OS preference, and a new React `turnstileOptions` prop forwards Cloudflare's supported design knobs (`theme`, `size`, `appearance`, `language`); the widget box itself belongs to Cloudflare, so background/border/radius/shadow cannot be overridden — style the `.lc-turnstile` container instead. Behaviour is unchanged: the widget still gates submit on the token, clears it on expiry or failure, resets after a successful post, and survives composer remounts without reloading the script.
