---
'@lst97-oss/last-comments-widgets': patch
---

The reply guide line can now be turned off. Set `threadGuideDisplay: 'none'` in `themeVars` (React `themeVars`, Vue `:theme-vars`, Angular `[themeVars]`, vanilla `themeVars`), or set the `--lc-thread-guide-display` CSS variable yourself — the plain-HTML port also reads `data-lc-theme-var-thread-guide-display="none"`. The guide is decoration, so this is a theme knob rather than a component prop: one setting covers all four ports, and a host can still target the `.lc-thread-overlay` hook directly. Add `--lc-thread-indent: 0px` to also reclaim the gutter the line rode in.

`themeVars` is now the widget's single configuration object for design knobs, and keys whose value is not free-form CSS are typed — `threadGuideDisplay` accepts only `block` or `none`, so a typo is a compile error instead of a silently ignored override. The plain-HTML port drops an out-of-range value the same way it already drops an unparsable number.
