---
'@lst97-oss/last-comments-widgets': minor
---

Framework runtime libraries are now optional peer dependencies. After upgrading, install your framework's set alongside the package: React `@base-ui/react lucide-react class-variance-authority clsx tailwind-merge` (plus `shiki` if comment code fences should be syntax-highlighted), Vue `@lucide/vue reka-ui clsx tailwind-merge`, Angular `@angular/cdk @lucide/angular`; plain HTML needs nothing new — only `marked` stays a hard dependency. This drops roughly 145 MB of never-imported dependencies from a single-framework install.

Also in this release: the deprecated `lucide-vue-next` is replaced by its maintained rename `@lucide/vue`, the React port's `cn` package dependency is replaced by the same `clsx` + `tailwind-merge` helper the Vue port already ships, and the vanilla bundle now ships unminified so all four ports deliver the same readable source.
