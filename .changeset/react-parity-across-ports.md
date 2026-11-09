---
'@lst97-oss/last-comments-widgets': minor
---

Vue, Angular and the plain-HTML widget now match the React widget on the same features and styles.

- Fenced code blocks are syntax-highlighted in every widget. The Shiki upgrade moved into the shared client (`/enhance`); `codeHighlight` (`data-lc-no-code-highlight` on plain HTML) turns it off. Vue, Angular and plain HTML now load `shiki` for it, so install `shiki` next to the widget as React already requires; plain HTML maps it in its import map.
- The composer has the same toolbar in every widget: Inline code and a new Code block action.
- A moderator sees the "Comment as" identity control in every widget, as in React.
- Vote buttons are disabled while a vote is in flight.
- `onSignInClick` replaces the OAuth start in the sign-in prompts in Vue, Angular and plain HTML, as it already did in React. The Vue `sign-in` event was declared but never emitted, so it is removed; use `onSignInClick`.
- The editor of an own comment has a Cancel button in every widget.
- Locked and blocked pages in Vue show the shared error block, as in React, instead of a separate panel.
- Vue exports `CommentsTheme` and Angular exports `LcCommentsThemeComponent`, the scope wrapper for composed pieces, matching React's `CommentsTheme`.
