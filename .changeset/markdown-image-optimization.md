---
'@lst97-oss/last-comments-widgets': patch
---

Markdown images (`![alt](url)`) now render the way the widget's avatars
already do: lazily loaded, decoded asynchronously and sent without a
referrer. A bare image also links to itself, so clicking it opens the full
size, while an image the author already linked keeps that link.

Plain image URLs are still rendered as links — only the markdown form embeds
an image — and an image whose source cannot load (`mailto:`, `data:`,
`javascript:`) falls back to its alt text as before.
