---
'@lst97-oss/last-comments-widgets': minor
---

Widgets read the site's policy from the comments service instead of relying on the host to copy it.

- A new `settings` prop takes the whole policy as one object. `bodyLimit`, `anonEditWindowMinutes` and `turnstileSiteKey` still work, and win over the policy when set.
- Without `settings`, the widget reads `GET /api/comments/settings` once per site, cached for a minute. A failed read falls back to the built-in defaults, and the service still enforces every rule.
- On a site that asks visitors to sign in, a signed-out visitor sees a sign-in block where the list or the composer would be, instead of a refused request. The Anonymous option appears only on open sites.
- `features.votes` turns voting off for a site: the arrows are hidden. A guest who clicks an arrow is asked to sign in, with no request sent.
- A guest deletes their own comment with the edit key they were issued, from the browser that stored it. The API sends the key in a header, so it stays out of the URL.
- A deleted comment stays in the thread as `[This comment was deleted]`, and its replies stay under it. The text used to read `[deleted]`, and the header showed the author's name.

The endpoint needs a last-comments service that serves it. An older service answers 404, and the widget then behaves as it did before.
