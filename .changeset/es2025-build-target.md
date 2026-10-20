---
'@lst97-oss/last-comments-widgets': patch
---

The workspace now targets the latest ratified ECMAScript standard: TypeScript authoring is pinned to `ES2025` with `lib: ["ES2025", "ESNext.Disposable", "DOM", "DOM.Iterable"]`, and every published bundle emits ES2025 (tsup `--target es2025`, Vite `build.target: 'es2025'`, Angular tsconfig target). No polyfills are shipped: hosts need a current evergreen browser, and Node 22+ when using the client outside the browser.
