---
"@lst97-oss/last-comments-widgets": minor
---

Fixes in all four widgets, plus removals from the client.

- **Paging after a post.** A post on a thread with more pages no longer shifts the next page. A reader no longer misses a comment or sees their own post twice. When more pages remain, the first page reloads, as the plain-HTML widget already did.
- **Turnstile after a refused post.** A send the server refuses still spends its challenge, so the widget replaces the challenge before the retry. The draft stays.
- **Mermaid safety check.** The SVG check now walks the parsed markup. It refuses event handlers and `javascript:` links that the old text check let through, such as `<g/onmouseover=…>` and entity-encoded links. Ordinary diagrams are drawn as before.
- **Settings retry.** A settings request that fails at once is no longer kept, so the next mount retries.
- **Sign-in copy.** A sign-in error with an unknown code shows the generic line, not a blank box.
- **Reactions.** A reaction refused for an expired session asks the reader to sign in to react, in every port. A press that answers while the page-bar counts are still loading is no longer undone by those counts.
- **Roles.** Reaction rows and the sort bar use `role="group"`, since the arrow keys that `toolbar` promises are not implemented.
- **Added:** `reactionFailure` in `/client`, the copy for a reaction that does not save.
- **Removed:** `accountBadge` and `AccountBadge` (read `comment.authorRole`), and `DEFAULT_EDIT_WINDOW_MINUTES`. `isEditWindowOpen` now takes the time and the window as arguments.
