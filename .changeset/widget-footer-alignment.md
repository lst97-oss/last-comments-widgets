---
'@lst97-oss/last-comments-widgets': patch
---

Every widget now renders a small **Powered by last-comments** footnote with a link to the project, in both the comments widget and the read-only viewer (`.lc-footer` is the shared styling hook). The composer footer's Markdown hint, Cancel and submit button are grouped and pushed to the right in every port, fixing the off-centre hint in Vue and vanilla and keeping the submit button right-aligned when the hint is hidden on narrow screens.
