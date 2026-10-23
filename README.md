# last-comments-widgets

<img width="600" height="1000" alt="Screenshot 2026-10-22 at 1 13 52 am" src="https://github.com/user-attachments/assets/b318ab0a-f5ac-4bca-97fd-4519d06c485c" />

Standard drop-in comment widgets for [last-comments](https://github.com/lst97-oss/last-comments) — for consumers who don't want to build their own UI. Native widgets for React, Vue, Angular, and plain HTML, all sharing one API client and one self-contained Tailwind v4 + shadcn `base-nova` theme, all shipped in one package with a subpath per framework (`/react`, `/vue`, `/angular`, `/vanilla`, plus `/client` and `/theme.css`).

## Install

```bash
bun add @lst97-oss/last-comments-widgets   # or npm install @lst97-oss/last-comments-widgets
```

Then add the runtime libraries your framework's widget imports — every other framework's libraries are optional peers and are never installed:

```bash
# React
bun add @base-ui/react lucide-react class-variance-authority clsx tailwind-merge
# …plus shiki, only if comment code fences should be syntax-highlighted
bun add shiki

# Vue
bun add @lucide/vue reka-ui clsx tailwind-merge

# Angular
bun add @angular/cdk @lucide/angular

# Plain HTML: nothing more — the widget bundle and the theme are self-contained
```

## Usage

React:

```tsx
import { Comments } from '@lst97-oss/last-comments-widgets/react'
import '@lst97-oss/last-comments-widgets/react/styles.css'

;<Comments site="demo" baseUrl="https://comments.example.com" turnstileSiteKey="…" />
```

Vue:

```vue
<script setup lang="ts">
import { Comments } from "@lst97-oss/last-comments-widgets/vue";
import "@lst97-oss/last-comments-widgets/vue/styles.css";
</script>

<template>
  <Comments
    site="demo"
    base-url="https://comments.example.com"
    turnstile-site-key="…"
  />
</template>
```

Angular:

```ts
import { LcCommentsComponent } from '@lst97-oss/last-comments-widgets/angular'
import '@lst97-oss/last-comments-widgets/angular/styles.css'

@Component({
  imports: [LcCommentsComponent],
  template: `<lc-comments site="demo" baseUrl="…" />`,
})
export class AppComponent {}
```

Plain HTML (no build step):

```html
<link
  rel="stylesheet"
  href="https://unpkg.com/@lst97-oss/last-comments-widgets/dist/vanilla/styles.css"
/>
<div
  data-lc-comments
  data-lc-site="demo"
  data-lc-base-url="https://comments.example.com"
></div>
<script type="importmap">
  {
    "imports": {
      "marked": "https://unpkg.com/marked/lib/marked.esm.js"
    }
  }
</script>
<script
  type="module"
  src="https://unpkg.com/@lst97-oss/last-comments-widgets/dist/vanilla/index.js"
></script>
```

Props (all frameworks): `site` (required), `baseUrl` (required), `pageUrl` (default `location.href`), `turnstileSiteKey` (guest posting), `limit` (default 20; threads per page, see below), `lazy` (default false; defer all requests until the widget scrolls into view), `theme` (`light` | `dark` | `system`), `themeVars` (per-instance overrides, see below), `signInUrl` (host-owned sign-in page), `viewerUserId` (shows own Edit/Delete buttons; empty = guest), `pageId` (host-known thread id; moderator mode addresses it instead of matching `pageUrl`), `viewerRole` (`admin` | `moderator`; enables inline moderation, see below), `onModerated` (callback after a moderation action, lock change or moderator post), `actionMode` (`icon` | `icon-text` | `text`, default `icon-text` — how Reply/Edit/Delete and moderator actions render their icons), `bodyLimit` (max body characters, counted before trimming, default 10,000, which is also the server's ceiling; set it to the limit the server enforces for the site, so the counter matches what gets rejected), `anonEditWindowMinutes` (default 10, mirroring the server `COMMENT_ANON_EDIT_WINDOW_MINUTES`) — signed-in authors may edit any time, while guests edit only from the browser that stored the key returned when they posted. The vanilla port reads the same three from `data-lc-action-mode`, `data-lc-body-limit` and `data-lc-anon-edit-window-minutes`, `turnstileOptions` (all frameworks; Cloudflare widget options for guest posting: `theme` (`auto` | `light` | `dark`; defaults to the widget's own light/dark mode), `size` (`normal` | `compact` | `flexible`), `appearance` (`always` | `interaction-only`, default `interaction-only`: the box shows only when Cloudflare needs an interaction; `always` keeps it visible) and `language`. Cloudflare draws the challenge itself inside a cross-origin iframe, so its background, border, radius and shadow cannot be themed — style the `.lc-turnstile` container the widget renders instead. The vanilla port reads them from `data-lc-turnstile-theme`, `data-lc-turnstile-size`, `data-lc-turnstile-appearance` and `data-lc-turnstile-language`), `fetchImpl` (bring-your-own fetch — log, record, or rewrite to a same-origin proxy; every request still sends `credentials: 'include'` and the init shape is unchanged).

```ts
// fetchImpl receives (url, init) exactly as the widget would call fetch.
const fetchImpl: typeof fetch = (input, init) => fetch(toSameOriginProxy(input), init)
```

Signed-in viewers are detected from the API session (`GET {baseUrl}/api/auth/get-session`), with the host's `viewerUserId` prop as the fallback when the API cannot answer (no same-origin proxy): when signed in, the composer drops the guest name field and Turnstile, posting uses the session identity, and votes work; the identity menu below lets the user post anonymously instead.

## Custom themes and CSS overrides

React, Vue, Angular, and vanilla accept the same `themeVars` object. `vars` applies in both modes; `dark` overrides individual values when `theme="dark"` or system dark mode is active. `Comments` and `CommentViewer` share the same tokens. Theme types are exported from each widget subpath.

```tsx
import { Comments, type WidgetTheme } from '@lst97-oss/last-comments-widgets/react'
import '@lst97-oss/last-comments-widgets/react/styles.css'

const brand: WidgetTheme = {
  vars: {
    primary: '#2354d1', primaryForeground: '#ffffff',
    popover: '#ffffff', popoverForeground: '#182033',
    accent: '#e8efff', accentForeground: '#182033',
    fontFamily: 'Inter, sans-serif', fontSize: '16px',
    spacing: '0.25rem', radius: '0.75rem', controlRadius: '0.5rem',
    controlHeight: '2.5rem', cardPadding: '1rem', composerPadding: '1rem',
    cardShadow: '0 2px 12px rgb(0 0 0 / 0.08)', dropdownShadow: 'none',
  },
  dark: {
    background: '#111827', foreground: '#f9fafb',
    card: '#182033', cardForeground: '#f9fafb',
    popover: '#182033', popoverForeground: '#f9fafb',
    accent: '#263450', accentForeground: '#ffffff',
  },
}

<Comments site="demo" baseUrl="/" theme="system" themeVars={brand} />
```

Vue uses `:theme-vars="brand"`; Angular uses `[themeVars]="brand"`; vanilla accepts `{ themeVars: brand }` in `mountComments` and `renderCommentViewer`. Pass complete CSS colors (hex, `rgb()`, `oklch()`, etc.), lengths with units, and unitless line heights. Fonts must be loaded by the host if they are not already available.

**`themeVars` is the widget's one configuration object.** Every design knob lives there — colors, sizes, radii, shadows, and visibility switches — so a host adjusts the look in one place instead of through a growing list of props. Props stay reserved for behaviour (`limit`, `lazy`, `actionMode`, `viewerRole`, …), and a new _design_ knob becomes a new `themeVars` key rather than a new prop. Keys whose value is not free-form CSS (`threadGuideDisplay` is `block` or `none`) are typed, so a typo is a compile error instead of a silently ignored override; the plain-HTML port drops an out-of-range value the same way it drops an unparsable number.

| Theme keys                                                     | Controls                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `background`, `foreground`                                     | Widget surface and default text                                                                         |
| `primary`, `primaryForeground`                                 | Primary actions and links                                                                               |
| `card`, `cardForeground`                                       | Comment surfaces and text                                                                               |
| `popover`, `popoverForeground`                                 | Identity menus and React dialogs                                                                        |
| `muted`, `mutedForeground`, `secondary`, `secondaryForeground` | Composer, placeholders, secondary surfaces and text                                                     |
| `accent`, `accentForeground`                                   | Selector hover and keyboard highlight                                                                   |
| `border`, `input`, `ring`                                      | Borders and focus indicators                                                                            |
| `destructive`, `destructiveForeground`                         | Errors and destructive actions                                                                          |
| `success`, `warning`, `error`, `info`                          | Status palettes; each also has `Foreground` and `Muted` keys                                            |
| `radius`, `controlRadius`, `avatarRadius`, `skeletonRadius`    | Surface/control corner radii, avatar shape, and loading placeholder radius                              |
| `fontFamily`, `fontFamilyMono`, `fontSize`, `lineHeight`       | Typography, including Markdown and popups                                                               |
| `fontWeightMedium`                                             | Weight used by author names, buttons, and other emphasized labels                                       |
| `spacing`                                                      | Spacing unit used by gaps, margins, padding, and utility-sized controls                                 |
| `controlHeight`                                                | Minimum height of buttons, inputs, and selects                                                          |
| `cardPadding`, `composerPadding`, `composerBackground`         | Comment/composer padding and the composer surface color; reply indentation is preserved                 |
| `commentBorder`, `borderWidth`, `replyBackground`              | Comment border width (`0` = none), border width of other surfaces and controls, and reply surface color |
| `threadActive`, `threadMuted`, `threadIndent`                  | Reply guide line: active and muted colors, and the thread indent                                        |
| `threadGuideDisplay`                                           | Reply guide line visibility: `block` (default) or `none` to hide it                                     |
| `avatarRing`                                                   | Ring behind stacked reply avatars                                                                       |
| `voteBackground`, `voteBorder`, `voteShadow`                   | Vote pill surface, border and shadow                                                                    |
| `actionColor`, `actionHoverColor`, `actionHoverBackground`     | Reply/Edit/Delete and moderator action colors on hover                                                  |
| `adminNameColor`, `adminBadgeBackground`, `adminBadgeForeground` | Site-admin name color and its `Admin` badge (default: destructive, with a soft destructive tint)      |
| `memberBadgeBackground`, `memberBadgeForeground`               | `Member` badge for signed-in accounts with no site role (default: secondary)                            |
| `menuZIndex`                                                   | Stacking order of the identity menu                                                                     |
| `cardShadow`, `dropdownShadow`                                 | Shadows on the comment card and the popup menus                                                         |

Styles, resets, and semantic defaults are scoped to `.lc-comments` and `.lc-theme` using native CSS `@scope`; use a browser with `@scope` support. Importing widget CSS does not set the host page's font, colors, margins, or utility classes. Each instance has its own defaults, and an explicitly light widget stays light inside a dark host. React menus portal into their owning root so CSS variables and selectors still apply. Avoid clipping that root with `overflow: hidden` when using popups.

For more detailed customization, use these shared hooks: `.lc-comments`, `.lc-comment`, `.lc-reply`, `.lc-replies-trigger`, `.lc-thread-guides`, `.lc-thread-overlay`, `.lc-reply-stack`, `.lc-vote`, `.lc-action`, `.lc-action-destructive`, `.lc-collapse`, `.lc-author-admin`, `.lc-admin-badge`, `.lc-member-badge`, `.lc-blocked-badge`, `.lc-composer`, `.lc-markdown`, `.lc-avatar`, `.lc-skeleton`, `.lc-error`, `.lc-identity-trigger`, `.lc-identity-menu`, `.lc-identity-item`, `.lc-actions-menu`, and `.lc-footer`. Controls can be targeted with ordinary `button`, `input`, `textarea`, and `select` selectors below the root. Custom styles can override the defaults without `!important`:

```css
/* Wrap the widget in <div id="discussion"> to target this instance. */
#discussion .lc-comments {
  --popover: #fff5e8;
  --accent: #fbd9a0;
  --lc-font-family: Georgia, serif;
}
#discussion .lc-identity-menu {
  min-width: 15rem;
  border: 1px solid #d4ab71;
}
#discussion .lc-comment {
  border: 1px solid #e5e7eb;
}
```

Semantic CSS variables use kebab case (`primaryForeground` → `--primary-foreground`). Typography, spacing, control dimensions, padding, and shadow tokens use an `--lc-` prefix (`fontFamily` → `--lc-font-family`, `cardShadow` → `--lc-card-shadow`); `radius` remains `--radius`. Inline `themeVars` values take precedence over stylesheet variables on the root. `THEME_CSS_VARIABLES` in `@lst97-oss/last-comments-widgets/client` exports the complete mapping.

For plain HTML, every token also has `data-lc-theme-var-<kebab-name>` and `data-lc-theme-dark-var-<kebab-name>` attributes:

```html
<div
  data-lc-comments
  data-lc-site="demo"
  data-lc-base-url="/"
  data-lc-theme="system"
  data-lc-theme-var-popover="#fff5e8"
  data-lc-theme-var-font-family="Georgia, serif"
  data-lc-theme-var-control-height="44px"
  data-lc-theme-dark-var-popover="#241b14"
></div>
```

When composing from exported subcomponents, supply a theme root yourself: React provides `<CommentsTheme theme="system" themeVars={brand}>…</CommentsTheme>`; other frameworks and raw HTML can use a `.lc-theme` wrapper with CSS variables and a `dark` class for dark mode. `Comments` and `CommentViewer` already provide their roots. Third-party verification challenges retain their provider-owned appearance.

## Identity and sign-in

The composer footer carries the identity control next to the name field — `Comment as [ Anonymous ▾ ]` — so signing in is always optional: the guest form (name + Turnstile) is usable either way. Its right-hand group holds the Markdown hint, Cancel when needed and the submit button, so the hint and action stay right-aligned and the button remains at the edge on narrow screens. Both the comments widget and the read-only viewer end with a small `Powered by last-comments` footnote (`.lc-footer`). Signed-out visitors get `Sign in…` in the menu; it links to `signInUrl` when the host provides one, otherwise the widget asks the API to start the OAuth flow (`POST {baseUrl}/api/auth/sign-in/social`, provider `google`) and navigates to the returned authorization URL, which returns the user to `pageUrl`. That default path needs `baseUrl` reachable with credentials from the page (the same-origin proxy recommended for voting) and a provider configured on the server; failures show the server's message under the control. A sign-in the provider rejects (for example `account_not_linked`) returns the reader to `pageUrl` with `?lc_sign_in=failed&error=<code>`; the widget explains it once under the identity control and removes those parameters from the address bar.

Signed-in visitors can switch between `Anonymous` and `<name> (you)`, and `Sign out` ends the API session (`POST {baseUrl}/api/auth/sign-out`). Guest comments — the anonymous identity, or any visitor without a session — are posted **without** the session cookie (`credentials: 'omit'`), so the API attributes them to the guest name (blank posts as `Anonymous`). A proxy that attaches the session server-side will attribute them to the account instead, and Edit/Delete/votes do not apply to guest comments.

## Pagination and loading

Replies hang off their parent through measured Fumadocs-style connector lines: a guide runs down each reply's own card, and a top-level comment draws one down its own rows only when it has replies. Each thread's guide is its own subpath, so it never connects to the thread above. Each reply's segment covers its own rows and bends between nesting levels, with the segment at your reading position (the middle of the viewport) drawn in `threadActive` while the rest stays `threadMuted`. Lines ride the middle of each comment card's own left padding, so a rail stays inside the card it belongs to and never crosses that comment's content, and a folded reply group keeps a short stub beside its trigger so hidden replies stay visible in the guide. To hide the lines, set `threadGuideDisplay: 'none'` in `themeVars` (or the `--lc-thread-guide-display` CSS variable, or `data-lc-theme-var-thread-guide-display="none"` in plain HTML); add `--lc-thread-indent: 0px` to reclaim the gutter they rode in. Replies carry a `Replying to @author` caption, so a reply always reads as attached to the comment it answers. Every reply group collapses: while hidden the trigger shows an overlapping stack of reply-author avatars (up to three, then `+N`) plus the reply count, and while open it hides them behind a `Hide N replies` label. The count covers every reply in the group whatever its state, and moderators additionally see the composition inline (`4 replies · 1 pinned · 1 hidden · 1 deleted`, hidden below `sm` so the row never crowds). Timestamps are Reddit-style short ages (`just now`, `5m ago`, `3h ago`, `2d ago`, `2mo ago`, `1y ago`) with the full local time on hover, via the shared `formatRelativeTime` helper. Actions render as icon only, icon with label, or label only through `actionMode`.

Lists page through **threads**, not rows: a page shows `limit` top-level comments (default 20) together with their replies, and the pager (`‹ Previous` / `Page N` / `Next ›`) appears once there is more than one page. The list endpoint returns no total, so the pager shows the current page instead of numbered links; `Next` disables once the stream ends. Rows are fetched only for the page you visit and kept in memory, so `Previous` is instant and never re-requests. A reply written after the stream moved past its thread's page is not shown until more rows load — the list endpoint has no per-thread query, so exact thread pagination would need a server-side `threads` query.

Loading states are skeletons rather than blank space: three skeleton cards on first load, two more below the list while the next page arrives (the pager disables in flight), and a skeleton chip in the identity control — with posting disabled — until the API answers `get-session`, so a comment can never be posted with a guessed identity.

`lazy` defers every request (comments and session) until the widget scrolls into view (`IntersectionObserver`, 200px margin, one-shot). Use it for embeds below the fold; avatars load lazily in every mode.

## Moderation

Pass `viewerRole` (`admin` or `moderator`, typically with `viewerUserId`) to render inline moderation controls: the composer posts and edits through `/api/moderation` (so a dashboard origin does not need to be in the site's allow-list), `pageId` addresses the thread directly instead of matching `pageUrl` against the site's capped page list, and `onModerated` (React prop, Vue `@moderated`, Angular `(moderated)`, vanilla `onModerated`) fires after a successful action so the host can refresh its own thread list. Moderators get the same `Comment as` control as any signed-in viewer and may post as themselves or anonymously (`createModerationComment` forwards `anonymous` and the guest `authorName`); an anonymous moderator post is stored as a guest row with an edit key. Delete is a soft status (`deleted`, restorable through `Restore`) and acts immediately from the row menu — no confirmation dialog. the thread lists every status with `hidden`/`deleted` badges, each row offers Hide/Restore, Pin/Unpin, Delete and Block/Unblock user, and a page lock/unlock bar appears above the list. Moderators see and cast votes in place: the moderation payload carries each row's score and the moderator's own vote, and votes post through the moderation endpoint (hidden/deleted rows and locked pages never offer them). The server authorizes every action, so an account without permission sees the `FORBIDDEN` copy and nothing changes. Comment rows carry the author's site role as `authorRole` (`admin` | `moderator` | `null`); every widget colours site-admin names with the destructive colour and appends an `Admin` badge (`.lc-admin-badge`); signed-in accounts with no site role get a neutral `Member` badge (`.lc-member-badge`); guests and moderators get no account badge. Moderation requires the comments API to be served from the widget page's own origin: `/api/moderation` sends no CORS headers and its POST is origin-checked, so dev proxies must rewrite the `Origin` header (see `examples/react/vite.config.ts`); a cross-origin embed cannot moderate.

## Read-only viewer

`CommentViewer` (Vue `CommentViewer`, Angular `lc-comment-viewer`, vanilla `data-lc-viewer` + `renderCommentViewer`) renders the same list with no composer and no Reply/Edit/Delete/vote buttons — import it where the page only shows comments. Same `site`/`baseUrl`/`pageUrl`/`limit`/`lazy`/`theme`/`themeVars`, same thread pager and skeletons; voting UI stays available via the exported `VoteButtons` for hosts that opt in.

```tsx
import { CommentViewer } from '@lst97-oss/last-comments-widgets/react'

;<CommentViewer site="demo" baseUrl="https://comments.example.com" />
```

## Client API

`@lst97-oss/last-comments-widgets/client` (the bare package name resolves to the same entry point) is what the four widgets are built on; hosts rendering their own UI can import it directly. Every widget subpath depends on it at runtime, which is why all four frameworks ship inside one package and share its version.

| Export                                                                                                               | Purpose                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `createClient({ site, baseUrl, fetchImpl })`                                                                         | list, post, edit and delete comments, vote, and run moderation calls                    |
| `listCommentsPage({ …, offset, limit })`                                                                             | one page of rows plus `hasMore` (probes one extra row; the API returns no total)        |
| `loadThreadWindow({ …, pages, existing })`                                                                           | rows accumulated until N whole threads are present — the loader behind the widget pager |
| `fetchViewerThreads({ … })`                                                                                          | one-shot fetch of the flat stream                                                       |
| `buildCommentTree(rows)`                                                                                             | group that stream into thread nodes (orphan replies become roots)                       |
| `describeError(error, overrides?)`                                                                                   | the title/message/action copy every widget renders                                      |
| `beginOAuthSignIn` · `fetchViewerSession` · `signOutViewerSession`                                                   | the flow behind the identity control                                                    |
| `renderMarkdown` · `safeUrl`                                                                                         | markdown rendering (raw HTML stripped) and URL sanitising                               |
| `themeVarsToStyle` · `THEME_CSS_VARIABLES`                                                                           | map `themeVars` onto the widget's CSS variables                                         |
| `isEditWindowOpen` · `DEFAULT_EDIT_WINDOW_MINUTES` · `canModerate` · `moderationCommentToComment` · `sortThreadTree` | shared widget rules                                                                     |
| `formatRelativeTime` · `collectThreadParticipants`                                                                   | Reddit-style short ages and the unique authors inside a reply subtree                   |
| `foldReplySummary(children)`                                                                                         | reply total plus the moderator-only pinned/hidden/deleted breakdown of a reply group    |

Signatures and the complete type list live in `packages/client/src/index.ts`.

## Markdown

Bodies render GitHub-flavored markdown (bold, italic, strikethrough, code, links, images, lists, quotes, tables, newlines) via a shared renderer in `@lst97-oss/last-comments-widgets/client`. Raw HTML is stripped, links allow `http(s):`/`mailto:` only. Every composer is a muted panel with icon toolbar (Bold/Italic/Quote/Inline code/Code block/Link/Bullet/Numbered), Write/Preview toggle, a right-aligned live character count against the `bodyLimit` (default 10,000, counted before trimming; red once over, with the submit button disabled and the composer refusing to post), and a `Styling with Markdown is supported` hint.

In the React widget, fenced code blocks with a language are upgraded after first paint with [Shiki](https://shiki.style/) (`vitesse-light`/`vitesse-dark`), wrapped in the same docs-style frame as the last-comments blog (language label + copy button). The upgrade is lazy — no Shiki is downloaded until a fence exists — and an unknown or missing language keeps the plain `<pre>` fallback. The Code block action inserts a fenced block with the `language` placeholder selected; inline code keeps its own button. The Vue, Angular and vanilla composers still use the inline-code action and render plain fences until they are ported.

## Requirements

- Register the page origin in the server's `site_origins` table, or every API call fails with `ORIGIN_NOT_ALLOWED` (403).
- Posting needs `turnstileSiteKey` (Cloudflare Turnstile) for every identity, signed-in users included: the server verifies every comment. The box stays hidden unless Cloudflare needs an interaction (`turnstileOptions.appearance` defaults to `interaction-only`). Under `COMMENT_VERIFICATION_REQUIRED=true` with no provider, guests get a 503 notice. Every widget renders the challenge in-package and matches its light/dark theme to the widget's own mode; `turnstileOptions` forwards Cloudflare's supported knobs, and the challenge box itself belongs to Cloudflare (cross-origin iframe), so only those options apply — style the `.lc-turnstile` container for spacing.
- Every widget request is sent with `credentials: 'include'`. The API answers only origins a site has registered, with `Access-Control-Allow-Origin` set to that exact origin and `Access-Control-Allow-Credentials: true`, so a page on the same registrable domain as the API can list, post, vote and sign in directly. That needs a last-comments server release that sends credentialed CORS and trusts registered origins (newer than v0.2.0). A different registrable domain still needs a same-origin proxy (e.g. rewrite `/api/comments` and `/api/moderation` → `baseUrl`, as the examples do), because the session cookie is not sent cross-site. A reverse proxy in front of the API must rewrite `Origin` for `/api/moderation`, whose POST is origin-checked against the server's own origin.
- Published bundles target **ES2025** (the latest ratified standard supported by the TypeScript 6 toolchain) and ship no polyfills: use a current evergreen browser, and Node 22+ when running the client outside the browser.

## Errors

Every failure renders one block — alert icon, a title that names the situation, the API's own message when it is human-readable, and an action only when one helps (`Try again` for retryable failures, `Sign in` when an account is required). It appears for: list and viewer load failures (including the viewer's retry), composer post/reply failures, edit/delete/vote failures, moderation actions, and sign-in/sign-out failures. Busy/blocked/locked pages keep their dedicated states.

The copy comes from `describeError(error, overrides?)` in `@lst97-oss/last-comments-widgets/client` (exported and tested): it maps each `ApiError.code` to `{ code, title, message, action }`, turns a failed `fetch` into "Couldn't reach the comments service", ignores the synthesised `request failed with 500` message, and takes `overrides.title` only for codes that have no scenario-specific copy — widgets pass action framing such as `"Your comment wasn't posted"`. Hosts rendering their own UI can call it directly.

The rendered block carries `data-lc-error` and `data-error-code` (empty when the failure was not from the API) so you can style or assert on it.

## Error codes

`VALIDATION_ERROR` `MALFORMED_JSON` `UNAUTHENTICATED` `ORIGIN_NOT_ALLOWED` `SITE_NOT_FOUND` `USER_BLOCKED` `PAGE_LOCKED` `PARENT_NOT_FOUND` `COMMENT_NOT_FOUND` `COMMENT_VERIFICATION_FAILED` `COMMENT_VERIFICATION_UNAVAILABLE` `FORBIDDEN` `EDIT_WINDOW_EXPIRED` `SIGN_IN_UNAVAILABLE` `SIGN_OUT_FAILED` — see `packages/client/src/index.ts` (`ApiError.code`).

## Develop

```bash
bun install
bun run check         # bun fmt --check + all package lint/typechecks + React Doctor
bun run typecheck     # bun check --no-script; Vue uses vue-tsc
bun run lint          # Check lint without changing files
bun run lint:fix      # Apply safe lint fixes
bun run format        # bun fmt
bun run format:check  # bun fmt --check
bun run fmt:staged    # bun fmt --staged (pre-commit hook)
bun test
bun run test:theme    # Build + browser theme regressions (Chrome installed)
bun run build
```

| Package                             | Linter                                                                            | Formatter |
| ----------------------------------- | --------------------------------------------------------------------------------- | --------- |
| `react`                             | Biome recommended React rules + React Doctor (`check`)                            | `bun fmt` |
| `vue`                               | ESLint + TypeScript ESLint + Vue recommended rules                                | `bun fmt` |
| `angular`                           | ESLint + TypeScript ESLint + Angular recommended and template accessibility rules | `bun fmt` |
| `client`, `vanilla`, `theme`        | Biome recommended rules                                                           | `bun fmt` |
| `last-comments-widgets` (published) | — no source of its own; its `dist` is assembled from the others                   | —         |

Each package with source exposes `lint`, `lint:fix`, `format`, `format:check`, and `check` scripts — the published package has only `build`, since there is nothing in it to lint. TypeScript packages also expose `typecheck`. Formatting is `bun fmt` (config in the root `bunfig.toml`; Bun 1.4.4+); Biome is lint + import-assist only and its formatter is disabled. React, Angular, the client, and vanilla typecheck with `bun check --no-script`; Vue uses `vue-tsc` because Bun cannot resolve `.vue` imports or check SFC templates. Angular ESLint checks Angular templates; Angular template typechecking remains part of the Angular build. Generated `dist` files are excluded from both toolchains.

Agents and AI contributors: read [`AGENTS.md`](AGENTS.md) for the layout, conventions, and the verification traps this repo has (client `dist` resolution, the thread-paging model, Angular's compile-only verification).

## Release

One package is published — `@lst97-oss/last-comments-widgets`, with one subpath per framework — and `packages/{client,theme,react,vue,angular,vanilla}` are its private workspace sources, so there is no cross-package version to keep in lockstep: a release bumps that one package, and a widget can never be installed with a client it cannot work with. Framework compatibility lives in `peerDependencies` (React 19, Vue 3.5, Angular 22), never in the package version — an Angular-only change narrows Angular's peer range and gets its own changelog entry.

```bash
bun run changeset        # describe the change
bun run version          # bump the published package, write CHANGELOG.md, bun install, versions:check
git add -A && git commit -m "chore: release"
npm login                # once per machine
bun run release          # versions:check + check + test + build + pack:check + changeset publish
git push --follow-tags   # push the release commit and its annotated tag
```

Publishing is deliberately local: `bun run release` gates `changeset publish` behind the full lint/typecheck suite, the tests, a fresh build (`build` assembles `packages/last-comments-widgets/dist` from the workspace packages) and `pack:check` — which inspects the exact tarball npm would upload and fails if a manifest entry point, README, or LICENSE is missing or package source leaked in. `changeset publish` then uses the npm credentials from `npm login` on this machine and creates one annotated git tag (push it with `git push --follow-tags`), so no registry token lives in GitHub. The tarball ships the README and LICENSE and declares its repository, homepage, bugs and license, so the npm page is complete. CI (`.github/workflows/ci.yml`) only verifies every push and pull request (including the same `pack:check`) and requires a changeset when the published package changed. Nothing is on npm yet, so the first release is `0.1.0`, the version already in the manifest; `publishConfig.access: "public"` is set because scoped packages default to restricted. `changeset status` and tag creation need at least one commit on the branch.

Demos: `examples/react` (`bun run dev`, :5173), `examples/vue` (:5174), `examples/angular` (`bun run dev`, :5175, dev-server proxy for `/api` → :3000), `examples/html` (static file using the hosted bundle at `https://unpkg.com/@lst97-oss/last-comments-widgets/dist/vanilla/index.js`). Point the demos at a running `last-comments` server (`bun run db:business:up && bun run db:business:migrate && bun run db:business:bootstrap && bun run dev` in the reference repo, default `http://localhost:3000`). The React demo reads `?lazy` (mount with `lazy`) and `?tall` (push the widgets below the fold) from the URL to exercise the deferred path.

## License

MIT
