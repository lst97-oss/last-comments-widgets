---
"@lst97-oss/last-comments-widgets": minor
---

Emoji reactions, in all four widgets (React, Vue, Angular and the plain HTML widget).

- **A reaction bar on the page**, and **reactions on each comment and reply**. A signed-in visitor can hold several different emoji on one comment; a guest who clicks is asked to sign in, with no request sent. A moderator sees the counts and cannot react.
- **Each switch is the site's**: `features.pageReactions` and `features.commentReactions` in the settings document. Each lists the allowed emoji, and an empty list means that switch is off. A service that predates reactions sends neither, so no reaction UI shows.
- **Typing change.** `CommentSettings.features` now has `pageReactions` and `commentReactions` as well as `votes`. A host that passes a `settings` object should pass `features` whole.
- **Client.** `castReaction`, `clearReaction`, `listPageReactions`, `castPageReaction` and `clearPageReaction`. `Comment.reactions` is always a list, including from a server that predates reactions.
- **Theme.** `reactionBackground`, `reactionBorder`, `reactionActiveBackground` and `reactionActiveBorder` tokens, and the `.lc-reaction` hooks.
- **Not in this release:** the read-only `CommentViewer` does not show reaction counts yet.
