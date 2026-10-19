// Updates every workspace package's dependencies with `bun update` and reports
// what moved, plus the upgrades `bun update` cannot take (a newer version
// outside the package's declared range). Run from the repo root:
//   bun run update:deps
// `bun update` only moves inside the declared range, so the second list is the
// part that needs a manifest edit (and a decision).
import { Glob } from 'bun'

const ROOT = `${import.meta.dir}/..`
const LOCKFILE = `${ROOT}/bun.lock`

function packageDirs(): string[] {
  const manifests = [
    ...new Glob('packages/*/package.json').scanSync({ cwd: ROOT, onlyFiles: true }),
    ...new Glob('examples/*/package.json').scanSync({ cwd: ROOT, onlyFiles: true }),
  ]
  return [ROOT, ...manifests.map((file) => `${ROOT}/${file.slice(0, file.lastIndexOf('/'))}`)]
}

// name -> resolved version, read from the lockfile's package entries.
async function installedVersions(): Promise<Map<string, string>> {
  const text = await Bun.file(LOCKFILE).text()
  const versions = new Map<string, string>()
  for (const match of text.matchAll(/"([^"]+)": \["([^"@]+)@([^"]+)"/g)) versions.set(match[1], match[3])
  return versions
}

function satisfies(range: string, version: string): boolean {
  const cleaned = range.replace(/^[\^~>=<\s]*/, '').trim()
  if (!cleaned || cleaned.includes('*')) return true
  const [maj, min, pat] = cleaned.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const [lmaj, lmin, lpat] = version.split('.').map((part) => Number.parseInt(part, 10) || 0)
  if (range.startsWith('^')) return lmaj === maj && (lmin > min || (lmin === min && lpat >= pat))
  if (range.startsWith('~')) return lmaj === maj && lmin === min && lpat >= pat
  if (range.startsWith('>='))
    return lmaj > maj || (lmaj === maj && lmin > min) || (lmaj === maj && lmin === min && lpat >= pat)
  return lmaj === maj && lmin === min && lpat === pat
}

const latest = new Map<string, string>()
async function registryLatest(name: string): Promise<string> {
  const cached = latest.get(name)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`)
    if (!res.ok) throw new Error(String(res.status))
    const json = (await res.json()) as { 'dist-tags': Record<string, string> }
    const tag = json['dist-tags'].latest ?? ''
    latest.set(name, tag)
    return tag
  } catch {
    latest.set(name, '')
    return ''
  }
}

const before = await installedVersions()
for (const dir of packageDirs()) {
  const name = dir === ROOT ? 'root' : dir.slice(ROOT.length + 1)
  console.log(`\n=== bun update ${name} ===`)
  const proc = Bun.spawn(['bun', 'update'], { cwd: dir, stdout: 'inherit', stderr: 'inherit' })
  const code = await proc.exited
  if (code !== 0) {
    console.error(`bun update failed in ${name} (exit ${code})`)
    process.exit(code)
  }
}

const after = await installedVersions()
const moved: string[] = []
for (const [name, version] of after) {
  const previous = before.get(name)
  if (previous && previous !== version) moved.push(`${name} ${previous} -> ${version}`)
}
console.log(`\n=== moved ===\n${moved.length ? moved.join('\n') : 'nothing moved'}`)

const behind: string[] = []
for (const dir of packageDirs()) {
  const manifest = (await Bun.file(`${dir}/package.json`).json()) as {
    name?: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const label = manifest.name ?? (dir === ROOT ? 'root' : dir.slice(ROOT.length + 1))
  for (const group of ['dependencies', 'devDependencies'] as const) {
    for (const [name, range] of Object.entries(manifest[group] ?? {})) {
      if (range.startsWith('workspace:') || range.startsWith('file:')) continue
      const tag = await registryLatest(name)
      if (!tag || /-(alpha|beta|rc|next|canary|dev|pre|experimental)/i.test(tag)) continue
      if (satisfies(range, tag)) continue
      behind.push(`${name.padEnd(30)} ${range.padEnd(12)} -> ${tag}  (${label})`)
    }
  }
}
console.log(
  `\n=== newer version outside the declared range (needs a manifest edit) ===\n${
    behind.length ? behind.join('\n') : 'none'
  }`,
)
