import { Glob } from 'bun'

let failed = false

const rootBiome = Bun.spawn(['biome', 'check', '--error-on-warnings', '.'], {
  stdout: 'inherit',
  stderr: 'inherit',
})
if ((await rootBiome.exited) !== 0) failed = true

// The widgets typecheck against @last-comments-widgets/client's built dist, which a fresh checkout
// does not have. Rebuild it every time so a stale dist cannot fake a passing typecheck.
console.log('\n=== build packages/client (shared dist) ===')
const client = Bun.spawn(['bun', 'run', 'build'], { cwd: 'packages/client', stdout: 'inherit', stderr: 'inherit' })
if ((await client.exited) !== 0) failed = true

for (const manifest of [...new Glob('packages/*/package.json').scanSync('.')].sort()) {
  const dir = manifest.slice(0, -'/package.json'.length)
  const pkg = await Bun.file(manifest).json()
  if (!pkg.scripts?.check) continue
  console.log(`\n=== check ${dir} ===`)
  const proc = Bun.spawn(['bun', 'run', 'check'], { cwd: dir, stdout: 'inherit', stderr: 'inherit' })
  if ((await proc.exited) !== 0) failed = true
}
if (failed) process.exit(1)
