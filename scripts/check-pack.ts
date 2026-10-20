// Pre-publish guard: proves the tarball `changeset publish` would upload contains every
// entry point the manifest advertises, plus the README/LICENSE npm shows on the package
// page. Run after `bun run build`; a missing dist, a missing subpath or a `files` mistake
// fails here instead of shipping a broken package. The six framework packages are private
// workspace sources and are not packed.
const PUBLISHED = ['last-comments-widgets']

// The published package ships one bundle per framework, so a consumer of one
// framework must not install the others' runtime libraries. Only `marked` is
// needed by every consumer (the framework-free client renders Markdown); every
// framework runtime library is an optional peer the host installs alongside.
const REQUIRED_DEPENDENCIES = ['marked']
const OPTIONAL_PEER_LIBRARIES = [
  '@angular/cdk',
  '@base-ui/react',
  '@lucide/angular',
  '@lucide/vue',
  'class-variance-authority',
  'clsx',
  'lucide-react',
  'reka-ui',
  'shiki',
  'tailwind-merge',
]

type Manifest = {
  name: string
  main?: string
  types?: string
  exports?: unknown
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
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

// A framework runtime library listed as a hard dependency is installed by every
// consumer, even the ones that never load that framework's bundle.
for (const dir of PUBLISHED) {
  const manifest = (await Bun.file(`packages/${dir}/package.json`).json()) as Manifest
  const dependencies = Object.keys(manifest.dependencies ?? {})
  for (const name of dependencies) {
    if (!REQUIRED_DEPENDENCIES.includes(name)) {
      problems.push(
        `${manifest.name}: ${name} is a hard dependency; framework runtime libraries must be optional peers`,
      )
    }
  }
  for (const name of REQUIRED_DEPENDENCIES) {
    if (!dependencies.includes(name)) {
      problems.push(`${manifest.name}: ${name} must be a hard dependency — every consumer needs it`)
    }
  }
  for (const name of OPTIONAL_PEER_LIBRARIES) {
    if (!manifest.peerDependencies?.[name]) {
      problems.push(`${manifest.name}: ${name} must be declared as a peer dependency`)
    } else if (manifest.peerDependenciesMeta?.[name]?.optional !== true) {
      problems.push(`${manifest.name}: peer ${name} must be optional`)
    }
  }
}

if (problems.length > 0) {
  console.error('pack check failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(
  `${PUBLISHED.length} tarball${PUBLISHED.length === 1 ? '' : 's'} ready (${Math.round(unpacked / 1024)} KiB unpacked)`,
)
