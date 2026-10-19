---
'@lst97-oss/last-comments-widgets': minor
---

Port parity: the Vue, Angular and vanilla widgets now match the React widget's function, style and layout, and the React widget is unchanged.

- Shared props across all four ports: `actionMode` (`icon` | `icon-text` | `text`, default `icon-text`), `bodyLimit` (default 10,000, counted before trimming) and `anonEditWindowMinutes` (default 10) replace the ports' old `editWindowMinutes`. Signed-in authors edit any time; guests edit only from the browser that stored the key issued when they posted. The vanilla port reads the same three from `data-lc-action-mode`, `data-lc-body-limit` and `data-lc-anon-edit-window-minutes`.
- Rows follow the React contract everywhere: the collapse control, the author avatar and name (with the `[Admin]` badge), the `blocked` badge for moderation rows, short ages with the full local time on hover, edited/pinned markers, hidden/deleted badges, the `Replying to @author` caption, and the `⋮` menu that holds Edit, own Delete, the moderator's Hide/Restore, Pin/Unpin, Delete and Block/Unblock entries. Deletes act immediately (soft delete, no confirmation dialog) and moderation rows show the pinned/hidden/deleted breakdown of a reply group.
- Reply groups fold through a headless disclosure per framework (Reka UI in Vue, the CDK accordion in Angular, a hand-rolled panel in vanilla) with the same two labels, the same avatar stack, and the same measured Fumadocs-style connector lines every port now draws.
- A sort toolbar (Newest/Oldest/Best) re-ranks the threads in all four ports; votes re-rank under `best` and the guides re-measure, so no stale rails are left behind.
- Composers show a live character count against `bodyLimit` (red once over, submit disabled and the send refused), and the reply composer opens inline under the comment it answers.
- New client helper `foldReplySummary(children)` returns the reply total plus the moderator-only pinned/hidden/deleted breakdown of a reply group; the theme hooks (`.lc-actions-menu`, `.lc-thread-guides`, `.lc-thread-overlay`, `.lc-replies-trigger`, `.lc-collapse`, `.lc-admin-badge`, `.lc-blocked-badge`) apply to every port.
