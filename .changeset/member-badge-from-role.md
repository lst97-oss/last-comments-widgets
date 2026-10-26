---
'@lst97-oss/last-comments-widgets': minor
---

The account badge follows the server's site role now.

- `Admin` shows for the site admin and `Member` for a member. A signed-in account with no role gets no badge. Before, every signed-in account without a membership was labelled `Member`.
- `ViewerRole` is `admin` only. Moderation controls show only for the site admin, so `viewerRole="moderator"` (or `data-lc-viewer-role="moderator"`) no longer renders them.
- New `SiteRole` type (`admin` | `member`) for an author's role and a moderation site's role.
