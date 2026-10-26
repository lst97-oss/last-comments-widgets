// Smaller renditions of comment images, for hosts whose URLs can ask for a width.
// A comment column is about 40rem, so the 1x candidate is 640px and the 2x is 1280px.
// Hosts without a known resize scheme keep the original file: the widget cannot
// shrink a file it cannot ask a server to shrink.
export const RENDITION_WIDTHS = [640, 1280] as const
export const IMAGE_SIZES = '(max-width: 40rem) 100vw, 40rem'

type Resizer = {
  matches(url: URL): boolean
  resize(url: URL, width: number): URL | null
}

const RASTER_FILE = /\.(jpe?g|png|gif|webp)$/i

function withQueryWidth(url: URL, width: number): URL {
  const next = new URL(url.href)
  next.searchParams.set('w', String(width))
  return next
}

const resizers: readonly Resizer[] = [
  {
    // Cloudinary puts transformations straight after /image/upload/.
    matches: (url) =>
      url.hostname === 'res.cloudinary.com' && url.pathname.includes('/image/upload/') && !/\/w_\d+/.test(url.pathname),
    resize(url, width) {
      const next = new URL(url.href)
      next.pathname = next.pathname.replace('/image/upload/', `/image/upload/c_limit,w_${width},f_auto,q_auto/`)
      return next
    },
  },
  {
    // Unsplash and imgix read the width from the query string.
    matches: (url) => url.hostname === 'images.unsplash.com' || url.hostname.endsWith('.imgix.net'),
    resize: (url, width) => withQueryWidth(url, width),
  },
  {
    // Wikimedia Commons serves rasters from /thumb/<hash>/<file>/<width>px-<file>.
    matches: (url) =>
      url.hostname === 'upload.wikimedia.org' &&
      /^\/wikipedia\/[^/]+\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+$/i.test(url.pathname) &&
      RASTER_FILE.test(url.pathname),
    resize(url, width) {
      const parts = url.pathname.split('/')
      const file = parts[parts.length - 1] ?? ''
      const next = new URL(url.href)
      next.pathname = `${parts.slice(0, 3).join('/')}/thumb/${parts.slice(3).join('/')}/${width}px-${file}`
      return next
    },
  },
]

function parseHttpUrl(href: string): URL | null {
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

// The candidates for one image, or null when its host has no resize scheme.
// `src` is the 1x rendition and `srcset` lets the browser pick the 2x on dense screens.
export function imageRenditions(href: string): { src: string; srcset: string } | null {
  const url = parseHttpUrl(href)
  if (!url) return null
  const resizer = resizers.find((candidate) => candidate.matches(url))
  if (!resizer) return null
  const candidates = RENDITION_WIDTHS.map((width) => ({ width, url: resizer.resize(url, width) }))
  if (candidates.some((candidate) => candidate.url === null)) return null
  return {
    src: candidates[0]?.url?.href ?? href,
    srcset: candidates.map((candidate) => `${candidate.url?.href} ${candidate.width}w`).join(', '),
  }
}
