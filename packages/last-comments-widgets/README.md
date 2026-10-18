# @lst97-oss/last-comments-widgets

Drop-in comment widgets for a [last-comments](https://github.com/lst97-oss/last-comments-widgets) server: the same widget implemented natively for React, Vue, Angular and plain HTML, on one framework-free API client and one self-contained Tailwind v4 + shadcn `base-nova` theme.

One package, one version, subpath exports — you install only the framework you use.

## Install

```bash
bun add @lst97-oss/last-comments-widgets   # or npm install @lst97-oss/last-comments-widgets
```

Only your framework is a peer dependency (React 19, Vue 3.5 or Angular 22); the others are optional peers and are never loaded.

## Usage

React 19:

```tsx
import { Comments } from '@lst97-oss/last-comments-widgets/react'
import '@lst97-oss/last-comments-widgets/react/styles.css'

<Comments site="demo" baseUrl="https://comments.example.com" turnstileSiteKey="…" />
```

Vue 3:

```vue
<script setup lang="ts">
import { Comments } from '@lst97-oss/last-comments-widgets/vue'
import '@lst97-oss/last-comments-widgets/vue/styles.css'
</script>

<template>
  <Comments site="demo" base-url="https://comments.example.com" turnstile-site-key="…" />
</template>
```

Angular 22:

```ts
import { LcCommentsComponent } from '@lst97-oss/last-comments-widgets/angular'
import '@lst97-oss/last-comments-widgets/angular/styles.css'

@Component({ imports: [LcCommentsComponent], template: `<lc-comments site="demo" baseUrl="…" />` })
export class AppComponent {}
```

Plain HTML, no build step:

```html
<link rel="stylesheet" href="https://unpkg.com/@lst97-oss/last-comments-widgets/dist/vanilla/styles.css" />
<div data-lc-comments data-lc-site="demo" data-lc-base-url="https://comments.example.com"></div>
<script type="importmap">
  { "imports": { "marked": "https://unpkg.com/marked/lib/marked.esm.js" } }
</script>
<script type="module" src="https://unpkg.com/@lst97-oss/last-comments-widgets/dist/vanilla/index.js"></script>
```

## Entry points

| Import | What it gives you |
| --- | --- |
| `@lst97-oss/last-comments-widgets` · `…/client` | The framework-free API client: `createClient`, `listCommentsPage`, `loadThreadWindow`, `buildCommentTree`, `describeError`, `renderMarkdown`, `themeVarsToStyle`, `isEditWindowOpen`, `canModerate` and the exported types |
| `…/react` | `Comments`, `CommentViewer`, `VoteButtons`, `CommentsTheme` |
| `…/vue` | The same components as Vue SFCs |
| `…/angular` | `LcCommentsComponent`, `LcCommentViewerComponent`, the vote buttons and the Turnstile directive |
| `…/vanilla` | `mountComments`, `renderCommentViewer` for plain HTML |
| `…/theme.css` | The theme tokens on their own |
| `…/{react,vue,angular,vanilla}/styles.css` | The compiled widget stylesheet for that framework |

## Highlights

- Threads page by **thread**, not by row: a page shows `limit` (default 20) top-level comments with their replies, filled before it renders, with `Previous` served from memory. Loading states are skeletons, and `lazy` defers every request until the widget scrolls into view.
- Guests post with a name + Cloudflare Turnstile; signed-in viewers get votes and Edit/Delete, and the composer is disabled while the session probe is in flight so a comment can never post with a guessed identity.
- `theme="light | dark | system"` plus per-instance `themeVars`, scoped with native CSS `@scope` so importing the widget CSS does not touch your page's fonts, colors or margins.
- Every failure renders one alert block with copy from `describeError()`, carrying `data-lc-error` / `data-error-code`.
- Markdown (GitHub-flavored) with raw HTML stripped and `http(s)`/`mailto` links only.
- `viewerRole` adds inline, server-authorized moderation; `CommentViewer` renders a read-only list.

Full documentation — props, theming, pagination, moderation, error codes and the client API — lives in the [repository README](https://github.com/lst97-oss/last-comments-widgets#readme).

## Requirements

- Register the page origin in the server's `site_origins` table, or every call fails with `ORIGIN_NOT_ALLOWED`.
- The API never returns `Access-Control-Allow-Credentials`, so a cross-origin embed cannot list, post, vote or moderate: route `/api/*` through a same-origin proxy. Moderation additionally needs `Origin` rewritten for `/api/moderation`, whose POST is origin-checked.
- A browser with `@scope` support.

## Licence

MIT — Copyright (c) 2026 lst97-oss
