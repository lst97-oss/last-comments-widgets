# Changesets

Every user-visible change to a package needs a changeset:

```bash
bun run changeset     # pick the packages and the bump type, write a summary
bun run version       # apply: bump versions, rewrite internal ranges, write CHANGELOGs
git add -A && git commit -m "chore: release"
bun run release       # versions:check + build + changeset publish (needs `npm login` first)
```

All six published packages (`client`, `theme`, `react`, `vue`, `angular`, `vanilla`)
are a `fixed` group in `config.json`: one release, one version number for the whole
set, so consumers never mix a widget with a `@last-comments/client` it cannot work
with. Framework compatibility is expressed in each package's `peerDependencies`, not
in the package version — an Angular-only change narrows the Angular peer range and
gets its own changelog entry, it does not decouple the versions.

Because of the group, name **all six packages** in a changeset even when only one of
them changed: the summary then lands in every package's CHANGELOG (a package named
only indirectly just gets "Updated dependencies"), and a single `minor` in the set is
enough to move the whole group.

See https://github.com/changesets/changesets for the full workflow.
