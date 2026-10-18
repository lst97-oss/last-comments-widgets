# Changesets

Every consumer-visible change needs a changeset:

```bash
bun run changeset     # pick the bump type, write a summary
bun run version       # apply: bump the published package, write its CHANGELOG, bun install, versions:check
git add -A && git commit -m "chore: release"
bun run release       # versions:check + check + test + build + pack:check + changeset publish (needs `npm login` first)
```

Only one package is published — `@lst97-oss/last-comments-widgets`, the single tarball
carrying the React, Vue, Angular and plain-HTML widgets and the framework-free client
they are built on. `config.json` therefore has an empty `fixed` group: there is no set
of published packages left to keep in lockstep. The six directories under `packages/`
(`client`, `theme`, `react`, `vue`, `angular`, `vanilla`) are private workspace sources;
they are never versioned and never published.

Name `@lst97-oss/last-comments-widgets` in a changeset for any consumer-visible change
so the summary lands in the published CHANGELOG. Framework compatibility is expressed in
`peerDependencies`, not in the package version — an Angular-only change narrows the
Angular peer range and gets its own changelog entry.

See https://github.com/changesets/changesets for the full workflow.
