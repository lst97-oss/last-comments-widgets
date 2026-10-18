# @last-comments/angular

Drop-in Angular 22 comment widget for [last-comments](https://github.com/lst97-oss/last-comments), with one self-contained Tailwind v4 + shadcn `base-nova` theme shared by every framework widget.

## Install

```bash
npm install @last-comments/angular
```

## Usage

```ts
import { Component } from '@angular/core'
import { LcCommentsComponent } from '@last-comments/angular'
import '@last-comments/angular/styles.css'

@Component({
  imports: [LcCommentsComponent],
  template: `<lc-comments site="demo" baseUrl="https://comments.example.com" turnstileSiteKey="…" />`,
})
export class AppComponent {}
```

`site` is the site key configured on your last-comments server. Lazy loading, theming, sign-in and the edit window are documented in the [last-comments-widgets README](https://github.com/lst97-oss/last-comments-widgets#readme).

## License

MIT
