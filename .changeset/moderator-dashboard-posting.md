---
'@lst97-oss/last-comments-widgets': minor
---

Moderator mode can now be driven by an admin dashboard, in every framework port (React, Vue, Angular, vanilla):

- `pageId` (React/Vue props, Angular `pageId` input, vanilla `pageId` option): the thread is addressed directly instead of matching `pageUrl` against the site's (capped) page list.
- New client methods `createModerationComment({ pageId, bodyMarkdown, parentId?, anonymous?, authorName? })` and `editModerationComment({ commentId, bodyMarkdown })` post `comment-create` / `comment-edit` targets to `/api/moderation`; the composer and the own-comment editor use them instead of the public endpoints, which reject origins outside the site's allow-list and ask guests for verification.
- `onModerated` (React prop, Vue `@moderated`, Angular `(moderated)` output, vanilla `onModerated` option) fires after a successful moderation action, lock change or moderator post so a host dashboard can refresh its own thread list.
- Moderator threads now show and cast votes: `ModerationComment` carries `score`/`viewerVote`, `moderationCommentToComment` keeps them, and the new `setModerationVote({ commentId, value })` client method posts `target: 'vote'` to `/api/moderation` (the public vote route is origin-gated like the others). Hidden/deleted rows and locked pages still hide votes.
- The moderator composer keeps the anonymous/account identity switcher: moderators post as themselves by default or as an anonymous guest with a display name.
- React: Delete acts immediately from the row menu (soft `deleted` status, restorable via `Restore`); the "cannot be undone" confirmation dialogs are gone.
