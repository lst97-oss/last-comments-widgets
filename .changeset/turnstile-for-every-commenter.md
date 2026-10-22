---
"@lst97-oss/last-comments-widgets": patch
---

Turnstile now covers every commenter. The challenge renders for signed-in authors too (React, Angular and vanilla rendered it for guests only) and the submit button waits for the token from every identity, not just the guest one. The server verifies the token for signed-in posts as well, so a signed-in session no longer skips the challenge — hosts need a `turnstileSiteKey` for commenting to work at all.
