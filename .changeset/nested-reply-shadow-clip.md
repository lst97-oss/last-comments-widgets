---
'@lst97-oss/last-comments-widgets': patch
---

Nested reply cards no longer lose their border and shadow to the reply panel that contains them. The panel clipped the card's painted edges, so a host theme's card shadow was cut off in a hard line above the card and the card's bottom border lost its corners. The panel now clips with `overflow: clip` and a 16px clip margin, so the shadow paints on all four sides — in the React, Angular, and vanilla ports alike (Vue never clipped, so it is unchanged).
