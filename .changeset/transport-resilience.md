---
"@lst97-oss/last-comments-widgets": minor
---

Every request has a time limit, and reads retry on their own. A stalled network ends as `TIMEOUT` rather than a spinner that never stops. A `GET` that fails before any answer, or answers 408, 425, 429, 500, 502, 503 or 504, is retried on a backoff, honoring `Retry-After` up to 5 seconds. Writes are never retried.

- **`ApiError`** gains `retryable`, `retryAfterMs` and `requestId`. Branch on `retryable`, not on `status`.
- **A proxy's HTML error page** no longer shows a JSON parser message. It reads as `SERVICE_UNAVAILABLE`, or `UNREADABLE_RESPONSE` below 500.
- **Dropped connections and timeouts** read as the same connection problem, with a Try again.
- **Permanent failures** the copy does not cover offer no Try again.
- **`createClient`** takes `resilience: { timeoutMs, retries, baseDelayMs }` to tune the limits.
