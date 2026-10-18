// Publish guard: exactly one package leaves this repo. The framework packages are private
// workspace sources, so they reference each other with the workspace protocol (nothing is
// versioned between unpublished packages) and the published manifest must not depend on
// them at all — a consumer installs one package and nothing else.
import { Glob } from 'bun'

const PUBLISHED_NAME = '@lst97-oss/last-comments-widgets'

type Manifest = {
  name: string
  private?: boolean
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const packages = await Promise.all(
  [...new Glob('packages/*/package.json').scanSync('.')].sort().map(async (path) => ({
    path,
    manifest: (await Bun.file(path).json()) as Manifest,
  })),
)

const problems: string[] = []
const published = packages.filter(({ manifest }) => !manifest.private)

if (published.length !== 1) {
  problems.push(
    `expected exactly one published package, found ${published.length} (${published.map((p) => p.manifest.name).join(', ')})`,
  )
} else if (published[0].manifest.name !== PUBLISHED_NAME) {
  problems.push(`expected ${PUBLISHED_NAME} to be the published package, found ${published[0].manifest.name}`)
}

for (const { manifest } of packages) {
  if (!manifest.private) continue
  for (const [dep, range] of Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
  })) {
    if (dep.startsWith('@last-comments-widgets/') && range !== 'workspace:*') {
      problems.push(`${manifest.name} depends on ${dep}@${range}, expected workspace:* — it is never published`)
    }
  }
}

for (const { manifest } of published) {
  for (const [dep, range] of Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies })) {
    if (dep.startsWith('@last-comments-widgets/')) {
      problems.push(`${manifest.name} depends on ${dep}@${range}, but ${dep} is not published`)
    }
  }
}

if (problems.length > 0) {
  console.error('publish check failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error(`Bump with \`bun run version\` (changesets); never edit the version by hand.`)
  process.exit(1)
}

console.log(
  `${packages.length} packages in the workspace, ${PUBLISHED_NAME}@${published[0].manifest.version} is the only one published`,
)
