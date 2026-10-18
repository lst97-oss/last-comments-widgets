# @last-comments/vanilla

Drop-in comment widget for plain HTML — no build step — for [last-comments](https://github.com/lst97-oss/last-comments), with one self-contained Tailwind v4 + shadcn `base-nova` theme shared by every framework widget.

## Install

```bash
npm install @last-comments/vanilla
```

## Usage

```html
<link rel="stylesheet" href="https://unpkg.com/@last-comments/vanilla/dist/styles.css" />
<div data-lc-comments data-lc-site="demo" data-lc-base-url="https://comments.example.com"></div>
<script type="importmap">
  {
    "imports": {
      "@last-comments/client": "https://unpkg.com/@last-comments/client/dist/index.js",
      "marked": "https://unpkg.com/marked/lib/marked.esm.js"
    }
  }
</script>
<script type="module" src="https://unpkg.com/@last-comments/vanilla/dist/index.js"></script>
```

`data-lc-site` is the site key configured on your last-comments server. Lazy loading, theming, sign-in and the edit window are documented in the [last-comments-widgets README](https://github.com/lst97-oss/last-comments-widgets#readme).

## License

MIT
