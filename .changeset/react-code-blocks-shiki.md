---
'@lst97-oss/last-comments-widgets': patch
---

React: fenced code blocks in comments and the composer preview are highlighted with Shiki (`vitesse-light`/`vitesse-dark`) after first paint, in the same docs-style frame as the last-comments blog (language label + copy button). Highlighting is lazy — nothing is downloaded until a fence exists — and an unknown or missing language keeps the plain `<pre>`. The composer's Code block action now inserts a ```` ```language ```` fence with the language token selected, and inline code moved to its own button. The other framework ports keep the plain fenced output and inline-code action until they are migrated.
