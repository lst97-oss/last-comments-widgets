---
'@lst97-oss/last-comments-widgets': minor
---

Removed the unused modal surface from the shared theme. No port renders a dialog, and the six React component sources that could have (`Card`, `Dialog`, `Empty`, `Separator`, `Spinner`, `Tooltip`) were unreferenced, so the `.lc-dialog` and `.lc-dialog-backdrop` rules and the `dialogShadow` and `backdrop` theme variables were dead weight. Two breaking details for hosts: the `dialogShadow` and `backdrop` `themeVars` keys are gone (passing them now does nothing — remove them from your `themeVars` object), and the `.lc-dialog`, `.lc-dialog-backdrop` and `.lc-tooltip` CSS hooks no longer exist. Every other theme variable and hook is unchanged.

This release also drops unused component sources that the CSS build was still picking up, so every React consumer downloaded ~13 KB of CSS for markup that cannot appear; the published widget markup, exports and behaviour are unchanged, the stylesheet is simply smaller.
