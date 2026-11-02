// The one request path for the comments client: a time limit on every call, and a retry for reads only. Writes are
// never retried, because a retry can repeat a comment or a vote the server already saved.

export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

// Status 0 means no response arrived (a network failure or a timeout). A permanent answer (400, 401, 403, 404, 501)
// will not change on a retry.
export function isRetryableStatus(status: number): boolean {
  return status === 0 || RETRYABLE_STATUSES.has(status)
}

// Retry-After is delta-seconds or an HTTP-date. Returns the wait in ms, or undefined when absent or unreadable.
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const seconds = Number(trimmed)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(trimmed)
  return Number.isNaN(date) ? undefined : Math.max(0, date - now)
}

export type ApiErrorOptions = {
  cause?: unknown
  retryAfterMs?: number | undefined
  requestId?: string | undefined
}

// Every failed call throws this. `status` is 0 when no response arrived. `retryable` comes from the status, so a
// caller never re-derives it. `retryAfterMs` and `requestId` are the server's own hints, for the host's logs.
export class ApiError extends Error {
  code: string
  status: number
  retryable: boolean
  retryAfterMs: number | undefined
  requestId: string | undefined

  constructor(code: string, message: string, status: number, options?: ApiErrorOptions) {
    super(message, { cause: options?.cause })
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.retryable = isRetryableStatus(status)
    this.retryAfterMs = options?.retryAfterMs
    this.requestId = options?.requestId
  }
}

export type Resilience = {
  // Every call gives up after this long, so a stalled network ends in a TIMEOUT rather than a spinner that never stops.
  timeoutMs?: number
  // Extra tries for a GET that fails before any answer, or answers with a retryable status. Writes never retry.
  retries?: number
  // The first wait between tries. Each later wait doubles, with jitter.
  baseDelayMs?: number
}

// A server's Retry-After is honored, but never longer than this, so a page does not freeze behind one header.
const MAX_RETRY_AFTER_MS = 5_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const backoffMs = (baseDelayMs: number, attempt: number) => baseDelayMs * 2 ** attempt * (0.5 + Math.random())

// Joins the caller's own cancellation (if any) with the time limit: whichever fires first ends the call.
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

export function resilientFetch(fetchImpl: FetchFn, resilience: Resilience = {}): FetchFn {
  const timeoutMs = resilience.timeoutMs ?? 15_000
  const retries = resilience.retries ?? 2
  const baseDelayMs = resilience.baseDelayMs ?? 300
  return async (input, init) => {
    const isRead = (init?.method ?? 'GET').toUpperCase() === 'GET'
    const tries = isRead ? retries + 1 : 1
    for (let attempt = 0; ; attempt += 1) {
      const last = attempt + 1 >= tries
      let response: Response
      try {
        response = await fetchImpl(input, { ...init, signal: withTimeout(init?.signal ?? undefined, timeoutMs) })
      } catch (cause) {
        // The caller cancelled on purpose: that is not a failure to report or retry.
        if (init?.signal?.aborted) throw cause
        const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError'
        const error = new ApiError(
          timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
          timedOut ? 'The comments service did not answer in time.' : "Couldn't reach the comments service.",
          0,
          { cause },
        )
        if (last) throw error
        await sleep(backoffMs(baseDelayMs, attempt))
        continue
      }
      if (last || !isRetryableStatus(response.status)) return response
      const hint = parseRetryAfter(response.headers.get('retry-after'))
      await sleep(hint === undefined ? backoffMs(baseDelayMs, attempt) : Math.min(hint, MAX_RETRY_AFTER_MS))
    }
  }
}
