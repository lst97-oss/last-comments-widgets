# @lst97-oss/last-comments-widgets/angular

Internal workspace package (source in `packages/angular`) — not published on its own. Consumers import it from the published entry point `@lst97-oss/last-comments-widgets/angular`.

Drop-in Angular 22 comment widget for [last-comments](https://github.com/lst97-oss/last-comments), with one self-contained Tailwind v4 + shadcn `base-nova` theme shared by every framework widget.

## Install

```bash
bun add @lst97-oss/last-comments-widgets
```

## Usage

```ts
import { Component } from '@angular/core'
import { LcCommentsComponent } from '@lst97-oss/last-comments-widgets/angular'
import '@lst97-oss/last-comments-widgets/angular/styles.css'

@Component({
  imports: [LcCommentsComponent],
  template: `<lc-comments site="demo" baseUrl="https://comments.example.com" turnstileSiteKey="…" />`,
})
export class AppComponent {}
```

`site` is the site key configured on your last-comments server. Lazy loading, theming, sign-in and the edit window are documented in the [last-comments-widgets README](https://github.com/lst97-oss/last-comments-widgets#readme).

## License

MIT
