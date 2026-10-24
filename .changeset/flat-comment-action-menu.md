---
'@lst97-oss/last-comments-widgets': patch
---

The ⋮ action menu on each comment is a flat popover: it now draws a solid border (`--lc-border-width`, in the theme's border colour) and no offset shadow. The shadow defaults to `none` through the new `--lc-actions-shadow` token; set it to restore a shadow on that menu. The identity menu (`Comment as`) keeps `--lc-dropdown-shadow`.
