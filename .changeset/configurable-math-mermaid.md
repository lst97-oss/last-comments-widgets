---
'@lst97-oss/last-comments-widgets': minor
---

Add opt-in TeX math and Mermaid diagrams, and make code highlighting switchable.

- New `math` flag (default `false`): `$…$` and `$$…$$` render through KaTeX. The shared renderer emits an escaped formula placeholder in every port and each widget upgrades it after paint from a lazily imported KaTeX, so a host that leaves the flag off downloads nothing. Currency, lone dollar runs, escaped `\$`, code spans and fenced blocks stay literal.
- New `mermaid` flag (default `false`): ```mermaid fences render through a lazily imported Mermaid, with the source block kept for a parse error, a missing library or an svg that carries script, inline handlers or a `javascript:` url. Diagrams re-render when the widget's light/dark mode flips.
- New `codeHighlight` flag (default `true`): set it to `false` to skip the post-paint Shiki upgrade (React is the only port that highlights today).
- Plain HTML gains the presence-only `data-lc-math` and `data-lc-mermaid` attributes plus `data-lc-no-code-highlight`; `katex` and `mermaid` are optional peers, installed only by hosts that enable them.
