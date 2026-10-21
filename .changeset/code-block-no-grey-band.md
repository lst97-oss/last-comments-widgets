---
'@lst97-oss/last-comments-widgets': patch
---

Highlighted code blocks no longer show a grey band around the code. The muted
fill now belongs to the plain fallback block only, so a Shiki-highlighted block
paints its own background (light and dark) instead of leaving a muted frame
around the highlighted code.
