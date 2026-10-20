---
'@lst97-oss/last-comments-widgets': patch
---

Loading placeholders now trace the real comment rows in all four ports: a 24 px collapse control and avatar, author/time meta, the viewer's right-aligned score (or the interactive menu/vote/reply slots), `my-3` body lines, and no fake action pills. The read-only viewer variant omits the interactive controls entirely, and the skeleton container inherits the same card padding/border/radius/shadow knobs as `.lc-comment`.
