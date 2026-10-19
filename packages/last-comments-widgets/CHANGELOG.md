# @lst97-oss/last-comments-widgets

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
