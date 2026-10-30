// Browser check of the SVG gate every port runs before it draws a Mermaid diagram, and of the drawing itself. Bun has
// no DOM, so the client's unit tests cover the predicate only; here the built enhance entry parses real markup in
// Chromium. Each input that can carry script must be refused, a diagram shaped like Mermaid's output must be
// accepted, and a real Mermaid source must come back as a drawn diagram.
import { chromium } from 'playwright-core'

const root = new URL('..', import.meta.url).pathname
const mermaidDist = `${root}packages/client/node_modules/mermaid/dist/`
const problems: string[] = []

const built = await Bun.build({
  entrypoints: [`${root}packages/client/src/enhance.ts`],
  target: 'browser',
  format: 'esm',
  external: ['katex', 'mermaid'],
})
if (!built.success) throw new AggregateError(built.logs, 'Could not build the enhance entry')
const output = built.outputs[0]
if (!output) throw new Error('The enhance entry built no output')
const bundle = await output.text()

// The enhance bundle imports `mermaid` by name; the import map points that name at Mermaid's own ESM build.
const PAGE = `<!doctype html><html><head><script type="importmap">{"imports":{"mermaid":"/mermaid/mermaid.esm.min.mjs"}}</script></head><body></body></html>`
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname
    if (path === '/enhance.js') return new Response(bundle, { headers: { 'Content-Type': 'text/javascript' } })
    if (path.startsWith('/mermaid/')) {
      return new Response(Bun.file(`${mermaidDist}${path.slice('/mermaid/'.length)}`), {
        headers: { 'Content-Type': 'text/javascript' },
      })
    }
    return new Response(PAGE, { headers: { 'Content-Type': 'text/html' } })
  },
})

// Each case names what the gate must answer: `true` is a diagram it must draw, `false` is markup it must refuse.
const cases: { name: string; svg: string; draws: boolean }[] = [
  {
    name: 'a diagram shaped like Mermaid output',
    svg: '<svg id="lc-mermaid-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g class="node"><text>A</text></g></svg>',
    draws: true,
  },
  {
    name: 'a foreignObject label',
    svg: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>label</div></foreignObject></svg>',
    draws: true,
  },
  { name: 'an event handler after a slash (no space)', svg: '<svg><g/onmouseover=alert(1)></g></svg>', draws: false },
  { name: 'a script tag with a slash', svg: '<svg><script/x>alert(1)</script></svg>', draws: false },
  { name: 'a script element', svg: '<svg><script>alert(1)</script></svg>', draws: false },
  { name: 'an onload on the root', svg: '<svg onload="alert(1)"></svg>', draws: false },
  {
    name: 'an entity-encoded javascript: link',
    svg: '<svg><a href="&#106;avascript:alert(1)"><text>x</text></a></svg>',
    draws: false,
  },
  {
    name: 'a plain javascript: link',
    svg: '<svg><a href="JavaScript:alert(1)"><text>x</text></a></svg>',
    draws: false,
  },
  { name: 'not an svg at all', svg: '<div>hi</div>', draws: false },
]

// CI passes the Chrome for Testing binary its setup step installed; locally the installed Chrome is used.
const launch = Bun.env.CHROME_PATH
  ? { executablePath: Bun.env.CHROME_PATH }
  : { channel: Bun.env.THEME_BROWSER_CHANNEL ?? 'chrome' }
const browser = await chromium.launch({ ...launch, headless: true })
try {
  const page = await browser.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(server.url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 })

  const answers = await page.evaluate(
    async (inputs: { name: string; svg: string }[]) => {
      const { parseSafeSvg } = await import('/enhance.js')
      return inputs.map((input) => ({ name: input.name, drawn: parseSafeSvg(input.svg) !== null }))
    },
    cases.map(({ name, svg }) => ({ name, svg })),
  )
  for (const [index, answer] of answers.entries()) {
    const expected = cases[index]
    if (!expected) continue
    if (answer.drawn !== expected.draws) {
      problems.push(
        `${answer.name}: ${answer.drawn ? 'drawn' : 'refused'}, expected ${expected.draws ? 'drawn' : 'refused'}`,
      )
    }
  }

  // A real Mermaid source, through the shared upgrade: the fence becomes a figure holding Mermaid's own svg.
  const diagram = await page.evaluate(async () => {
    const { enhanceMermaid } = await import('/enhance.js')
    document.body.innerHTML = '<pre><code class="language-mermaid">graph TD; A--&gt;B</code></pre>'
    enhanceMermaid(document.body)
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      if (document.querySelector('.lc-mermaid > svg')) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const figure = document.querySelector('.lc-mermaid > svg')
    const labels = figure?.textContent ?? ''
    return {
      drawn: figure !== null,
      // Mermaid draws flowchart labels as HTML inside the svg, so the labels are the svg's text.
      labelsShown: labels.includes('A') && labels.includes('B'),
      // A fence still pending outside a figure would mean the upgrade never finished.
      stillPending: [...document.querySelectorAll('[data-mermaid="pending"]')].some(
        (node) => !node.closest('.lc-mermaid'),
      ),
    }
  })
  if (!diagram.drawn) problems.push('a Mermaid source was not drawn into a figure')
  if (diagram.drawn && !diagram.labelsShown) problems.push('the drawn diagram does not show its node labels A and B')
  if (diagram.stillPending) problems.push('a Mermaid fence was left pending outside its figure')
  if (pageErrors.length > 0) problems.push(`${pageErrors.length} page error(s): ${pageErrors[0]}`)

  console.log(JSON.stringify({ answers, diagram }, null, 1))
  if (problems.length > 0) {
    console.error(`\n${problems.length} SVG expectation(s) failed:\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log(`\nAll ${cases.length} SVG inputs are answered as the gate requires, and a Mermaid diagram is drawn.`)
  }
} finally {
  await browser.close()
  server.stop()
}
