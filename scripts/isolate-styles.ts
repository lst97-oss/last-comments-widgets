// @property registrations and keyframe names are global even inside CSS @scope.
export function isolateStyles(css: string): string {
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1])
  const rename = (value: string) => {
    for (const name of names) value = value.replace(new RegExp(`(?<![\\w-])${name}(?![\\w-])`, 'g'), `lc-${name}`)
    return value
  }
  return css
    .replaceAll('--tw-', '--lc-tw-')
    .replace(/@keyframes\s+([\w-]+)/g, (_match, name: string) => `@keyframes lc-${name}`)
    .replace(
      /(animation(?:-name)?\s*:\s*)([^;{}]+);/g,
      (_match, property: string, value: string) => `${property}${rename(value)};`,
    )
}

if (import.meta.main) {
  const path = process.argv[2]
  if (!path) throw new Error('Usage: bun scripts/isolate-styles.ts <compiled-styles.css>')
  await Bun.write(path, isolateStyles(await Bun.file(path).text()))
}
