# @last-comments/theme

Shared Tailwind v4 + shadcn `base-nova` design tokens for the [last-comments](https://github.com/lst97-oss/last-comments) widgets. The framework widget packages compile these tokens into their own `styles.css`, so install this package directly only when you build a custom UI on the same theme.

## Install

```bash
npm install @last-comments/theme
```

## Usage

```css
@import "tailwindcss";
@import "@last-comments/theme/theme.css";
```

Theme variables, dark-mode values and widget `themeVars` overrides are documented in the [last-comments-widgets README](https://github.com/lst97-oss/last-comments-widgets#readme).

## License

MIT
