---
'@lst97-oss/last-comments-widgets': minor
---

Every visual family is now a theme knob, and all four ports honor it:

- New `themeVars` keys: `borderWidth` (chrome and control borders), `avatarRadius`, `skeletonRadius`, `composerBackground`, `fontWeightMedium`, `menuZIndex`, `threadIndent`.
- Bare `rounded` utilities now follow `radius`, plain `border` utilities follow `borderWidth`, and `font-medium` follows `fontWeightMedium`, so previously fixed utility values no longer bypass the contract.
- New shared hooks: `.lc-avatar`, `.lc-skeleton`, `.lc-actions-menu`; `.lc-action` / `.lc-action-destructive` now cover every port's secondary and destructive actions.
- The identity menu takes its shadow from `dropdownShadow` and its stacking order from `menuZIndex`; the composer surface comes from `composerBackground`.
- Internal: vote results render from an overlay instead of rebuilding the list (Vue/Angular/vanilla), Angular drafts use `linkedSignal`, vanilla repaints only the affected region, and stale loads are dropped by generation counters.
