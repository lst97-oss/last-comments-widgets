// Copies the Geist woff2 subsets into a widget's dist. The compiled
// dist/styles.css keeps `url(./files/…)` from @fontsource-variable/geist,
// which Tailwind does not emit, so consumers would 404 five fonts.
// Usage (from a package dir): bun ../../scripts/copy-fonts.ts .
// Bun ships no path module, so this uses resolved paths directly instead of node:path.
import { Glob } from 'bun'

const pkgDir = Bun.argv[2] ?? '.'
const fontEntry = Bun.resolveSync(
  '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
  `${import.meta.dir}/../packages/theme`,
)
const cut = Math.max(fontEntry.lastIndexOf('/'), fontEntry.lastIndexOf('\\'))
const fontSourceDir = fontEntry.slice(0, cut)
const fonts = [...new Glob('*.woff2').scanSync(fontSourceDir)]
if (fonts.length === 0) throw new Error(`no woff2 files found in ${fontSourceDir}`)
const distFiles = `${pkgDir}/dist/files`
for (const font of fonts) {
  await Bun.write(`${distFiles}/${font}`, Bun.file(`${fontSourceDir}/${font}`))
}
console.log(`copied ${fonts.length} fonts to ${distFiles}`)
