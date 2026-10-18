// Assembles the single published package (@lst97-oss/last-comments-widgets) from the
// workspace packages' builds: each dist is copied under dist/<subpath>, the internal
// @last-comments-widgets/client specifiers are rewritten to relative paths (consumers install only
// this package, never the internals), and the four stylesheets share one fonts dir.
// Run by `bun run build` last, after every other package has built.
import { Glob } from 'bun'

const ROOT = `${import.meta.dir}/..`
const OUT = `${ROOT}/packages/last-comments-widgets/dist`
const CLIENT_SPECIFIER = '@last-comments-widgets/client'
const CLIENT_TARGET = `${OUT}/client/index.js`
const SUBPATHS = ['client', 'react', 'vue', 'angular', 'vanilla']

function segments(path: string) {
  return path.split('/').filter(Boolean)
}

// Bun ships no path module, so relative specifiers are computed by hand.
function relativeSpecifier(fromFile: string, toFile: string) {
  const from = segments(fromFile.slice(0, fromFile.lastIndexOf('/')))
  const to = segments(toFile)
  let shared = 0
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += 1
  return [...Array<string>(from.length - shared).fill('..'), ...to.slice(shared)].join('/')
}

// ng-packagr's own package.json and LICENSE/README are duplicates of files we ship at the
// tarball root, and its sourcemap is stale once the client import is rewritten.
const SKIP = ['package.json', 'LICENSE', 'README.md']

async function copyDir(from: string, to: string) {
  for (const rel of new Glob('**/*').scanSync({ cwd: from, onlyFiles: true })) {
    const basename = rel.slice(rel.lastIndexOf('/') + 1)
    if (SKIP.includes(basename) || basename.endsWith('.map')) continue
    await Bun.write(`${to}/${rel}`, Bun.file(`${from}/${rel}`))
  }
}

const clean = Bun.spawn(['rm', '-rf', OUT], { stdout: 'ignore', stderr: 'inherit' })
if ((await clean.exited) !== 0) throw new Error(`could not clear ${OUT}`)

let rewritten = 0
for (const name of SUBPATHS) {
  await copyDir(`${ROOT}/packages/${name}/dist`, `${OUT}/${name}`)
}

for (const file of new Glob('**/*.{js,mjs,d.ts}').scanSync({ cwd: OUT, onlyFiles: true })) {
  const path = `${OUT}/${file}`
  const source = await Bun.file(path).text()
  if (!source.includes(CLIENT_SPECIFIER)) continue
  const specifier = relativeSpecifier(path, CLIENT_TARGET)
  const rewrittenSource = source
    .replaceAll(`'${CLIENT_SPECIFIER}'`, `'${specifier}'`)
    .replaceAll(`"${CLIENT_SPECIFIER}"`, `"${specifier}"`)
  await Bun.write(path, rewrittenSource)
  rewritten += 1
}

await Bun.write(`${OUT}/theme.css`, Bun.file(`${ROOT}/packages/theme/theme.css`))
// The Geist subsets are identical in every widget dist; ship one copy and point the
// compiled `url(./files/…)` references at it.
await copyDir(`${ROOT}/packages/react/dist/files`, `${OUT}/files`)

let retargeted = 0
for (const name of ['react', 'vue', 'angular', 'vanilla']) {
  const path = `${OUT}/${name}/styles.css`
  const source = await Bun.file(path).text()
  if (!source.includes('url(./files/')) continue
  await Bun.write(path, source.replaceAll('url(./files/', 'url(../files/'))
  retargeted += 1
}

const problems: string[] = []
const entries = [
  'client/index.js',
  'react/index.js',
  'react/styles.css',
  'vue/index.js',
  'vue/styles.css',
  'angular/fesm2022/last-comments-widgets-angular.mjs',
  'angular/styles.css',
  'vanilla/index.js',
  'vanilla/styles.css',
  'theme.css',
]
for (const entry of entries) {
  if (!(await Bun.file(`${OUT}/${entry}`).exists())) problems.push(`missing dist/${entry}`)
}
const leftovers: string[] = []
for (const file of new Glob('**/*').scanSync({ cwd: OUT, onlyFiles: true })) {
  if ((await Bun.file(`${OUT}/${file}`).text()).includes(CLIENT_SPECIFIER)) leftovers.push(file)
}
if (leftovers.length > 0) {
  problems.push(`${CLIENT_SPECIFIER} still imported by ${leftovers.join(', ')}`)
}
const fonts = [...new Glob('*.woff2').scanSync({ cwd: `${OUT}/files` })].length
if (fonts === 0) problems.push('no fonts copied')
if (problems.length > 0) {
  console.error('assemble failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(
  `assembled ${OUT}: ${SUBPATHS.length} entry points, ${rewritten} files rewired to the local client, ` +
    `${retargeted} stylesheets sharing ${fonts} fonts`,
)
