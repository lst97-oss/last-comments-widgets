---
'@lst97-oss/last-comments-widgets': patch
---

Internal maintenance: the React viewer keeps its state in one reducer and renders its thread body as a separate component, and the comments widget derives the read-gate sign-in prompt instead of adjusting state in an effect. Public API and rendered markup are unchanged.
