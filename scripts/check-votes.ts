// Browser check of vote toggling across all four ports. A signed-in reader who clicks the same arrow twice must cast
// the vote and then take it back: the first click sends one cast, the second sends one clear, and the arrow ends off.
// Playwright serves the settings endpoint, the session and the vote routes, and records every vote write.
import { chromium, type Page } from 'playwright-core'

const frameworks = ['vanilla', 'react', 'vue', 'angular'] as const
type Framework = (typeof frameworks)[number]

type Write = { method: string; value: number | null }

const widgets = new URL('..', import.meta.url).pathname
const problems: string[] = []
const results: Record<string, unknown> = {}

const comment = {
  id: 'c1',
  pageId: 'page-1',
  parentId: null,
  userId: 'u2',
  authorName: 'Grace',
  avatarUrl: null,
  bodyMarkdown: 'Vote on this',
  status: 'visible',
  pinnedAt: null,
  createdAt: '2026-10-17T00:00:00.000Z',
  editedAt: null,
  authorRole: null,
  reactions: [],
}

const widgetsServer = Bun.serve({
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname
    if (path === '/fixture.js') return new Response(bundle, { headers: { 'Content-Type': 'text/javascript' } })
    if (path === '/styles.css') return new Response(Bun.file(`${widgets}packages/${framework}/dist/styles.css`))
    if (path.startsWith('/files/')) return new Response(Bun.file(`${widgets}packages/${framework}/dist${path}`))
    return new Response(
      `<!doctype html><html><body><div id="root"></div><lc-settings-fixture></lc-settings-fixture>` +
        `<script type="module" src="/fixture.js"></script></body></html>`,
      { headers: { 'Content-Type': 'text/html' } },
    )
  },
})

// The fixture bundle is built once per port; the server answers with whichever is current.
let bundle = ''
let framework: Framework = 'vanilla'

// CI passes the Chrome for Testing binary its setup step installed; locally the installed Chrome is used.
const launch = Bun.env.CHROME_PATH
  ? { executablePath: Bun.env.CHROME_PATH }
  : { channel: Bun.env.THEME_BROWSER_CHANNEL ?? 'chrome' }
const browser = await chromium.launch({ ...launch, headless: true })

// One signed-in reader on one port: the stubbed API holds the vote, and `writes` records every vote the port sent.
async function openPage() {
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } })
  const pageErrors: string[] = []
  const writes: Write[] = []
  let viewerVote: number | null = null
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    // A failed request is logged by the browser; the widget's own copy is what the check reads.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      pageErrors.push(message.text())
    }
  })

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
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    const score = viewerVote ?? 0

    if (url.pathname === '/api/comments/settings') {
      return json({
        data: {
          settings: {
            version: 1,
            access: 'open',
            bodyLimit: 500,
            anonEditWindowMinutes: 10,
            turnstileSiteKey: null,
            features: { votes: true, pageReactions: [], commentReactions: [] },
          },
        },
      })
    }
    if (url.pathname === '/api/auth/get-session') return json({ user: { id: 'u1', name: 'Ada' } })
    if (url.pathname === '/api/comments') {
      return json({ data: { comments: [{ ...comment, score, viewerVote }] } })
    }
    if (url.pathname === '/api/comments/vote') {
      if (request.method() === 'PUT') {
        const body = JSON.parse(request.postData() ?? '{}') as { value: number }
        writes.push({ method: 'PUT', value: body.value })
        viewerVote = body.value
      } else {
        writes.push({ method: request.method(), value: null })
        viewerVote = null
      }
      return json({ data: { vote: { score: viewerVote ?? 0, viewerVote } } })
    }
    return json({ error: { code: 'NOT_FOUND', message: 'not in harness' } })
  })

  await page.goto(widgetsServer.url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(2500)
  return { page, pageErrors, writes }
}

// The arrow, by its name; aria-pressed is the state the reader sees.
const upvote = (page: Page) => page.getByRole('button', { name: 'Upvote', exact: true }).first()

try {
  for (framework of frameworks) {
    const entry = `${widgets}packages/${framework}/test/settings.fixture.ts`
    const built = await Bun.build({
      entrypoints: [entry],
      target: 'browser',
      define: { 'process.env.NODE_ENV': '"development"' },
    })
    if (!built.success) throw new AggregateError(built.logs, `Could not build the ${framework} settings fixture`)
    const output = built.outputs[0]
    if (!output) throw new Error(`The ${framework} settings fixture built no output`)
    bundle = await output.text()

    const label = `${framework}/signed`
    const { page, pageErrors, writes } = await openPage()
    const arrow = upvote(page)
    if ((await arrow.getAttribute('aria-pressed')) !== 'false') problems.push(`${label}: the arrow starts pressed`)

    await arrow.click()
    await page.waitForTimeout(700)
    if ((await upvote(page).getAttribute('aria-pressed')) !== 'true')
      problems.push(`${label}: the first click did not cast the vote`)

    await upvote(page).click()
    await page.waitForTimeout(700)
    const after = await upvote(page).getAttribute('aria-pressed')
    if (after !== 'false')
      problems.push(`${label}: the second click on the same arrow did not take the vote back (pressed ${after})`)

    const sent = writes.map((write) => (write.method === 'PUT' ? `cast ${write.value}` : 'clear'))
    if (sent.join(' | ') !== 'cast 1 | clear')
      problems.push(`${label}: wrote "${sent.join(' | ')}", expected "cast 1 | clear"`)
    if (pageErrors.length > 0) problems.push(`${label}: ${pageErrors.length} page error(s): ${pageErrors[0]}`)
    results[label] = { writes: sent, pageErrors }
    await page.close()
  }
  console.log(JSON.stringify(results, null, 1))
  if (problems.length > 0) {
    console.error(`\n${problems.length} vote expectation(s) failed:\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log(`\nAll ${frameworks.length} ports take a vote back on the second click.`)
  }
} finally {
  await browser.close()
  widgetsServer.stop()
}
