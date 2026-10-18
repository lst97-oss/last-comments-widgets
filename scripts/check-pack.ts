// Pre-publish guard: proves the tarballs `changeset publish` would upload contain
// every entry point the manifest advertises, plus the README/LICENSE npm shows on
// the package page. Run after `bun run build`; a missing dist or a `files` mistake
// fails here instead of shipping a broken package.
const PUBLISHED = ['client', 'theme', 'react', 'vue', 'angular', 'vanilla']

type Manifest = {
  name: string
  main?: string
  types?: string
  exports?: unknown
}

type PackResult = {
  unpackedSize: number
  files: { path: string }[]
}

const problems: string[] = []
let unpacked = 0

function targets(value: unknown, out: string[]) {
  if (typeof value === 'string') {
    if (value.startsWith('./')) out.push(value.slice(2))
  } else if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) targets(nested, out)
  }
}

for (const dir of PUBLISHED) {
  const pkgDir = `packages/${dir}`
  const manifest = (await Bun.file(`${pkgDir}/package.json`).json()) as Manifest
  const proc = Bun.spawn(['npm', 'pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: pkgDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0) {
    problems.push(`${manifest.name}: npm pack failed (${stderr.trim() || `exit ${code}`})`)
    continue
  }

  const json = stdout.slice(stdout.indexOf('['))
  if (!json.startsWith('[')) {
    problems.push(`${manifest.name}: npm pack produced unparseable output`)
    continue
  }

  const [packed] = JSON.parse(json) as PackResult[]
  if (!packed) {
    problems.push(`${manifest.name}: npm pack produced no tarball`)
    continue
  }

  const files = new Set(packed.files.map((file) => file.path))
  const expected = ['package.json', 'README.md', 'LICENSE', manifest.main, manifest.types].filter(
    (path): path is string => Boolean(path),
  )
  targets(manifest.exports, expected)
  for (const path of new Set(expected.map((path) => path.replace(/^\.\//, '')))) {
    if (!files.has(path)) problems.push(`${manifest.name}: tarball is missing ${path}`)
  }
  for (const path of files) {
    if (path.startsWith('src/') || /\.test\.[cm]?[jt]sx?$/.test(path)) {
      problems.push(`${manifest.name}: tarball leaks source ${path}`)
    }
  }

  unpacked += packed.unpackedSize
  console.log(`${manifest.name}: ${files.size} files, ${Math.round(packed.unpackedSize / 1024)} KiB unpacked`)
}

if (problems.length > 0) {
  console.error('pack check failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`${PUBLISHED.length} tarballs ready (${Math.round(unpacked / 1024)} KiB unpacked)`)
