# Repository Guidelines

Comment widgets for the [last-comments](https://github.com/lst97-oss/last-comments) API — the same widget implemented four times (React, Vue, Angular, plain HTML) on one shared API client and one shared Tailwind v4 + shadcn `base-nova` theme. Framework parity is the product: a user-visible change that lands in one framework and not the others is a bug, not a follow-up.

## Project Overview

- **Runtime contract**: the widget talks to a `last-comments` server (`site` key + `baseUrl`). The sibling repo lives at `../last-comments`; its routes (`src/routes/api.comments.ts`, `api.moderation.ts`, `api.auth.$.ts`) and zod schemas are the **source of truth**. These packages ship **no validation schema** — the server is the trust boundary, and every error code the widgets render comes from it.
- **One published package**: consumers install `@lst97-oss/last-comments-widgets` and import a subpath (`/react`, `/vue`, `/angular`, `/vanilla`, or `/client` for hosts rendering their own UI). The six directories under `packages/` are private workspace sources; `packages/last-comments-widgets` is the only manifest that is not `private` and the only one that ever lands on npm.
- **No build step for consumers**: each subpath ships built ESM plus its own compiled stylesheet (`/theme.css`, `/react/styles.css`, …), so hosts import the component and the stylesheet and nothing else is required.
- **Bun-first**: the repo is a Bun workspace (`bun@1.4.3` pinned in `.bun-version` + `packageManager`). Use `bun`, never npm/yarn/pnpm, and never add another lockfile.

## Key Directories

| Path | Role |
| --- | --- |
| `packages/client` | framework-free core: fetch wrapper, `ApiError` + `describeError` copy, `renderMarkdown`, thread helpers (`listCommentsPage`, `loadThreadWindow`, `buildCommentTree`), auth helpers, theme-var mapping. **Everything else imports this from `dist`.** |
| `packages/theme` | `theme.css` only — Tailwind v4 tokens and the `@scope`d widget styles every package imports at build time (a devDependency of the widgets) |
| `packages/react` `vue` `angular` `vanilla` | the four widget implementations: list + read-only viewer + composer + pager + skeletons + error block |
| `packages/last-comments-widgets` | the **one published package** (`@lst97-oss/last-comments-widgets`): `assemble-package.ts` runs last in `bun run build`, copies every workspace `dist` under `dist/<subpath>` and rewrites the internal client specifiers to relative ones. Its `exports` map is the consumer contract: `.` and `./client` → the framework-free client, `./react` `./vue` `./angular` `./vanilla` → the four widgets, `./theme.css` and `./<framework>/styles.css` → the stylesheets |
| `examples/react` `vue` | runnable demos (`bun run dev`) that depend on the published package through the workspace (`"@lst97-oss/last-comments-widgets": "workspace:*"`) and import it by subpath |
| `examples/html` | static page loading the hosted bundle and stylesheet (`dist/vanilla/…` on unpkg) — the CDN path, no build step |
| `examples/angular` | app source only — **no `angular.json`/`index.html`**, so it cannot be served; it consumes the published package by subpath like the other demos |
| `scripts/*.ts` | Bun-run repo tooling: `check-all`, `lint-all`, `build-all`, `assemble-package` (assembles the published package), `check-versions` (one-published-package guard), `check-pack` (tarball guard), `check-theme` (browser theme regression), `isolate-styles`, `copy-fonts` |
| `.changeset/` | release config + pending changesets (see Release) |
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
bun run build               # each workspace package's build (tsup / vite / ng-packagr), Tailwind CSS, isolate-styles, fonts, then assemble-package
bun run versions:check      # exactly one published package, internals linked with workspace:*
cd packages/react && bun test          # single package
```

## Architecture & Data Flow

1. Widget → `@lst97-oss/last-comments-widgets/client` → `{site, baseUrl}` → JSON envelope `{ data }` / `{ error: { code, message } }` → `ApiError` → `describeError` → error block. **Never hardcode user-facing error copy in a widget**; add it to `ERROR_COPY` in the client.
2. Session: `GET /api/auth/get-session` (tolerant: null when unreachable), sign-in `POST /api/auth/sign-in/social`, sign-out `POST /api/auth/sign-out`. Hosts may pass `viewerUserId` as the fallback identity.
3. Identity invariant: the guest/anonymous composer posts with `credentials: 'omit'`; while the session probe is in flight the composer is disabled (skeleton chip) so a comment can never post with a guessed identity.
4. Paging invariant: the list endpoint returns a **flat stream with no total**, ordered `createdAt asc`, and `buildCommentTree` promotes orphan replies to roots. Therefore a page is a **window over roots**, filled by `loadThreadWindow` (`pages: N`, `existing`) — never replace the list with a raw page (split threads render replies as phantom top-level comments) and never render the whole prefix (that is "load more", not pagination).
5. Styling: `packages/*/src/styles.css` starts with an `@import` of the workspace `theme` package's `theme.css` (the internal workspace alias, rewritten to a relative path when the published package is assembled). Builds run `isolate-styles.ts` (renames `@keyframes`/`--tw-*` so `@scope` cannot leak) then `copy-fonts.ts` (Geist woff2, referenced by the compiled CSS).
6. Same-origin only: the API sends no `Access-Control-Allow-Credentials`; `/api/moderation` is additionally origin-checked. Demos proxy `/api/*` and rewrite `Origin` (see `examples/react/vite.config.ts`).

## Code Conventions

- **Bun-native** — no `node:` imports in our code (verified zero). Use `Bun.file`/`Bun.write`/`Bun.Glob`/`Bun.spawn`/`Bun.argv`/`Bun.env`/`Bun.resolveSync`/`bun:test`. `process.exit` is fine (`Bun.exit` does not exist) and `process.env.NODE_ENV` appears only as a `Bun.build` `define` key.
- **Four-way parity**: touch React, Vue, Angular and vanilla in the same change, and `packages/theme` when styles move. Match the surrounding markup/classing style; all four must render the same DOM contract (`data-lc-error`, `data-error-code`, `nav[aria-label="Comments pagination"]`, `.lc-*` hooks).
- TypeScript: `strict`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`. No one-line wrapper functions, no inline `as` casts to reach members (declare a named type), no `ReturnType<typeof …>` (name the type). Small static string-keyed tables are `Record`, not `Map`/`Set` (reserve `Set` for dynamic membership).
- Never hand-edit the published version — `bun run versions:check` (run by `version` and `release`) fails unless exactly one package is published, every internal `@last-comments-widgets/*` dependency is `workspace:*`, and the published manifest depends on none of them. Angular DI imports must stay value imports (`inject(ElementRef)`); a formatter may try to make them `type` only and break injection.
- Generated/ignored: `packages/*/dist`, `node_modules`, `.tmp/`. Never commit `dist`; `bun.lock` and `.bun-version` are committed and authoritative.

## Testing & QA

- Existing suites are `bun:test` files (`packages/client/src/index.test.ts`, `packages/vanilla/src/index.test.ts`, `packages/react/src/editGate.test.ts`, `packages/react/src/lib/turnstile.test.ts`, `packages/{vue,angular}/src/types.test.ts`, `scripts/isolate-styles.test.ts`). There is no DOM/component harness: UI behaviour is proven in a real browser, not by mounting components in tests.
- Required before claiming done: `bun run check` in the touched package **and** a real run (`bun test`), plus a headless-Chromium probe for anything visual or interactive (identity switch, pager, skeletons, error surfaces, 360px layout). Delete throwaway probes and stop the servers you started.
- Theme or token changes: `bun run test:theme`.
- **Angular is compile-level only** (see `examples/angular` above): `bun run check` + `bunx ngc -p tsconfig.json --noEmit` + `bun run build`, and say the browser proof is missing rather than implying one.
- **Client `dist` trap**: the widgets resolve the client from its built `dist` (the assembled package rewrites those specifiers to relative paths, but the workspace sources still import the client package). After editing `packages/client/src`, run `bun run build` there before typechecking, testing or probing the widgets — otherwise you get misleading `TS2305: has no exported member` / undefined-export failures. The root `bun run check` rebuilds the client itself; a per-package `bun run check` does not.
- Stub the API with a plain `Bun.serve` that logs requests; assert on the wire (`GET /api/comments?…&offset=…`) as well as the DOM.

## Release

One package leaves this repo: `@lst97-oss/last-comments-widgets`, assembled by `bun run build` from the private workspace packages under `packages/`. Every framework subpath ships inside it at one version, so a consumer can never mix a widget with a client it cannot work with. Framework compatibility lives in `peerDependencies`, never in the version.

1. Add a changeset for any consumer-visible change (`bun run changeset`) and name `@lst97-oss/last-comments-widgets` so the published CHANGELOG carries the summary. CI fails pull requests that change the published package without one (`.github/workflows/ci.yml`).
2. `bun run version` bumps that one package, writes its CHANGELOG and re-runs `versions:check`. The workspace packages are private and are never versioned or published.
3. Publishing is **local only**: `npm login`, then `bun run release` (`versions:check → check → test → build → pack:check → changeset publish`, then `git push --follow-tags`). CI never publishes and holds no npm token. `pack:check` inspects the exact tarball npm would upload.
