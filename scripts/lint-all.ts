import { Glob } from 'bun'

let failed = false
const fix = Bun.argv.includes('--fix')

const rootBiome = Bun.spawn(['biome', 'check', '--error-on-warnings', ...(fix ? ['--write'] : []), '.'], {
  stdout: 'inherit',
  stderr: 'inherit',
})
if ((await rootBiome.exited) !== 0) failed = true

for (const manifest of [...new Glob('packages/*/package.json').scanSync('.')].sort()) {
  const dir = manifest.slice(0, -'/package.json'.length)
  const pkg = await Bun.file(manifest).json()
  if (!pkg.scripts?.lint) continue
  console.log(`\n=== lint ${dir} ===`)
  const proc = Bun.spawn(['bun', 'run', fix ? 'lint:fix' : 'lint'], { cwd: dir, stdout: 'inherit', stderr: 'inherit' })
  if ((await proc.exited) !== 0) failed = true
}
if (failed) process.exit(1)
