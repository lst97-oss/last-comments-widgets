# @lst97-oss/last-comments-widgets/vanilla

Internal workspace package (source in `packages/vanilla`) — not published on its own. Consumers import it from the published entry point `@lst97-oss/last-comments-widgets/vanilla`.

Drop-in comment widget for plain HTML — no build step — for [last-comments](https://github.com/lst97-oss/last-comments), with one self-contained Tailwind v4 + shadcn `base-nova` theme shared by every framework widget.

## Install

```bash
bun add @lst97-oss/last-comments-widgets
```

## Usage

```html
<link rel="stylesheet" href="https://unpkg.com/@lst97-oss/last-comments-widgets/dist/vanilla/styles.css" />
<div data-lc-comments data-lc-site="demo" data-lc-base-url="https://comments.example.com"></div>
<script type="importmap">
  {
    "imports": {
      "marked": "https://unpkg.com/marked/lib/marked.esm.js"
    }
  }
</script>
<script type="module" src="https://unpkg.com/@lst97-oss/last-comments-widgets/dist/vanilla/index.js"></script>
```

`data-lc-site` is the site key configured on your last-comments server. Lazy loading, theming and sign-in are documented in the [last-comments-widgets README](https://github.com/lst97-oss/last-comments-widgets#readme).

Every programmatic option also has an attribute, mapped to the same prop:

| Attribute | Prop | Default |
| --- | --- | --- |
| `data-lc-anon-edit-window-minutes` | `anonEditWindowMinutes` | `10` |
| `data-lc-action-mode` | `actionMode` (`icon` \| `icon-text` \| `text`) | `icon-text` |
| `data-lc-body-limit` | `bodyLimit` | `10000` |

Signed-in authors may edit their own comments any time; a guest may edit only from the browser that stored the key returned when they posted, inside the anonymous window above.

## License

MIT
