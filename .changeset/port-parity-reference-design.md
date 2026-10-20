---
'@lst97-oss/last-comments-widgets': minor
---

The Vue, Angular and plain-HTML ports now render the same surfaces as the React widget. The identity switcher is a real dropdown menu with the radio items the React menu has, the row's actions panel is a dialog popover instead of an inline menu, and the avatar, the buttons and the icons follow the shared reference — the plain-HTML port inlines the upstream lucide paths, so every port draws the same glyph. The reply trigger, the composer's controls and the vote buttons use the shared button variants, and the nested reply list keeps the thread guides' gutter.
