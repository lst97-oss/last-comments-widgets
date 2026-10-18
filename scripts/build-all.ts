import { Glob } from 'bun'

const pkgs = [...new Glob('packages/*/package.json').scanSync('.')].sort()
let failed = false
for (const manifest of pkgs) {
  const dir = manifest.slice(0, -'/package.json'.length)
  const pkg = await Bun.file(manifest).json()
  if (!pkg.scripts?.build) continue
  console.log(`\n=== build ${dir} ===`)
  const proc = Bun.spawn(['bun', 'run', 'build'], { cwd: dir, stdout: 'inherit', stderr: 'inherit' })
  const code = await proc.exited
  if (code !== 0) failed = true
}
if (failed) process.exit(1)
