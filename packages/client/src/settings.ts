// The site policy a widget reads before the visitor types: who may read and write,
// the comment length limit, the guest edit window and the public Turnstile key.
// The server enforces all of it; the widget only uses it to show the right state
// up front, so a refusal does not arrive as the first thing a reader learns.

export type SiteAccess = 'open' | 'login' | 'private'

export type CommentSettings = {
  access: SiteAccess
  bodyLimit: number
  anonEditWindowMinutes: number
  turnstileSiteKey: string | null
  features: { votes: boolean }
}

// Comment bodies are capped at this many characters (counted before trimming).
export const DEFAULT_BODY_LIMIT = 10_000
export const DEFAULT_ANON_EDIT_WINDOW_MINUTES = 10

export const DEFAULT_SETTINGS: CommentSettings = {
  access: 'open',
  bodyLimit: DEFAULT_BODY_LIMIT,
  anonEditWindowMinutes: DEFAULT_ANON_EDIT_WINDOW_MINUTES,
  turnstileSiteKey: null,
  features: { votes: true },
}

const ACCESS_LEVELS: readonly SiteAccess[] = ['open', 'login', 'private']
const MAX_EDIT_WINDOW_MINUTES = 100_000
const SETTINGS_CACHE_MS = 60_000
const SETTINGS_TIMEOUT_MS = 4_000

function wholeNumberIn(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined
}

// Fails open on unknown values. The server still refuses what it must, so a widget
// that cannot read a value shows the permissive state rather than hiding the thread.
export function normalizeSettings(raw: unknown): CommentSettings | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  const access = ACCESS_LEVELS.find((level) => level === value.access) ?? DEFAULT_SETTINGS.access
  const key =
    typeof value.turnstileSiteKey === 'string' && value.turnstileSiteKey.trim() !== '' ? value.turnstileSiteKey : null
  // A server that predates the flag sends none, which means voting stays on, as it always was.
  const features = typeof value.features === 'object' && value.features !== null ? value.features : {}
  return {
    access,
    bodyLimit: wholeNumberIn(value.bodyLimit, 1, DEFAULT_BODY_LIMIT) ?? DEFAULT_BODY_LIMIT,
    anonEditWindowMinutes:
      wholeNumberIn(value.anonEditWindowMinutes, 0, MAX_EDIT_WINDOW_MINUTES) ?? DEFAULT_ANON_EDIT_WINDOW_MINUTES,
    turnstileSiteKey: key,
    features: { votes: (features as { votes?: unknown }).votes !== false },
  }
}

type CacheEntry = { at: number; value: CommentSettings }
const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<CommentSettings | null>>()

// The settings endpoint is public and cacheable, so a page of widgets shares one
// request per site. A failure resolves to null and is not cached, so the next mount retries.
export async function fetchCommentSettings(options: {
  baseUrl: string
  site: string
  fetchImpl?: typeof fetch
  now?: () => number
}): Promise<CommentSettings | null> {
  const base = options.baseUrl.replace(/\/$/, '')
  const key = `${base}|${options.site}`
  const now = options.now ? options.now() : Date.now()
  const cached = cache.get(key)
  if (cached && now - cached.at < SETTINGS_CACHE_MS) return cached.value
  const pending = inFlight.get(key)
  if (pending) return pending
  const request = (async (): Promise<CommentSettings | null> => {
    try {
      const params = new URLSearchParams({ site: options.site })
      const res = await (options.fetchImpl ?? fetch)(`${base}/api/comments/settings?${params}`, {
        // No cookies: the document is public, and a wildcard origin must not carry credentials.
        credentials: 'omit',
        signal: AbortSignal.timeout(SETTINGS_TIMEOUT_MS),
      })
      if (!res.ok) return null
      const json = (await res.json()) as { data?: { settings?: unknown } }
      const value = normalizeSettings(json.data?.settings)
      if (value) cache.set(key, { at: now, value })
      return value
    } catch {
      return null
    } finally {
      inFlight.delete(key)
    }
  })()
  inFlight.set(key, request)
  return request
}

export function resetSettingsCache(): void {
  cache.clear()
  inFlight.clear()
}

export type SettingsOverrides = {
  bodyLimit?: number
  anonEditWindowMinutes?: number
  turnstileSiteKey?: string
}

// Precedence: an explicit prop, then the `settings` object the host passed, then the
// fetched document, then the built-in default. Undefined entries never win.
export function resolveSettings(
  overrides: SettingsOverrides,
  supplied: Partial<CommentSettings> | undefined,
  fetched: CommentSettings | null,
): CommentSettings {
  const merged = { ...DEFAULT_SETTINGS, ...definedOnly(fetched ?? {}), ...definedOnly(supplied ?? {}) }
  return (
    normalizeSettings({
      ...merged,
      ...definedOnly({
        bodyLimit: overrides.bodyLimit,
        anonEditWindowMinutes: overrides.anonEditWindowMinutes,
        turnstileSiteKey: overrides.turnstileSiteKey,
      }),
    }) ?? DEFAULT_SETTINGS
  )
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>
}

export type Gate = 'allow' | 'sign-in'

// Mirrors the server's anonymous rules: open admits everyone; login admits anonymous
// reads only; private admits no anonymous visitor. A signed-in viewer always passes.
// True when the host supplied every field, so the widget needs no fetch to know the policy.
export function isCompleteSettings(value: Partial<CommentSettings> | undefined): value is CommentSettings {
  return (
    value !== undefined &&
    value.access !== undefined &&
    value.bodyLimit !== undefined &&
    value.anonEditWindowMinutes !== undefined &&
    value.turnstileSiteKey !== undefined &&
    value.features !== undefined
  )
}

export function gateFor(access: SiteAccess, operation: 'read' | 'write', signedIn: boolean): Gate {
  if (signedIn || access === 'open') return 'allow'
  if (access === 'login') return operation === 'read' ? 'allow' : 'sign-in'
  return 'sign-in'
}
