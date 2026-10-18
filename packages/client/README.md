# @last-comments/client

Framework-agnostic TypeScript client for [last-comments](https://github.com/lst97-oss/last-comments): typed comments, votes, moderation, viewer sessions, markdown rendering and thread pagination. The React, Vue, Angular and plain-HTML widgets are built on it.

## Install

```bash
npm install @last-comments/client
```

## Usage

```ts
import { createClient, loadThreadWindow } from '@last-comments/client'

const client = createClient({ site: 'demo', baseUrl: 'https://comments.example.com' })
const { comments, hasMore } = await loadThreadWindow({
  site: 'demo',
  baseUrl: 'https://comments.example.com',
  pageUrl: location.href,
  limit: 20,
  pages: 1,
})
```

The package is ESM-only and ships its own types. Full API surface, server setup and widget documentation live in the [last-comments-widgets README](https://github.com/lst97-oss/last-comments-widgets#readme).

## License

MIT
