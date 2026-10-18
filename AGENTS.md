# Repository Guidelines

Comment widgets for the [last-comments](https://github.com/lst97-oss/last-comments) API — the same widget implemented four times (React, Vue, Angular, plain HTML) on one shared API client and one shared Tailwind v4 + shadcn `base-nova` theme. Framework parity is the product: a user-visible change that lands in one framework and not the others is a bug, not a follow-up.

## Project Overview

- **Runtime contract**: the widget talks to a `last-comments` server (`site` key + `baseUrl`). The sibling repo lives at `../last-comments`; its routes (`src/routes/api.comments.ts`, `api.moderation.ts`, `api.auth.$.ts`) and zod schemas are the **source of truth**. These packages ship **no validation schema** — the server is the trust boundary, and every error code the widgets render comes from it.
- **No build step for consumers**: each widget ships ESM + its own compiled `dist/styles.css`. Hosts import the component and the stylesheet; nothing else is required.
- **Bun-first**: the repo is a Bun workspace (`bun@1.4.3` pinned in `.bun-version` + `packageManager`). Use `bun`, never npm/yarn/pnpm, and never add another lockfile.

## Key Directories

| Path | Role |
| --- | --- |
| `packages/client` | framework-free core: fetch wrapper, `ApiError` + `describeError` copy, `renderMarkdown`, thread helpers (`listCommentsPage`, `loadThreadWindow`, `buildCommentTree`), auth helpers, theme-var mapping. **Everything else imports this from `dist`.** |
| `packages/theme` | `theme.css` only — Tailwind v4 tokens and the `@scope`d widget styles every package imports at build time (a devDependency of the widgets) |
| `packages/react` `vue` `angular` `vanilla` | the four widget implementations: list + read-only viewer + composer + pager + skeletons + error block |
| `examples/react` `vue` `html` | runnable demos (`bun run dev`), pointed at `packages/*/dist` |
| `examples/angular` | app source only — **no `angular.json`/`index.html`**, so it cannot be served |
| `scripts/*.ts` | Bun-run repo tooling: `check-all`, `lint-all`, `build-all`, `check-versions` (lockstep guard), `check-theme` (browser theme regression), `isolate-styles`, `copy-fonts` |
| `.changeset/` | lockstep release config + pending changesets (see Release) |
| `biome.json`, `eslint.config.js`, `tsconfig.json` | tooling config — one root **Biome** and **ESLint** config (no nested ones); each package has its own `tsconfig.json` scoped to `include: ["src"]` (Angular's does not extend the root, it uses Angular's compiler options) |

## Development Commands

```bash
bun install                 # workspace install
bun run check               # every package: typecheck + lint + format check (+ React Doctor)
bun run typecheck           # bun --check; Vue uses vue-tsc
bun run lint | lint:fix     # Biome at the root, then each package's own linter
bun run format | format:check
bun test                    # bun:test across the workspace
bun run test:theme          # build + headless-Chrome theme/isolation regressions (needs Chrome)
bun run build               # each package's build (tsup / vite / ng-packagr), Tailwind CSS, isolate-styles, fonts
bun run versions:check      # all six packages share one version with matching internal ranges
cd packages/react && bun test          # single package
```

## Architecture & Data Flow

1. Widget → `@last-comments/client` → `{site, baseUrl}` → JSON envelope `{ data }` / `{ error: { code, message } }` → `ApiError` → `describeError` → error block. **Never hardcode user-facing error copy in a widget**; add it to `ERROR_COPY` in the client.
2. Session: `GET /api/auth/get-session` (tolerant: null when unreachable), sign-in `POST /api/auth/sign-in/social`, sign-out `POST /api/auth/sign-out`. Hosts may pass `viewerUserId` as the fallback identity.
3. Identity invariant: the guest/anonymous composer posts with `credentials: 'omit'`; while the session probe is in flight the composer is disabled (skeleton chip) so a comment can never post with a guessed identity.
4. Paging invariant: the list endpoint returns a **flat stream with no total**, ordered `createdAt asc`, and `buildCommentTree` promotes orphan replies to roots. Therefore a page is a **window over roots**, filled by `loadThreadWindow` (`pages: N`, `existing`) — never replace the list with a raw page (split threads render replies as phantom top-level comments) and never render the whole prefix (that is "load more", not pagination).
5. Styling: `packages/*/src/styles.css` starts with `@import "@last-comments/theme/theme.css"`. Builds run `isolate-styles.ts` (renames `@keyframes`/`--tw-*` so `@scope` cannot leak) then `copy-fonts.ts` (Geist woff2, referenced by the compiled CSS).
6. Same-origin only: the API sends no `Access-Control-Allow-Credentials`; `/api/moderation` is additionally origin-checked. Demos proxy `/api/*` and rewrite `Origin` (see `examples/react/vite.config.ts`).

## Code Conventions

- **Bun-native** — no `node:` imports in our code (verified zero). Use `Bun.file`/`Bun.write`/`Bun.Glob`/`Bun.spawn`/`Bun.argv`/`Bun.env`/`Bun.resolveSync`/`bun:test`. `process.exit` is fine (`Bun.exit` does not exist) and `process.env.NODE_ENV` appears only as a `Bun.build` `define` key.
- **Four-way parity**: touch React, Vue, Angular and vanilla in the same change, and `packages/theme` when styles move. Match the surrounding markup/classing style; all four must render the same DOM contract (`data-lc-error`, `data-error-code`, `nav[aria-label="Comments pagination"]`, `.lc-*` hooks).
- TypeScript: `strict`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`. No one-line wrapper functions, no inline `as` casts to reach members (declare a named type), no `ReturnType<typeof …>` (name the type). Small static string-keyed tables are `Record`, not `Map`/`Set` (reserve `Set` for dynamic membership).
- Never hand-edit a package version — `bun run versions:check` enforces one version + matching `^` internal ranges across all six packages. Angular DI imports must stay value imports (`inject(ElementRef)`); a formatter may try to make them `type` only and break injection.
- Generated/ignored: `packages/*/dist`, `node_modules`, `.tmp/`. Never commit `dist`; `bun.lock` and `.bun-version` are committed and authoritative.

## Testing & QA

- Existing suites are `bun:test` files (`packages/client/src/index.test.ts`, `packages/vanilla/src/index.test.ts`, `packages/react/src/editGate.test.ts`, `packages/{vue,angular}/src/types.test.ts`, `scripts/isolate-styles.test.ts`). There is no DOM/component harness: UI behaviour is proven in a real browser, not by mounting components in tests.
- Required before claiming done: `bun run check` in the touched package **and** a real run (`bun test`), plus a headless-Chromium probe for anything visual or interactive (identity switch, pager, skeletons, error surfaces, 360px layout). Delete throwaway probes and stop the servers you started.
- Theme or token changes: `bun run test:theme`.
- **Angular is compile-level only** (see `examples/angular` above): `bun run check` + `bunx ngc -p tsconfig.json --noEmit` + `bun run build`, and say the browser proof is missing rather than implying one.
- **Client `dist` trap**: the widgets resolve `@last-comments/client` from its built `dist`. After editing `packages/client/src`, run `bun run build` there before typechecking, testing or probing the widgets — otherwise you get misleading `TS2305: has no exported member` / undefined-export failures. The root `bun run check` rebuilds the client itself; a per-package `bun run check` does not.
- Stub the API with a plain `Bun.serve` that logs requests; assert on the wire (`GET /api/comments?…&offset=…`) as well as the DOM.

## Release

Six published packages are one `fixed` [changesets](https://github.com/changesets/changesets) group: `client`, `theme`, `react`, `vue`, `angular`, `vanilla`. Framework compatibility lives in `peerDependencies`, never in the version.

1. Add a changeset for any package-visible change (`bun run changeset`), naming **all six** so every CHANGELOG carries the summary. CI fails pull requests that change a package without one (`.github/workflows/ci.yml`).
2. `bun run version` bumps all six, rewrites internal ranges, writes changelogs and re-runs `versions:check`.
3. Publishing is **local only**: `npm login`, then `bun run release` (`versions:check → check → test → build → changeset publish`, then `git push --follow-tags`). CI never publishes and holds no npm token.
