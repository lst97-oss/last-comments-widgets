---
"@lst97-oss/last-comments-widgets": minor
---

Signed-in accounts are labelled in every framework. Site admins keep their badge but now use the destructive colour for the name and the badge; signed-in accounts with no site role get a neutral `Member` badge. Both are themeable through the new `adminNameColor`, `adminBadgeBackground`, `adminBadgeForeground`, `memberBadgeBackground` and `memberBadgeForeground` tokens.

A sign-in the provider rejects now returns the reader to the page they started on with `?lc_sign_in=failed&error=<code>`, and the widget explains the failure under the identity control instead of silently showing `Anonymous`.

Behaviour change: the Turnstile challenge is hidden by default (`turnstileOptions.appearance` now defaults to `interaction-only`). Set it to `always` to keep the box visible.

Cross-origin embeds: a page on the same registrable domain as the API now works only when the last-comments server sends credentialed CORS and trusts registered origins, which needs a last-comments server release newer than v0.2.0. A different registrable domain still needs a same-origin proxy.
