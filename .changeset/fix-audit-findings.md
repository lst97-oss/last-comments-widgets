---
'@lst97-oss/last-comments-widgets': patch
---

Fixes from the repo audit.

- Plain-HTML widget: a vote can be taken back again. After a vote, the second click on the same arrow used to send the same vote, so it stayed until the page reloaded.
- Moderation: a page that is not in the site's newest 100 pages no longer shows an empty thread with no message. The widget shows "Moderation cannot find this page", and a host can pass `pageId` to moderate it. Vue's moderation view also fills each page with whole threads, as the other ports already did.
- Plain-HTML widget: `data-lc-limit` must be a whole number of 1 or more. A value such as `ten` used to empty the widget with "No comments yet".
- A post that the server never answered (a timeout or a dropped connection) now says the comment may already be posted, and to check the thread before posting again.
- The peer ranges for `@angular/cdk`, `@lucide/angular` and `vue` are caret ranges, so hosts on another patch version can install the package.
- Code blocks keep their highlighted markup for up to 200 blocks, so repaints do not highlight them again.
- `canEditComment`, `initials` and the viewport observer each have one copy, in the client, and every port uses it. The public exports of each port are unchanged.
- The client package adds `canEditComment`, `initials`, `postFailure`, `resolveModerationThread` and `loadModerationWindow` for hosts that build their own UI. `PAGE_NOT_LISTED` is a new value of `ApiErrorCode`.
