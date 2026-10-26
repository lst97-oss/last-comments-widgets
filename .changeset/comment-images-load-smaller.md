---
'@lst97-oss/last-comments-widgets': minor
---

Comment images load lighter and fail visibly.

- Images fit the comment column and are capped at 28rem tall, keeping their proportions. The link around an image still opens the full file.
- Images from Cloudinary, Unsplash, imgix and Wikimedia Commons request a 640px and a 1280px rendition, so the browser fetches the smaller one on ordinary screens. If a rendition fails, the widget tries the original file once.
- Hosts without a known resize scheme load the original, lazily and without blocking the thread.
- A missing or refused image shows an "Image unavailable" label in place of the broken-image box. A link that is not an absolute http(s) URL, such as a relative path or `javascript:`, is never loaded.

The label uses the `.lc-image-unavailable` theme hook.
