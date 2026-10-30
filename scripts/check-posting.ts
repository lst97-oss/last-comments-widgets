// Browser check of two posting rules across all four ports. (1) A post on a thread with more pages must not
// shift the next page: the next page asks for offset 20, every comment shows once, and the reader sees the rest of
// the thread. (2) A refused post spends its Turnstile token: the widget must replace the challenge before the retry,
// and the retry must send a fresh token, which the stub refuses when a token is reused. Playwright serves the
// settings, the session, the thread and the write; the Turnstile API is a fake that issues one token per render
// and per reset.
import { chromium, type Page } from 'playwright-core'

const frameworks = ['vanilla', 'react', 'vue', 'angular'] as const
type Framework = (typeof frameworks)[number]

const widgets = new URL('..', import.meta.url).pathname
const problems: string[] = []
const results: Record<string, unknown> = {}

// Turnstile's API as the widgets use it: render and reset take the widget id, and every render or reset
// issues a new token asynchronously, like the real challenge.
const FAKE_TURNSTILE = `
  window.__turnstileResets = 0
  let issued = 0
  const callbacks = new Map()
  window.turnstile = {
    render(el, params) {
      const id = 'widget-' + (++issued)
      callbacks.set(id, params.callback)
      setTimeout(() => params.callback('token-' + issued), 0)
      return id
    },
    reset(id) {
      window.__turnstileResets += 1
      const callback = callbacks.get(id)
      if (callback) setTimeout(() => callback('token-' + (++issued)), 0)
    },
    remove() {},
  }
`

// Thread of 25 root comments, oldest first, as the list endpoint orders them.
function row(id: string, body: string, minute: number) {
  return {
    id,
    pageId: 'page-1',
    parentId: null,
    userId: null,
    authorName: 'Grace',
    avatarUrl: null,
    bodyMarkdown: body,
    status: 'visible',
    pinnedAt: null,
    createdAt: new Date(Date.UTC(2026, 9, 17, 0, minute)).toISOString(),
    editedAt: null,
    authorRole: null,
    score: 0,
    viewerVote: null,
    reactions: [],
  }
}

function settings(turnstileSiteKey: string | null) {
  return {
    version: 1,
    access: 'open',
    bodyLimit: 500,
    anonEditWindowMinutes: 10,
    turnstileSiteKey,
    features: { votes: true, pageReactions: [], commentReactions: [] },
  }
}

// CI passes the Chrome for Testing binary its setup step installed; locally the installed Chrome is used.
const launch = Bun.env.CHROME_PATH
  ? { executablePath: Bun.env.CHROME_PATH }
  : { channel: Bun.env.THEME_BROWSER_CHANNEL ?? 'chrome' }
const browser = await chromium.launch({ ...launch, headless: true })

// Serves one port's settings fixture on a local page, the way a host page would load it.
async function serveFixture(framework: Framework) {
  const built = await Bun.build({
    entrypoints: [`${widgets}packages/${framework}/test/settings.fixture.ts`],
    target: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' },
  })
  if (!built.success) throw new AggregateError(built.logs, `Could not build the ${framework} fixture`)
  const output = built.outputs[0]
  if (!output) throw new Error(`The ${framework} fixture built no output`)
  const bundle = await output.text()
  return Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname
      if (path === '/fixture.js') return new Response(bundle, { headers: { 'Content-Type': 'text/javascript' } })
      return new Response(
        `<!doctype html><html><body><div id="root"></div><lc-settings-fixture></lc-settings-fixture>` +
          `<script type="module" src="/fixture.js"></script></body></html>`,
        { headers: { 'Content-Type': 'text/html' } },
      )
    },
  })
}

type Scenario = { turnstile: boolean; statuses: number[] }
type Session = {
  page: Page
  offsets: number[]
  posts: { token: string | null; body: string }[]
  errors: string[]
  stop: () => void
}

// One port in one scenario: a fresh page, the stubbed API, and what the port asked for.
async function openPage(framework: Framework, scenario: Scenario): Promise<Session> {
  const server = await serveFixture(framework)
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } })
  if (scenario.turnstile) await page.addInitScript(FAKE_TURNSTILE)
  const session: Session = { page, offsets: [], posts: [], errors: [], stop: () => server.stop() }
  page.on('pageerror', (error) => session.errors.push(error.message))
  page.on('console', (message) => {
    // The refused post is logged by the browser as a failed request; that is the scenario, not an error.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      session.errors.push(message.text())
    }
  })

  const stream = Array.from({ length: 25 }, (_, index) => row(`c${index}`, `comment r${index}`, index))
  const statuses = [...scenario.statuses]
  const usedTokens = new Set<string>()

  await page.route('https://challenges.cloudflare.com/**', (route) => route.abort())
  await page.route('http://api.test/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    // Credentialed requests must echo the page origin, not a wildcard.
    const cors = {
      'access-control-allow-origin': request.headers().origin ?? '*',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })

    if (url.pathname === '/api/comments/settings') {
      return json({ data: { settings: settings(scenario.turnstile ? 'site-key' : null) } })
    }
    if (url.pathname === '/api/auth/get-session') return json(null)
    if (url.pathname === '/api/comments' && request.method() === 'GET') {
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 20)
      session.offsets.push(offset)
      return json({ data: { comments: stream.slice(offset, offset + limit) } })
    }
    if (url.pathname === '/api/comments' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as { bodyMarkdown: string; verificationToken?: string }
      const token = body.verificationToken ?? null
      session.posts.push({ token, body: body.bodyMarkdown })
      // A token is single-use: the server spends it before it checks anything else, refused or not.
      if (scenario.turnstile) {
        if (!token || usedTokens.has(token)) {
          return json({ error: { code: 'COMMENT_VERIFICATION_FAILED', message: 'Complete the challenge again' } }, 400)
        }
        usedTokens.add(token)
      }
      const status = statuses.shift() ?? 201
      if (status !== 201) {
        return json({ error: { code: 'INTERNAL_ERROR', message: 'Could not save this comment.' } }, status)
      }
      const created = row('c-new', body.bodyMarkdown, 100)
      stream.push(created)
      return json({ data: { comment: created } }, 201)
    }
    return json({ error: { code: 'NOT_FOUND', message: 'not in harness' } }, 404)
  })

  await page.goto(server.url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  return session
}

async function until(check: () => boolean | Promise<boolean>, label: string, timeoutMs = 8000) {
  const started = Date.now()
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`)
    await Bun.sleep(50)
  }
}

const countOf = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length

// What the page showed when a wait gave up, so a failure names its state.
async function diagnose(session: Session): Promise<string> {
  const text = await session.page
    .evaluate(() => document.body.textContent.replace(/\s+/g, ' ').slice(0, 240))
    .catch(() => '(page gone)')
  return `offsets ${JSON.stringify(session.offsets)}, posts ${session.posts.length}, errors ${JSON.stringify(session.errors.slice(0, 2))}, shown "${text}"`
}

// Scenario 1: a post on a thread with more pages, then the next page.
async function pagingAfterPost(framework: Framework) {
  const label = `${framework}/paging`
  const session = await openPage(framework, { turnstile: false, statuses: [201] })
  const { page } = session
  try {
    await until(
      async () => (await page.evaluate(() => document.body.textContent)).includes('comment r19'),
      `${label} page 1`,
    )
    // Oldest first, so page 2 is the rows after row 19 in stream order (the default sort reverses each page).
    await page.getByRole('button', { name: 'Oldest', exact: true }).click()
    const before = session.offsets.length
    await page.getByLabel('Your name').fill('Ada')
    await page.getByPlaceholder('Your comment here…').fill('comment NEW')
    await page.getByRole('button', { name: 'Post comment', exact: true }).click()
    await until(() => session.posts.length === 1, `${label} post`)
    await until(() => session.offsets.slice(before).includes(0), `${label} first page reload`)
    await page.locator('nav[aria-label="Comments pagination"]').getByRole('button', { name: /Next/ }).click()
    await until(
      async () => (await page.evaluate(() => document.body.textContent)).includes('comment r20'),
      `${label} next page`,
    )
    const requested = session.offsets.slice(before)
    const text = await page.evaluate(() => document.body.textContent)
    const seen = {
      offsets: requested,
      r20: countOf(text, /comment r20(?!\d)/g),
      newComment: countOf(text, /comment NEW(?![A-Za-z])/g),
    }
    results[label] = seen
    if (requested.includes(21)) problems.push(`${label}: next page asked for offset 21 (a row was skipped)`)
    if (!requested.includes(20)) problems.push(`${label}: next page did not ask for offset 20: ${requested}`)
    if (seen.r20 !== 1) problems.push(`${label}: comment r20 shown ${seen.r20} time(s), expected 1`)
    if (seen.newComment !== 1) problems.push(`${label}: the new comment shown ${seen.newComment} time(s), expected 1`)
    if (session.errors.length > 0)
      problems.push(`${label}: ${session.errors.length} page error(s): ${session.errors[0]}`)
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)} (${await diagnose(session)})`)
  } finally {
    await page.close()
    session.stop()
  }
}

// Scenario 2: a refused post with a Turnstile challenge, then a retry.
async function retryAfterRefusal(framework: Framework) {
  const label = `${framework}/retry`
  const session = await openPage(framework, { turnstile: true, statuses: [500, 201] })
  const { page } = session
  try {
    await until(
      async () => (await page.evaluate(() => document.body.textContent)).includes('comment r0'),
      `${label} load`,
    )
    await page.getByLabel('Your name').fill('Ada')
    await page.getByPlaceholder('Your comment here…').fill('comment retry')
    await page.getByRole('button', { name: 'Post comment', exact: true }).click()
    await until(() => session.posts.length === 1, `${label} first post`)
    await until(async () => (await page.evaluate(() => window.__turnstileResets)) >= 1, `${label} reset`)
    // The draft stays after a refused post, so the retry sends the same words.
    const draft = await page.getByPlaceholder('Your comment here…').inputValue()
    await page.getByRole('button', { name: 'Post comment', exact: true }).click()
    await until(() => session.posts.length === 2, `${label} retry post`)
    // A saved post clears the composer. The new row sits past the first page, so the cleared draft is the signal.
    await until(async () => (await page.getByPlaceholder('Your comment here…').inputValue()) === '', `${label} saved`)
    const [first, second] = session.posts
    results[label] = { draftKept: draft === 'comment retry', tokens: [first?.token, second?.token] }
    if (draft !== 'comment retry') problems.push(`${label}: the draft was not kept after a refused post`)
    if (!first?.token) problems.push(`${label}: the first post carried no Turnstile token`)
    if (second?.token === first?.token || !second?.token) {
      problems.push(
        `${label}: the retry sent ${second?.token ?? 'no token'}, not a fresh one (first was ${first?.token})`,
      )
    }
    if (session.errors.length > 0)
      problems.push(`${label}: ${session.errors.length} page error(s): ${session.errors[0]}`)
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)} (${await diagnose(session)})`)
  } finally {
    await page.close()
    session.stop()
  }
}

try {
  for (const framework of frameworks) {
    for (const scenario of [pagingAfterPost, retryAfterRefusal]) {
      try {
        await scenario(framework)
      } catch (error) {
        problems.push(`${framework}/${scenario.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  console.log(JSON.stringify(results, null, 1))
  if (problems.length > 0) {
    console.error(`\n${problems.length} posting expectation(s) failed:\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log(`\nAll ${frameworks.length * 2} port/scenario combinations behave as the posting rules say.`)
  }
} finally {
  await browser.close()
}
