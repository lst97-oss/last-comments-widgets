// Updates every workspace package's dependencies with `bun update` and reports
// what moved, plus the upgrades `bun update` cannot take (a newer version
// outside the package's declared range). Run from the repo root:
//   bun run update:deps
// `bun update` only moves inside the declared range, so the second list is the
// part that needs a manifest edit (and a decision).
import { Glob } from 'bun'

const ROOT = `${import.meta.dir}/..`
const LOCKFILE = `${ROOT}/bun.lock`

// name -> resolved version, from the lock file's package entries. Scoped names (@scope/name) are included.
export function lockVersions(text: string): Map<string, string> {
  const versions = new Map<string, string>()
  for (const match of text.matchAll(/"[^"]+": \["((?:@[^"/]+\/)?[^"@/]+)@([^"]+)"/g)) {
    versions.set(match[1], match[2])
  }
  return versions
}

const parts = (version: string): [number, number, number] => {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map((part) => Number.parseInt(part, 10) || 0)
  return [major, minor, patch]
}

// Whether `version` is inside a manifest range. Covers the forms the manifests use: ^, ~, >= and exact.
export function satisfies(range: string, version: string): boolean {
  const cleaned = range.replace(/^[\^~>=<\s]*/, '').trim()
  if (!cleaned || cleaned.includes('*')) return true
  const [maj, min, pat] = parts(cleaned)
  const [lmaj, lmin, lpat] = parts(version)
  if (range.startsWith('^')) {
    // ^1.2.3 keeps the major; ^0.2.3 keeps the minor; ^0.0.3 keeps only 0.0.3.
    if (maj > 0) return lmaj === maj && (lmin > min || (lmin === min && lpat >= pat))
    if (min > 0) return lmaj === 0 && lmin === min && lpat >= pat
    return lmaj === 0 && lmin === 0 && lpat === pat
  }
  if (range.startsWith('~')) return lmaj === maj && lmin === min && lpat >= pat
  if (range.startsWith('>='))
    return lmaj > maj || (lmaj === maj && lmin > min) || (lmaj === maj && lmin === min && lpat >= pat)
  return lmaj === maj && lmin === min && lpat === pat
}

function packageDirs(): string[] {
  const manifests = [
    ...new Glob('packages/*/package.json').scanSync({ cwd: ROOT, onlyFiles: true }),
    ...new Glob('examples/*/package.json').scanSync({ cwd: ROOT, onlyFiles: true }),
  ]
  return [ROOT, ...manifests.map((file) => `${ROOT}/${file.slice(0, file.lastIndexOf('/'))}`)]
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

async function main() {
  const before = lockVersions(await Bun.file(LOCKFILE).text())
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

  const after = lockVersions(await Bun.file(LOCKFILE).text())
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
}

if (import.meta.main) await main()
