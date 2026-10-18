# @last-comments/react

Drop-in React 19 comment widget for [last-comments](https://github.com/lst97-oss/last-comments), with one self-contained Tailwind v4 + shadcn `base-nova` theme shared by every framework widget.

## Install

```bash
npm install @last-comments/react
```

## Usage

```tsx
import { Comments } from '@last-comments/react'
import '@last-comments/react/styles.css'

<Comments site="demo" baseUrl="https://comments.example.com" turnstileSiteKey="…" />
```

`site` is the site key configured on your last-comments server. Lazy loading, theming, sign-in and the edit window are documented in the [last-comments-widgets README](https://github.com/lst97-oss/last-comments-widgets#readme).

## License

MIT
