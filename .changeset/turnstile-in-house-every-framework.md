---
'@lst97-oss/last-comments-widgets': patch
---

Turnstile is rendered in-package in every framework. Vue no longer depends on `vue-turnstile`: its guest challenge now uses the same minimal loader/component as React, and React, Vue, Angular and vanilla all match the challenge's light/dark theme to the widget's own mode and accept `turnstileOptions` for Cloudflare's supported knobs (`theme`, `size`, `appearance`, `language`; vanilla reads them from `data-lc-turnstile-*`). Cloudflare draws the box inside a cross-origin iframe, so background/border/radius/shadow still cannot be themed — style the `.lc-turnstile` container. Behaviour is unchanged: the widget gates submit on the token, clears it on expiry/failure, resets after a successful post, and loads one `api.js` per page.
