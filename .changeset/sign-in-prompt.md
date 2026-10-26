---
'@lst97-oss/last-comments-widgets': minor
---

Login and private sites show a sign-in card in place of the composer and the thread.

- `login`: a signed-out visitor sees the card where the composer would be. Reply stays visible, and a signed-out Reply opens the card under the comment, with no request.
- `private`: the thread is not fetched. The comments widget and the read-only viewer each show exactly one card, and the composer slot stays empty.
- The card is neutral and follows the host's theme through the new `signIn*` tokens (`--lc-signin-*`). Its button goes to `signInUrl`, or starts the sign-in flow in place when none is set. `CommentViewer` takes `signInUrl` too (`data-lc-sign-in-url` in vanilla).
- Fixed: every refused action showed the same generic "Sign in to do that." line. Each action keeps its own (for example "Sign in to reply to this comment.").
- Fixed: the Angular comments widget threw while rendering a private site, so nothing was shown in place of the thread.
