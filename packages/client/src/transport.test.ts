import { describe, expect, test } from 'bun:test'
import { createClient, describeError } from './index'
import { ApiError, resilientFetch } from './transport'

const url = 'https://comments.test/api/comments'
const fast = { baseDelayMs: 1 }
const ok = () => Response.json({ data: { ok: true } })

// One scripted answer per call, so a test can count how many calls the transport made.
function scripted(answers: Array<Response | Error>) {
  const calls: string[] = []
  const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push(init?.method ?? 'GET')
    const next = answers.shift()
    if (next === undefined) throw new Error('no scripted answer left')
    if (next instanceof Error) throw next
    return next
  }
  return { calls, fetchImpl }
}

describe('resilientFetch', () => {
  test('a GET that answers 503 is retried, and the next answer is used', async () => {
    const { calls, fetchImpl } = scripted([new Response('busy', { status: 503 }), ok()])
    const response = await resilientFetch(fetchImpl, fast)(url)
    expect(response.status).toBe(200)
    expect(calls).toEqual(['GET', 'GET'])
  })

  test('a write is never retried, so a comment or a vote is not repeated', async () => {
    const { calls, fetchImpl } = scripted([new Response('busy', { status: 503 }), ok()])
    const response = await resilientFetch(fetchImpl, fast)(url, { method: 'POST' })
    expect(response.status).toBe(503)
    expect(calls).toEqual(['POST'])
  })

  test('a permanent answer is not retried', async () => {
    const { calls, fetchImpl } = scripted([new Response('gone', { status: 404 }), ok()])
    const response = await resilientFetch(fetchImpl, fast)(url)
    expect(response.status).toBe(404)
    expect(calls).toEqual(['GET'])
  })

  test('a network failure is retried, then ends as NETWORK_ERROR with status 0', async () => {
    const { calls, fetchImpl } = scripted([
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
    ])
    const error = await resilientFetch(fetchImpl, { ...fast, retries: 2 })(url).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', status: 0, retryable: true })
    expect(calls).toHaveLength(3)
  })

  test('a call that never answers ends as TIMEOUT once its time limit passes', async () => {
    const stalled = (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })
    const error = await resilientFetch(stalled, { timeoutMs: 20, retries: 0 })(url).catch((cause: unknown) => cause)
    expect(error).toMatchObject({ code: 'TIMEOUT', status: 0 })
  })
})

describe('the client on top of the transport', () => {
  const baseUrl = 'https://comments.test'

  test('Retry-After and the request id reach the ApiError, so a host can wait and trace', async () => {
    const fetchImpl = (async () =>
      Response.json(
        { error: { code: 'RATE_LIMITED', message: 'slow down' } },
        { status: 429, headers: { 'retry-after': '3', 'x-request-id': 'req-3' } },
      )) as unknown as typeof fetch
    const client = createClient({ baseUrl, site: 'site', fetchImpl, resilience: { retries: 0 } })
    const error = await client.listComments({ url: 'https://example.test/post' }).catch((cause: unknown) => cause)
    expect(error).toMatchObject({ code: 'RATE_LIMITED', status: 429, retryable: true, retryAfterMs: 3000 })
    expect(error).toMatchObject({ requestId: 'req-3' })
  })

  test('a proxy page that is not JSON never shows a parser message', async () => {
    const fetchImpl = (async () => new Response('<html>Bad gateway</html>', { status: 502 })) as unknown as typeof fetch
    const client = createClient({ baseUrl, site: 'site', fetchImpl, resilience: { retries: 0 } })
    const error = (await client
      .listComments({ url: 'https://example.test/post' })
      .catch((cause: unknown) => cause)) as ApiError
    expect(error).toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 502 })
    expect(describeError(error).message).not.toMatch(/JSON|Unexpected/)
  })
})

describe('describeError for transport failures', () => {
  test('a dropped connection reads as a connection problem, with a retry', () => {
    expect(describeError(new ApiError('NETWORK_ERROR', 'x', 0))).toMatchObject({
      title: "Couldn't reach the comments service",
      action: 'retry',
    })
  })

  test('a permanent failure the copy does not cover offers no retry', () => {
    expect(describeError(new ApiError('SOMETHING_NEW', 'nope', 501)).action).toBe('none')
  })
})
