---
'@lst97-oss/last-comments-widgets': patch
---

Removed comments now read as placeholders in the normal view: a deleted comment
shows a `[deleted]` tombstone (author anonymised, body gone) and a hidden
comment says it is under review, both Reddit-style. Replies stay visible under
the placeholder, and moderators still see the original body plus the status
badge so a restore can still be judged. Deleting your own comment leaves the
tombstone in place instead of dropping the row.

A blocked account now gets a clear reason when it posts or replies: the error
says the account is blocked and to contact the site admin for assistance,
instead of the server's generic "You cannot comment on this site".
