// Copies the Geist woff2 subsets into a widget's dist. The compiled
// dist/styles.css keeps `url(./files/…)` from @fontsource-variable/geist,
// which Tailwind does not emit, so consumers would 404 those fonts.
// Only the fonts the stylesheet actually references are copied: the family
// ships an italic cut per subset that nothing in the widget asks for.
// Usage (from a package dir): bun ../../scripts/copy-fonts.ts .
// Bun ships no path module, so this uses resolved paths directly instead of node:path.
import { Glob } from 'bun'

const pkgDir = Bun.argv[2] ?? '.'
const stylesheet = await Bun.file(`${pkgDir}/dist/styles.css`).text()
const referenced = new Set([...stylesheet.matchAll(/url\(\.\/files\/([^)"']+)\)/g)].map((match) => match[1]))
if (referenced.size === 0) throw new Error(`no font references found in ${pkgDir}/dist/styles.css`)

const fontEntry = Bun.resolveSync(
  '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
  `${import.meta.dir}/../packages/theme`,
)
const cut = Math.max(fontEntry.lastIndexOf('/'), fontEntry.lastIndexOf('\\'))
const fontSourceDir = fontEntry.slice(0, cut)
const available = new Set([...new Glob('*.woff2').scanSync(fontSourceDir)])
const missing = [...referenced].filter((font) => !available.has(font))
if (missing.length > 0) throw new Error(`missing font files: ${missing.join(', ')}`)

const distFiles = `${pkgDir}/dist/files`
for (const font of referenced) {
  await Bun.write(`${distFiles}/${font}`, Bun.file(`${fontSourceDir}/${font}`))
}
console.log(`copied ${referenced.size} fonts to ${distFiles}`)
