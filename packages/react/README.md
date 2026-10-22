# @lst97-oss/last-comments-widgets/react

Internal workspace package (source in `packages/react`) — not published on its own. Consumers import it from the published entry point `@lst97-oss/last-comments-widgets/react`.

Drop-in React 19 comment widget for [last-comments](https://github.com/lst97-oss/last-comments), with one self-contained Tailwind v4 + shadcn `base-nova` theme shared by every framework widget.

## Install

```bash
bun add @lst97-oss/last-comments-widgets
```

## Usage

```tsx
import { Comments } from '@lst97-oss/last-comments-widgets/react'
import '@lst97-oss/last-comments-widgets/react/styles.css'

;<Comments site="demo" baseUrl="https://comments.example.com" turnstileSiteKey="…" />
```

`site` is the site key configured on your last-comments server. Lazy loading, theming, sign-in and the edit window are documented in the [last-comments-widgets README](https://github.com/lst97-oss/last-comments-widgets#readme).

## License

MIT
