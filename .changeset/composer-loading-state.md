---
"@lst97-oss/last-comments-widgets": patch
---

The composer's post button now shows its loading state while the comment is in flight and a second click cannot post the same comment twice. React's composer had the state update inside the form action, which React 19 defers until the action settles — the button stayed enabled and read "Post comment" during the whole request; the busy state now starts on the submit event and is held by an in-flight counter. Every port (React, Vue, Angular, vanilla) locks the head composer, the reply and the inline editor, so a double click posts once.
