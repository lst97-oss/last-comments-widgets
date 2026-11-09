# @lst97-oss/last-comments-widgets

## 0.8.0

### Minor Changes

- 533bd78: Vue, Angular and the plain-HTML widget now match the React widget on the same features and styles.
  
  - Fenced code blocks are syntax-highlighted in every widget. The Shiki upgrade moved into the shared client (`/enhance`); `codeHighlight` (`data-lc-no-code-highlight` on plain HTML) turns it off. Vue, Angular and plain HTML now load `shiki` for it, so install `shiki` next to the widget as React already requires; plain HTML maps it in its import map.
  - The composer has the same toolbar in every widget: Inline code and a new Code block action.
  - A moderator sees the "Comment as" identity control in every widget, as in React.
  - Vote buttons are disabled while a vote is in flight.
  - `onSignInClick` replaces the OAuth start in the sign-in prompts in Vue, Angular and plain HTML, as it already did in React. The Vue `sign-in` event was declared but never emitted, so it is removed; use `onSignInClick`.
  - The editor of an own comment has a Cancel button in every widget.
  - Locked and blocked pages in Vue show the shared error block, as in React, instead of a separate panel.
  - Vue exports `CommentsTheme` and Angular exports `LcCommentsThemeComponent`, the scope wrapper for composed pieces, matching React's `CommentsTheme`.
- ef31afb: Loading placeholders are now a faint tint of `mutedForeground` instead of `muted`, which was barely visible on a light card. The new `themeVars` key `skeletonBackground` sets the placeholder fill directly, so a host can retint them without retinting composers or code blocks.

### Patch Changes

- ed30402: Fixes from the repo audit.
  
  - Plain-HTML widget: a vote can be taken back again. After a vote, the second click on the same arrow used to send the same vote, so it stayed until the page reloaded.
  - Moderation: a page that is not in the site's newest 100 pages no longer shows an empty thread with no message. The widget shows "Moderation cannot find this page", and a host can pass `pageId` to moderate it. Vue's moderation view also fills each page with whole threads, as the other ports already did.
  - Plain-HTML widget: `data-lc-limit` must be a whole number of 1 or more. A value such as `ten` used to empty the widget with "No comments yet".
  - A post that the server never answered (a timeout or a dropped connection) now says the comment may already be posted, and to check the thread before posting again.
  - The peer ranges for `@angular/cdk`, `@lucide/angular` and `vue` are caret ranges, so hosts on another patch version can install the package.
  - Code blocks keep their highlighted markup for up to 200 blocks, so repaints do not highlight them again.
  - `canEditComment`, `initials` and the viewport observer each have one copy, in the client, and every port uses it. The public exports of each port are unchanged.
  - The client package adds `canEditComment`, `initials`, `postFailure`, `resolveModerationThread` and `loadModerationWindow` for hosts that build their own UI. `PAGE_NOT_LISTED` is a new value of `ApiErrorCode`.

## 0.7.0

### Minor Changes

- 9835861: Emoji reactions, in all four widgets (React, Vue, Angular and the plain HTML widget).
  
  - **A reaction bar on the page**, and **reactions on each comment and reply**. A signed-in visitor can hold several different emoji on one comment; a guest who clicks is asked to sign in, with no request sent. A moderator sees the counts and cannot react.
  - **Each switch is the site's**: `features.pageReactions` and `features.commentReactions` in the settings document. Each lists the allowed emoji, and an empty list means that switch is off. A service that predates reactions sends neither, so no reaction UI shows.
  - **Typing change.** `CommentSettings.features` now has `pageReactions` and `commentReactions` as well as `votes`. A host that passes a `settings` object should pass `features` whole.
  - **Client.** `castReaction`, `clearReaction`, `listPageReactions`, `castPageReaction` and `clearPageReaction`. `Comment.reactions` is always a list, including from a server that predates reactions.
  - **Theme.** `reactionBackground`, `reactionBorder`, `reactionActiveBackground` and `reactionActiveBorder` tokens, and the `.lc-reaction` hooks.
  - **Not in this release:** the read-only `CommentViewer` does not show reaction counts yet.
- 6cd89cf: Every request has a time limit, and reads retry on their own. A stalled network ends as `TIMEOUT` rather than a spinner that never stops. A `GET` that fails before any answer, or answers 408, 425, 429, 500, 502, 503 or 504, is retried on a backoff, honoring `Retry-After` up to 5 seconds. Writes are never retried.
  
  - **`ApiError`** gains `retryable`, `retryAfterMs` and `requestId`. Branch on `retryable`, not on `status`.
  - **A proxy's HTML error page** no longer shows a JSON parser message. It reads as `SERVICE_UNAVAILABLE`, or `UNREADABLE_RESPONSE` below 500.
  - **Dropped connections and timeouts** read as the same connection problem, with a Try again.
  - **Permanent failures** the copy does not cover offer no Try again.
  - **`createClient`** takes `resilience: { timeoutMs, retries, baseDelayMs }` to tune the limits.
- 9835861: Fixes in all four widgets, plus removals from the client.
  
  - **Paging after a post.** A post on a thread with more pages no longer shifts the next page. A reader no longer misses a comment or sees their own post twice. When more pages remain, the first page reloads, as the plain-HTML widget already did.
  - **Turnstile after a refused post.** A send the server refuses still spends its challenge, so the widget replaces the challenge before the retry. The draft stays.
  - **Mermaid safety check.** The SVG check now walks the parsed markup. It refuses event handlers and `javascript:` links that the old text check let through, such as `<g/onmouseover=…>` and entity-encoded links. Ordinary diagrams are drawn as before.
  - **Settings retry.** A settings request that fails at once is no longer kept, so the next mount retries.
  - **Sign-in copy.** A sign-in error with an unknown code shows the generic line, not a blank box.
  - **Reactions.** A reaction refused for an expired session asks the reader to sign in to react, in every port. A press that answers while the page-bar counts are still loading is no longer undone by those counts.
  - **Roles.** Reaction rows and the sort bar use `role="group"`, since the arrow keys that `toolbar` promises are not implemented.
  - **Added:** `reactionFailure` in `/client`, the copy for a reaction that does not save.
  - **Removed:** `accountBadge` and `AccountBadge` (read `comment.authorRole`), and `DEFAULT_EDIT_WINDOW_MINUTES`. `isEditWindowOpen` now takes the time and the window as arguments.

## 0.6.2

### Patch Changes

- Render math, Mermaid and code highlighting in replies again. The recursive
  React `CommentItem` dropped the render flags, so a reply showed raw `$$…$$`
  and fences while top-level comments rendered correctly.

## 0.6.1

### Patch Changes

- 0c1ccbc: Internal maintenance: the React viewer keeps its state in one reducer and renders its thread body as a separate component, and the comments widget derives the read-gate sign-in prompt instead of adjusting state in an effect. Public API and rendered markup are unchanged.

## 0.6.0

### Minor Changes

- 3824875: Comment images load lighter and fail visibly.
  
  - Images fit the comment column and are capped at 28rem tall, keeping their proportions. The link around an image still opens the full file.
  - Images from Cloudinary, Unsplash, imgix and Wikimedia Commons request a 640px and a 1280px rendition, so the browser fetches the smaller one on ordinary screens. If a rendition fails, the widget tries the original file once.
  - Hosts without a known resize scheme load the original, lazily and without blocking the thread.
  - A missing or refused image shows an "Image unavailable" label in place of the broken-image box. A link that is not an absolute http(s) URL, such as a relative path or `javascript:`, is never loaded.
  
  The label uses the `.lc-image-unavailable` theme hook.
- be47f9a: Add opt-in TeX math and Mermaid diagrams, and make code highlighting switchable.
  
  - New `math` flag (default `false`): `$…$` and `$$…$$` render through KaTeX. The shared renderer emits an escaped formula placeholder in every port and each widget upgrades it after paint from a lazily imported KaTeX, so a host that leaves the flag off downloads nothing. Currency, lone dollar runs, escaped `\$`, code spans and fenced blocks stay literal.
  - New `mermaid` flag (default `false`): ```mermaid fences render through a lazily imported Mermaid, with the source block kept for a parse error, a missing library or an svg that carries script, inline handlers or a `javascript:` url. Diagrams re-render when the widget's light/dark mode flips.
  - New `codeHighlight` flag (default `true`): set it to `false` to skip the post-paint Shiki upgrade (React is the only port that highlights today).
  - Plain HTML gains the presence-only `data-lc-math` and `data-lc-mermaid` attributes plus `data-lc-no-code-highlight`; `katex` and `mermaid` are optional peers, installed only by hosts that enable them.
- 3824875: The account badge follows the server's site role now.
  
  - `Admin` shows for the site admin and `Member` for a member. A signed-in account with no role gets no badge. Before, every signed-in account without a membership was labelled `Member`.
  - `ViewerRole` is `admin` only. Moderation controls show only for the site admin, so `viewerRole="moderator"` (or `data-lc-viewer-role="moderator"`) no longer renders them.
  - New `SiteRole` type (`admin` | `member`) for an author's role and a moderation site's role.
- 3824875: Login and private sites show a sign-in card in place of the composer and the thread.
  
  - `login`: a signed-out visitor sees the card where the composer would be. Reply stays visible, and a signed-out Reply opens the card under the comment, with no request.
  - `private`: the thread is not fetched. The comments widget and the read-only viewer each show exactly one card, and the composer slot stays empty.
  - The card is neutral and follows the host's theme through the new `signIn*` tokens (`--lc-signin-*`). Its button goes to `signInUrl`, or starts the sign-in flow in place when none is set. `CommentViewer` takes `signInUrl` too (`data-lc-sign-in-url` in vanilla).
  - Fixed: every refused action showed the same generic "Sign in to do that." line. Each action keeps its own (for example "Sign in to reply to this comment.").
  - Fixed: the Angular comments widget threw while rendering a private site, so nothing was shown in place of the thread.
- 3824875: Widgets read the site's policy from the comments service instead of relying on the host to copy it.
  
  - A new `settings` prop takes the whole policy as one object. `bodyLimit`, `anonEditWindowMinutes` and `turnstileSiteKey` still work, and win over the policy when set.
  - Without `settings`, the widget reads `GET /api/comments/settings` once per site, cached for a minute. A failed read falls back to the built-in defaults, and the service still enforces every rule.
  - On a site that asks visitors to sign in, a signed-out visitor sees a sign-in block where the list or the composer would be, instead of a refused request. The Anonymous option appears only on open sites.
  - `features.votes` turns voting off for a site: the arrows are hidden. A guest who clicks an arrow is asked to sign in, with no request sent.
  - A guest deletes their own comment with the edit key they were issued, from the browser that stored it. The API sends the key in a header, so it stays out of the URL.
  - A deleted comment stays in the thread as `[This comment was deleted]`, and its replies stay under it. The text used to read `[deleted]`, and the header showed the author's name.
  
  The endpoint needs a last-comments service that serves it. An older service answers 404, and the widget then behaves as it did before.

### Patch Changes

- 70c4d53: The ⋮ action menu on each comment is a flat popover: it now draws a solid border (`--lc-border-width`, in the theme's border colour) and no offset shadow. The shadow defaults to `none` through the new `--lc-actions-shadow` token; set it to restore a shadow on that menu. The identity menu (`Comment as`) keeps `--lc-dropdown-shadow`.
- 3824875: Replying no longer hides the comment you are answering. The reply composer now opens below that comment's message in every port, so the message stays on screen while you write.

## 0.5.0

### Minor Changes

- 6a6b002: Signed-in accounts are labelled in every framework. Site admins keep their badge but now use the destructive colour for the name and the badge; signed-in accounts with no site role get a neutral `Member` badge. Both are themeable through the new `adminNameColor`, `adminBadgeBackground`, `adminBadgeForeground`, `memberBadgeBackground` and `memberBadgeForeground` tokens.
  
  A sign-in the provider rejects now returns the reader to the page they started on with `?lc_sign_in=failed&error=<code>`, and the widget explains the failure under the identity control instead of silently showing `Anonymous`.
  
  Behaviour change: the Turnstile challenge is hidden by default (`turnstileOptions.appearance` now defaults to `interaction-only`). Set it to `always` to keep the box visible.
  
  Cross-origin embeds: a page on the same registrable domain as the API now works only when the last-comments server sends credentialed CORS and trusts registered origins, which needs a last-comments server release newer than v0.2.0. A different registrable domain still needs a same-origin proxy.

## 0.4.3

### Patch Changes

- Internal maintenance: adopt Bun 1.4.4 `bun fmt`/`bun check` and split `CommentItem` into smaller components. Public API and rendered markup are unchanged.

## 0.4.2

### Patch Changes

- 376a151: A comment card now keeps its content off its own edge: the default `cardPadding` is three spacing units (12px) instead of 0, matching the composer, so text, code blocks and actions no longer sit flush against the rounded card on a dark surface. A host that wants a flush card still sets `cardPadding: '0px'`.

  The reply guide rails now ride the middle of each comment card's own left padding instead of a gutter outside the card, so a rail stays inside the card it belongs to and is never cut off by the card's edge or pushed outside the container. Every port (React, Vue, Angular, vanilla) measures the same rail.

- ca90f88: The composer's post button now shows its loading state while the comment is in flight and a second click cannot post the same comment twice. React's composer had the state update inside the form action, which React 19 defers until the action settles — the button stayed enabled and read "Post comment" during the whole request; the busy state now starts on the submit event and is held by an in-flight counter. Every port (React, Vue, Angular, vanilla) locks the head composer, the reply and the inline editor, so a double click posts once.
- 4a86a9d: Turnstile now covers every commenter. The challenge renders for signed-in authors too (React, Angular and vanilla rendered it for guests only) and the submit button waits for the token from every identity, not just the guest one. The server verifies the token for signed-in posts as well, so a signed-in session no longer skips the challenge — hosts need a `turnstileSiteKey` for commenting to work at all.

## 0.4.1

### Patch Changes

- b58a260: The widget surface is transparent in both themes: the host page owns the background, so the widget scope no longer paints its own light or dark panel.

## 0.4.0

### Minor Changes

- 7eb0460: Removed comments now read as placeholders in the normal view: a deleted comment
  shows a `[deleted]` tombstone (author anonymised, body gone) and a hidden
  comment says it is under review, both Reddit-style. Replies stay visible under
  the placeholder, and moderators still see the original body plus the status
  badge so a restore can still be judged. Deleting your own comment leaves the
  tombstone in place instead of dropping the row.

  A blocked account now gets a clear reason when it posts or replies: the error
  says the account is blocked and to contact the site admin for assistance,
  instead of the server's generic "You cannot comment on this site".

### Patch Changes

- 45591ba: Highlighted code blocks no longer show a grey band around the code. The muted
  fill now belongs to the plain fallback block only, so a Shiki-highlighted block
  paints its own background (light and dark) instead of leaving a muted frame
  around the highlighted code.
- cb0b0aa: Markdown images (`![alt](url)`) now render the way the widget's avatars
  already do: lazily loaded, decoded asynchronously and sent without a
  referrer. A bare image also links to itself, so clicking it opens the full
  size, while an image the author already linked keeps that link.

  Plain image URLs are still rendered as links — only the markdown form embeds
  an image — and an image whose source cannot load (`mailto:`, `data:`,
  `javascript:`) falls back to its alt text as before.

## 0.3.0

### Minor Changes

- 5dfd3ce: Framework runtime libraries are now optional peer dependencies. After upgrading, install your framework's set alongside the package: React `@base-ui/react lucide-react class-variance-authority clsx tailwind-merge` (plus `shiki` if comment code fences should be syntax-highlighted), Vue `@lucide/vue reka-ui clsx tailwind-merge`, Angular `@angular/cdk @lucide/angular`; plain HTML needs nothing new — only `marked` stays a hard dependency. This drops roughly 145 MB of never-imported dependencies from a single-framework install.

  Also in this release: the deprecated `lucide-vue-next` is replaced by its maintained rename `@lucide/vue`, the React port's `cn` package dependency is replaced by the same `clsx` + `tailwind-merge` helper the Vue port already ships, and the vanilla bundle now ships unminified so all four ports deliver the same readable source.

- 5dfd3ce: The Vue, Angular and plain-HTML ports now render the same surfaces as the React widget. The identity switcher is a real dropdown menu with the radio items the React menu has, the row's actions panel is a dialog popover instead of an inline menu, and the avatar, the buttons and the icons follow the shared reference — the plain-HTML port inlines the upstream lucide paths, so every port draws the same glyph. The reply trigger, the composer's controls and the vote buttons use the shared button variants, and the nested reply list keeps the thread guides' gutter.
- 5dfd3ce: Removed the unused modal surface from the shared theme. No port renders a dialog, and the six React component sources that could have (`Card`, `Dialog`, `Empty`, `Separator`, `Spinner`, `Tooltip`) were unreferenced, so the `.lc-dialog` and `.lc-dialog-backdrop` rules and the `dialogShadow` and `backdrop` theme variables were dead weight. Two breaking details for hosts: the `dialogShadow` and `backdrop` `themeVars` keys are gone (passing them now does nothing — remove them from your `themeVars` object), and the `.lc-dialog`, `.lc-dialog-backdrop` and `.lc-tooltip` CSS hooks no longer exist. Every other theme variable and hook is unchanged.

  This release also drops unused component sources that the CSS build was still picking up, so every React consumer downloaded ~13 KB of CSS for markup that cannot appear; the published widget markup, exports and behaviour are unchanged, the stylesheet is simply smaller.

### Patch Changes

- 5dfd3ce: Loading placeholders now trace the real comment rows in all four ports: a 24 px collapse control and avatar, author/time meta, the viewer's right-aligned score (or the interactive menu/vote/reply slots), `my-3` body lines, and no fake action pills. The read-only viewer variant omits the interactive controls entirely, and the skeleton container inherits the same card padding/border/radius/shadow knobs as `.lc-comment`.
- 5dfd3ce: The workspace now targets the latest ratified ECMAScript standard: TypeScript authoring is pinned to `ES2025` with `lib: ["ES2025", "ESNext.Disposable", "DOM", "DOM.Iterable"]`, and every published bundle emits ES2025 (tsup `--target es2025`, Vite `build.target: 'es2025'`, Angular tsconfig target). No polyfills are shipped: hosts need a current evergreen browser, and Node 22+ when using the client outside the browser.
- 5dfd3ce: Nested reply cards no longer lose their border and shadow to the reply panel that contains them. The panel clipped the card's painted edges, so a host theme's card shadow was cut off in a hard line above the card and the card's bottom border lost its corners. The panel now clips with `overflow: clip` and a 16px clip margin, so the shadow paints on all four sides — in the React, Angular, and vanilla ports alike (Vue never clipped, so it is unchanged).
- 5dfd3ce: React: fenced code blocks in comments and the composer preview are highlighted with Shiki (`vitesse-light`/`vitesse-dark`) after first paint, in the same docs-style frame as the last-comments blog (language label + copy button). Highlighting is lazy — nothing is downloaded until a fence exists — and an unknown or missing language keeps the plain `<pre>`. The composer's Code block action now inserts a ` ```language ` fence with the language token selected, and inline code moved to its own button. The other framework ports keep the plain fenced output and inline-code action until they are migrated.
- 5dfd3ce: The reply guide line can now be turned off. Set `threadGuideDisplay: 'none'` in `themeVars` (React `themeVars`, Vue `:theme-vars`, Angular `[themeVars]`, vanilla `themeVars`), or set the `--lc-thread-guide-display` CSS variable yourself — the plain-HTML port also reads `data-lc-theme-var-thread-guide-display="none"`. The guide is decoration, so this is a theme knob rather than a component prop: one setting covers all four ports, and a host can still target the `.lc-thread-overlay` hook directly. Add `--lc-thread-indent: 0px` to also reclaim the gutter the line rode in.

  `themeVars` is now the widget's single configuration object for design knobs, and keys whose value is not free-form CSS are typed — `threadGuideDisplay` accepts only `block` or `none`, so a typo is a compile error instead of a silently ignored override. The plain-HTML port drops an out-of-range value the same way it already drops an unparsable number.

- 5dfd3ce: Turnstile is rendered in-package in every framework. Vue no longer depends on `vue-turnstile`: its guest challenge now uses the same minimal loader/component as React, and React, Vue, Angular and vanilla all match the challenge's light/dark theme to the widget's own mode and accept `turnstileOptions` for Cloudflare's supported knobs (`theme`, `size`, `appearance`, `language`; vanilla reads them from `data-lc-turnstile-*`). Cloudflare draws the box inside a cross-origin iframe, so background/border/radius/shadow still cannot be themed — style the `.lc-turnstile` container. Behaviour is unchanged: the widget gates submit on the token, clears it on expiry/failure, resets after a successful post, and loads one `api.js` per page.
- 5dfd3ce: Every widget now renders a small **Powered by last-comments** footnote with a link to the project, in both the comments widget and the read-only viewer (`.lc-footer` is the shared styling hook). The composer footer's Markdown hint, Cancel and submit button are grouped and pushed to the right in every port, fixing the off-centre hint in Vue and vanilla and keeping the submit button right-aligned when the hint is hidden on narrow screens.

## 0.2.1

### Patch Changes

- 3313f04: Port parity: the Vue, Angular and vanilla widgets now match the React widget's function, style and layout, and the React widget is unchanged.
  - Shared props across all four ports: `actionMode` (`icon` | `icon-text` | `text`, default `icon-text`), `bodyLimit` (default 10,000, counted before trimming) and `anonEditWindowMinutes` (default 10) replace the ports' old `editWindowMinutes`. Signed-in authors edit any time; guests edit only from the browser that stored the key issued when they posted. The vanilla port reads the same three from `data-lc-action-mode`, `data-lc-body-limit` and `data-lc-anon-edit-window-minutes`.
  - Rows follow the React contract everywhere: the collapse control, the author avatar and name (with the `[Admin]` badge), the `blocked` badge for moderation rows, short ages with the full local time on hover, edited/pinned markers, hidden/deleted badges, the `Replying to @author` caption, and the `⋮` menu that holds Edit, own Delete, the moderator's Hide/Restore, Pin/Unpin, Delete and Block/Unblock entries. Deletes act immediately (soft delete, no confirmation dialog) and moderation rows show the pinned/hidden/deleted breakdown of a reply group.
  - Reply groups fold through a headless disclosure per framework (Reka UI in Vue, the CDK accordion in Angular, a hand-rolled panel in vanilla) with the same two labels, the same avatar stack, and the same measured Fumadocs-style connector lines every port now draws.
  - A sort toolbar (Newest/Oldest/Best) re-ranks the threads in all four ports; votes re-rank under `best` and the guides re-measure, so no stale rails are left behind.
  - Composers show a live character count against `bodyLimit` (red once over, submit disabled and the send refused), and the reply composer opens inline under the comment it answers.
  - New client helper `foldReplySummary(children)` returns the reply total plus the moderator-only pinned/hidden/deleted breakdown of a reply group; the theme hooks (`.lc-actions-menu`, `.lc-thread-guides`, `.lc-thread-overlay`, `.lc-replies-trigger`, `.lc-collapse`, `.lc-admin-badge`, `.lc-blocked-badge`) apply to every port.

- 3313f04: React: the guest composer's Cloudflare Turnstile challenge is rendered in-package (a minimal loader plus a ref-callback component), so `@marsidev/react-turnstile` is no longer a runtime dependency. The challenge now follows the widget's light/dark mode instead of the OS preference, and a new React `turnstileOptions` prop forwards Cloudflare's supported design knobs (`theme`, `size`, `appearance`, `language`); the widget box itself belongs to Cloudflare, so background/border/radius/shadow cannot be overridden — style the `.lc-turnstile` container instead. Behaviour is unchanged: the widget still gates submit on the token, clears it on expiry or failure, resets after a successful post, and survives composer remounts without reloading the script.

## 0.2.0

### Minor Changes

- 82cbb59: Anonymous editing, identity-aware edit windows, and thread sorting:
  - Guest comments can be edited by their author: the create response carries a one-time `editKey`, the widget stores it in `localStorage` and sends it on `PATCH /api/comments/:id`. Signed-in authors edit any time; guest edits use the server's anonymous window.
  - React `Comments`/`CommentViewer` sort threads pinned-first with a Newest/Oldest toggle; shared `sortCommentRoots` and `resolveEditWindow` helpers live in the client package. `best` joins the modes: net score descending, pinned first at every depth, with `sortThreadTree` sorting each reply level; negative-score comments render collapsed in every mode.
  - Comment rows carry the author's site role as `authorRole` (`admin` | `moderator` | `null`), so hosts can mark staff authors; React colours site-admin names and adds an `[Admin]` badge (`.lc-admin-badge` hook).
  - React takes `anonEditWindowMinutes` (default 10); `editWindowMinutes` is gone from the React props because signed-in editing has no window. Other ports are unchanged until they are ported.

- 82cbb59: Every visual family is now a theme knob, and all four ports honor it:
  - New `themeVars` keys: `borderWidth` (chrome and control borders), `avatarRadius`, `skeletonRadius`, `composerBackground`, `fontWeightMedium`, `menuZIndex`, `threadIndent`.
  - Bare `rounded` utilities now follow `radius`, plain `border` utilities follow `borderWidth`, and `font-medium` follows `fontWeightMedium`, so previously fixed utility values no longer bypass the contract.
  - New shared hooks: `.lc-avatar`, `.lc-skeleton`, `.lc-actions-menu`; `.lc-action` / `.lc-action-destructive` now cover every port's secondary and destructive actions.
  - The identity menu takes its shadow from `dropdownShadow` and its stacking order from `menuZIndex`; the composer surface comes from `composerBackground`.
  - Internal: vote results render from an overlay instead of rebuilding the list (Vue/Angular/vanilla), Angular drafts use `linkedSignal`, vanilla repaints only the affected region, and stale loads are dropped by generation counters.

- 82cbb59: Moderator mode can now be driven by an admin dashboard, in every framework port (React, Vue, Angular, vanilla):
  - `pageId` (React/Vue props, Angular `pageId` input, vanilla `pageId` option): the thread is addressed directly instead of matching `pageUrl` against the site's (capped) page list.
  - New client methods `createModerationComment({ pageId, bodyMarkdown, parentId?, anonymous?, authorName? })` and `editModerationComment({ commentId, bodyMarkdown })` post `comment-create` / `comment-edit` targets to `/api/moderation`; the composer and the own-comment editor use them instead of the public endpoints, which reject origins outside the site's allow-list and ask guests for verification.
  - `onModerated` (React prop, Vue `@moderated`, Angular `(moderated)` output, vanilla `onModerated` option) fires after a successful moderation action, lock change or moderator post so a host dashboard can refresh its own thread list.
  - Moderator threads now show and cast votes: `ModerationComment` carries `score`/`viewerVote`, `moderationCommentToComment` keeps them, and the new `setModerationVote({ commentId, value })` client method posts `target: 'vote'` to `/api/moderation` (the public vote route is origin-gated like the others). Hidden/deleted rows and locked pages still hide votes.
  - The moderator composer keeps the anonymous/account identity switcher: moderators post as themselves by default or as an anonymous guest with a display name.
  - React: Delete acts immediately from the row menu (soft `deleted` status, restorable via `Restore`); the "cannot be undone" confirmation dialogs are gone.

- 82cbb59: Reddit-style thread design for the React widget:
  - Replies hang off their parent through measured Fumadocs-style connector lines: a cubic Bézier guide drawn in the gutter of each thread's replies, with a line down a top-level comment's own rows only when it has replies and a fresh subpath per thread, so threads never connect; the segment at the middle of the viewport draws in `threadActive` while the rest stays `threadMuted`, and folded reply groups keep a stub beside their trigger, with a `Replying to @author` caption so a reply reads as attached to its parent. Guides re-measure whenever the render order changes, so a vote that re-ranks a thread under `best` never leaves stale rails behind.
  - Reply groups collapse through the shadcn Base UI `Accordion`: while hidden the trigger shows an overlapping stack of reply-author avatars (three, then `+N`), and while open it shows `Hide N replies`.
  - Timestamps render as short ages (`5m ago`, `2d ago`) with the full local time on hover, via the new `formatRelativeTime` client helper; `collectThreadParticipants` backs the avatar stack.
  - `actionMode` (`icon` | `icon-text` | `text`, default `icon-text`) picks how Reply/Edit/Delete and moderator actions render their lucide icons.
  - Comment actions move behind a `⋮` popover next to the timestamp (Reply stays in its row), pinning reorders a comment within its own depth, `best` joins the sort modes, the reply editor opens inline under its target, and site admins get a coloured name plus an `[Admin]` badge. Delete entries and their confirmation buttons use the destructive colour, the collapse control beside the avatar is an outline ring rather than a filled disc, and a blocked author shows a `blocked` badge (moderation rows). Reply groups are summarised by an avatar stack that counts pinned, hidden and deleted replies too; moderators also see the per-state counts. Composers show a live character count under the body against `bodyLimit` (default 10,000, counted before trimming); over the limit the count turns destructive, the submit button disables and the form refuses to post, so the widget agrees with the host server's own cap.
  - New theme tokens keep the components stylable: `commentBorder`, `replyBackground`, `threadActive`, `threadMuted`, `avatarRing`, `voteBackground`, `voteBorder`, `voteShadow`, `actionColor`, `actionHoverColor`, `actionHoverBackground`, with public hooks `.lc-replies-trigger`, `.lc-thread-overlay`, `.lc-reply-stack`, `.lc-vote` and `.lc-action`.
