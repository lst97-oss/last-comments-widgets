---
'@lst97-oss/last-comments-widgets': minor
---

Anonymous editing, identity-aware edit windows, and thread sorting:

- Guest comments can be edited by their author: the create response carries a one-time `editKey`, the widget stores it in `localStorage` and sends it on `PATCH /api/comments/:id`. Signed-in authors edit any time; guest edits use the server's anonymous window.
- React `Comments`/`CommentViewer` sort threads pinned-first with a Newest/Oldest toggle; shared `sortCommentRoots` and `resolveEditWindow` helpers live in the client package. `best` joins the modes: net score descending, pinned first at every depth, with `sortThreadTree` sorting each reply level; negative-score comments render collapsed in every mode.
- Comment rows carry the author's site role as `authorRole` (`admin` | `moderator` | `null`), so hosts can mark staff authors; React colours site-admin names and adds an `[Admin]` badge (`.lc-admin-badge` hook).
- React takes `anonEditWindowMinutes` (default 10); `editWindowMinutes` is gone from the React props because signed-in editing has no window. Other ports are unchanged until they are ported.
