# @last-comments/vue

Drop-in Vue 3 comment widget for [last-comments](https://github.com/lst97-oss/last-comments), with one self-contained Tailwind v4 + shadcn `base-nova` theme shared by every framework widget.

## Install

```bash
npm install @last-comments/vue
```

## Usage

```vue
<script setup lang="ts">
import { Comments } from '@last-comments/vue'
import '@last-comments/vue/styles.css'
</script>

<template>
  <Comments site="demo" base-url="https://comments.example.com" turnstile-site-key="…" />
</template>
```

`site` is the site key configured on your last-comments server. Lazy loading, theming, sign-in and the edit window are documented in the [last-comments-widgets README](https://github.com/lst97-oss/last-comments-widgets#readme).

## License

MIT
