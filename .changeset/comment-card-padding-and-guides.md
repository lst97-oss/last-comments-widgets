---
"@lst97-oss/last-comments-widgets": patch
---

A comment card now keeps its content off its own edge: the default `cardPadding` is three spacing units (12px) instead of 0, matching the composer, so text, code blocks and actions no longer sit flush against the rounded card on a dark surface. A host that wants a flush card still sets `cardPadding: '0px'`.

The reply guide rails now ride the middle of each comment card's own left padding instead of a gutter outside the card, so a rail stays inside the card it belongs to and is never cut off by the card's edge or pushed outside the container. Every port (React, Vue, Angular, vanilla) measures the same rail.
