// Lockstep guard: the `fixed` changesets group keeps every published package on one
// version, and the widgets' internal ranges must point at that exact version, so a
// widget can never be installed with a @last-comments/client it cannot work with.
const PUBLISHED = ['client', 'theme', 'react', 'vue', 'angular', 'vanilla']

type Manifest = {
  name: string
  version: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const packages = await Promise.all(
  PUBLISHED.map(async (dir) => ({
    dir,
    manifest: (await Bun.file(`packages/${dir}/package.json`).json()) as Manifest,
  })),
)

const versions = packages.map(({ manifest }) => manifest.version)
const expected = `^${versions[0]}`
const problems: string[] = []
if (versions.some((version) => version !== versions[0])) {
  problems.push(
    `packages disagree on a version: ${packages.map(({ manifest }) => `${manifest.name}@${manifest.version}`).join(', ')}`,
  )
}

for (const { manifest } of packages) {
  for (const [dep, range] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (dep.startsWith('@last-comments/') && range !== expected) {
      problems.push(`${manifest.name} depends on ${dep}@${range}, expected ${expected}`)
    }
  }
}

if (problems.length > 0) {
  console.error('lockstep check failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('Bump versions with `bun run version` (changesets); never edit one manifest by hand.')
  process.exit(1)
}

console.log(`${packages.length} packages at ${versions[0]} with internal ranges at ${expected}`)
