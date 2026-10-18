# @lst97-oss/last-comments-widgets/theme.css

Internal workspace package (source in `packages/theme`) — not published on its own. Its stylesheet ships as the published subpath `@lst97-oss/last-comments-widgets/theme.css`.

Shared Tailwind v4 + shadcn `base-nova` design tokens for the [last-comments](https://github.com/lst97-oss/last-comments) widgets. The framework widget packages compile these tokens into their own `styles.css`, so import this stylesheet directly only when you build a custom UI on the same theme.

## Install

```bash
bun add @lst97-oss/last-comments-widgets
```

## Usage

```css
@import "tailwindcss";
@import "@lst97-oss/last-comments-widgets/theme.css";
```

Theme variables, dark-mode values and widget `themeVars` overrides are documented in the [last-comments-widgets README](https://github.com/lst97-oss/last-comments-widgets#readme).

## License

MIT
