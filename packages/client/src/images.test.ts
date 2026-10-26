import { describe, expect, test } from 'bun:test'
import { imageRenditions } from './images'
import { renderMarkdown } from './index'

describe('imageRenditions', () => {
  test('asks Cloudinary for a limited, auto-format rendition at each width', () => {
    const result = imageRenditions('https://res.cloudinary.com/demo/image/upload/v1/cat.jpg')
    expect(result?.src).toBe('https://res.cloudinary.com/demo/image/upload/c_limit,w_640,f_auto,q_auto/v1/cat.jpg')
    expect(result?.srcset).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_limit,w_640,f_auto,q_auto/v1/cat.jpg 640w, https://res.cloudinary.com/demo/image/upload/c_limit,w_1280,f_auto,q_auto/v1/cat.jpg 1280w',
    )
  })

  test('leaves a Cloudinary URL that already names a width alone', () => {
    expect(imageRenditions('https://res.cloudinary.com/demo/image/upload/w_300/cat.jpg')).toBeNull()
  })

  test('sets the width query on Unsplash and imgix', () => {
    expect(imageRenditions('https://images.unsplash.com/photo-1?auto=format&q=80')?.src).toBe(
      'https://images.unsplash.com/photo-1?auto=format&q=80&w=640',
    )
    expect(imageRenditions('https://cdn.example.imgix.net/a.jpg')?.srcset).toContain('w=1280 1280w')
  })

  test('maps a Wikimedia Commons raster to its pre-rendered thumbnail', () => {
    expect(imageRenditions('https://upload.wikimedia.org/wikipedia/commons/a/ab/Cat.jpg')?.src).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cat.jpg/640px-Cat.jpg',
    )
  })

  test('has no rendition for hosts without a resize scheme, or for non-http links', () => {
    expect(imageRenditions('https://photos.example.com/cat.jpg')).toBeNull()
    expect(imageRenditions('javascript:alert(1)')).toBeNull()
    expect(imageRenditions('not a url')).toBeNull()
  })
})

describe('renderMarkdown images', () => {
  test('a plain host keeps its original file, loaded lazily and without a srcset', () => {
    const html = renderMarkdown('![cat](https://photos.example.com/cat.jpg)')
    expect(html).toContain('<img src="https://photos.example.com/cat.jpg"')
    expect(html).toContain('loading="lazy"')
    expect(html).not.toContain('srcset=')
  })

  test('a resizable host gets the rendition set with the original as its fallback', () => {
    const html = renderMarkdown('![cat](https://images.unsplash.com/photo-1)')
    expect(html).toContain('srcset="')
    expect(html).toContain('data-lc-original="https://images.unsplash.com/photo-1"')
    expect(html).toContain('sizes="(max-width: 40rem) 100vw, 40rem"')
  })

  test('a link that is not http(s) renders a labelled placeholder, never an image', () => {
    const html = renderMarkdown('![cat](javascript:alert(1))')
    expect(html).toContain('<span class="lc-image-unavailable">Image unavailable: cat</span>')
    expect(html).not.toContain('<img')
  })

  test('a relative image path is refused rather than resolved against the page', () => {
    const html = renderMarkdown('![cat](cat.png)')
    expect(html).toContain('lc-image-unavailable')
    expect(html).not.toContain('<img')
  })

  test('escapes the alt text, so a quote in it cannot break out of the attribute', () => {
    const html = renderMarkdown('![x" onerror="alert(1)](https://photos.example.com/a.jpg)')
    expect(html).not.toContain('onerror="alert(1)"')
  })
})
