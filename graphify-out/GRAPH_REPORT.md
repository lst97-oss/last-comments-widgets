# Graph Report - last-comments-widgets  (2026-10-23)

## Corpus Check
- 170 files · ~88,471 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 19 file(s) not represented in the graph (top: (none) 11, .css 6, .lock 1)

## Summary
- 1867 nodes · 3513 edges · 116 communities (98 shown, 18 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 67 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Angular Comments Widget
- Project Docs and Conventions
- React Example Dependencies
- Vanilla Package Manifest
- Angular CLI Configuration
- Client Public API Types
- Vue Comment Item State
- Vanilla Mount and Theme
- Build and Release Scripts
- Client Package Manifest
- React Comment Item Rendering
- Theme Package Manifest
- React Comments Container
- Vue Example Dependencies
- Package Manifest Optional Fields
- Vue Comments Component
- Angular Button and Comment List
- Biome Lint Configuration
- React Package Manifest
- Vue Comment Form and Item
- React Viewer and Pager
- Angular Package Manifest
- Last-Comments Package Manifest
- React Turnstile Loader
- React Theme Variables
- Vue Package Manifest
- Angular Example TypeScript Config
- Vue Skeleton Loading
- Root Tooling Config
- Angular Error and Skeletons
- Angular Thread Guides
- Angular Example Dependencies
- Angular Form and Turnstile Directive
- Client Thread and Vote Logic
- Angular TypeScript Config
- Vue Demo App
- Root Build and Check Scripts
- Vue Comment List and Moderation
- Vanilla Rendering Helpers
- Vue Actions Menu
- React Comment Form and Code Blocks
- Angular Demo App
- Angular Comment Viewer
- Vue Thread Guides
- Angular Peer Dependencies
- Vanilla Action and Vote Rendering
- React Demo Fixture
- Last-Comments Export Map
- React UI Primitives
- Vue Moderation Actions
- Root TypeScript Config
- Root Dev Dependencies
- Angular Vote Overlay Tests
- Vanilla Thread Paging
- Angular Package Dev Dependencies
- Client Edit Window Rules
- Theme Fixture Tests
- Vue Button Styles
- Vue Avatar and Participants
- Vue Turnstile Loader
- Vue Turnstile Component
- Vue Vote Overlay Tests
- Vue TypeScript Config
- Changeset Configuration
- Angular Turnstile Directive
- Angular Example Forms Dependencies
- Angular Comment Item and Submit
- React Dev Dependencies
- React Code Block Highlighting
- Vue Dev Dependencies
- Angular Package Scripts
- React Package Scripts
- Vanilla Thread Guides
- Vue Package Scripts
- Angular Comment Form
- React Client Dependencies
- React In-View Observer
- React TypeScript Config
- Vue Thread Window Loader
- Vue Theme Resolution
- Pack Check Script
- Angular Example App Config
- React Thread Guides
- React Actions Popover
- Vue Turnstile Tests
- Angular Example Build Tools
- Angular ng-package Config
- Client TypeScript Config
- Vanilla TypeScript Config
- Vue Client Dependencies
- Theme Browser Check Script
- Angular Lucide Dependency
- Angular Repository Metadata
- Last-Comments Angular Export
- Last-Comments Repository Metadata
- React Repository Metadata
- Vue Repository Metadata
- Angular Peer Dependency Range
- Last-Comments Vue Export
- React Style Exports
- React Peer Dependencies
- Vue Style Exports
- Vue Error Component
- Angular Bug Tracker Metadata
- Angular Style Exports
- Angular Publish Config
- Last-Comments Bug Metadata
- Last-Comments Markdown Dependency
- Last-Comments Publish Config
- Last-Comments Build Script
- React Bug Metadata
- React Publish Config
- Vue Bug Metadata
- Vue Peer Dependencies
- Vue Publish Config

## God Nodes (most connected - your core abstractions)
1. `mountComments()` - 76 edges
2. `describeError()` - 55 edges
3. `Comments()` - 48 edges
4. `cn()` - 46 edges
5. `LcCommentsComponent` - 29 edges
6. `createClient()` - 26 edges
7. `ErrorInfo` - 26 edges
8. `CommentItem()` - 25 edges
9. `Comment` - 24 edges
10. `renderList()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `Window` --references--> `WidgetTheme`  [EXTRACTED]
  scripts/fixtures/theme.ts → packages/client/src/index.ts
- `React demo index.html (lc-theme root, main.tsx entry)` --conceptually_related_to--> `React widget (packages/react)`  [INFERRED]
  examples/react/index.html → AGENTS.md
- `Vue demo index.html (lc-theme root, main.ts entry)` --conceptually_related_to--> `Vue widget (packages/vue)`  [INFERRED]
  examples/vue/index.html → AGENTS.md
- `Angular demo index.html (app-root host page)` --conceptually_related_to--> `Angular widget (packages/angular)`  [INFERRED]
  examples/angular/src/index.html → AGENTS.md
- `0.3.0 release notes (optional peers, port parity, ES2025 target, Turnstile in-package)` --references--> `TypeScript ES2025 authoring and emit conventions`  [INFERRED]
  packages/last-comments-widgets/CHANGELOG.md → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Four-way framework parity across widgets** — agents_framework_parity, agents_react_widget, agents_vue_widget, agents_angular_widget, agents_vanilla_widget [EXTRACTED 1.00]
- **Thread-window paging flow** — agents_paging_invariant, readme_thread_pagination, readme_client_api, packages_client_readme_loadthreadwindow, agents_client_package [INFERRED 0.85]
- **Changeset-gated release pipeline** — agents_changeset_requirement, changeset_readme_workflow, changeset_release_0_4_2_placeholder_changeset, github_workflows_ci_changeset_gate, agents_release_local_publish, readme_release_process [INFERRED 0.85]

## Communities (116 total, 18 thin omitted)

### Community 0 - "Angular Comments Widget"
Cohesion: 0.06
Nodes (66): LcCommentsComponent, ApiError, beginOAuthSignIn(), describeError(), forgetEditKey(), getEditKey(), LastCommentsClient, signOutViewerSession() (+58 more)

### Community 1 - "Project Docs and Conventions"
Cohesion: 0.05
Nodes (50): Angular widget (packages/angular), assemble-package script (builds the published package), Changeset required for consumer-visible changes, packages/client framework-free core, React widget (packages/react), Session probe and sign-in flow (get-session, sign-in/social, sign-out), Single published package @lst97-oss/last-comments-widgets, Style build pipeline (isolate-styles, copy-fonts, theme import) (+42 more)

### Community 2 - "React Example Dependencies"
Cohesion: 0.04
Nodes (41): dependencies, @base-ui/react, class-variance-authority, clsx, @lst97-oss/last-comments-widgets, lucide-react, react, react-dom (+33 more)

### Community 3 - "Vanilla Package Manifest"
Cohesion: 0.04
Nodes (44): bugs, url, dependencies, @last-comments-widgets/client, description, devDependencies, @last-comments-widgets/theme, tailwindcss (+36 more)

### Community 4 - "Angular CLI Configuration"
Cohesion: 0.05
Nodes (39): architect, prefix, projectType, root, schematics, sourceRoot, build, serve (+31 more)

### Community 5 - "Client Public API Types"
Cohesion: 0.06
Nodes (38): ApiErrorCode, ClientOptions, CommentsPage, CommentsPageOptions, CommentStatus, compareThreadNodes(), copyFor(), CreateModerationCommentInput (+30 more)

### Community 6 - "Vue Comment Item State"
Cohesion: 0.07
Nodes (36): foldReplySummary(), actionMode, bodyLimit, cancelEdit(), cancelReply(), canEdit, canReplyHere, collapsed (+28 more)

### Community 7 - "Vanilla Mount and Theme"
Cohesion: 0.06
Nodes (36): THEME_CSS_VARIABLES, THEME_VAR_VALUES, ActionMode, autoMount(), BADGE_VARIANTS, CommentNodeOptions, ensureTurnstile(), GuideRow (+28 more)

### Community 8 - "Build and Release Scripts"
Cohesion: 0.05
Nodes (26): clean, entries, leftovers, problems, relativeSpecifier(), segments(), SKIP, SUBPATHS (+18 more)

### Community 9 - "Client Package Manifest"
Cohesion: 0.05
Nodes (37): bugs, url, dependencies, marked, description, devDependencies, tsup, typescript (+29 more)

### Community 10 - "React Comment Item Rendering"
Cohesion: 0.14
Nodes (30): formatRelativeTime(), ActionContent(), CollapsedComment(), CommentAction(), CommentHeader(), CommentHeaderProps, CommentItem(), CommentItemProps (+22 more)

### Community 11 - "Theme Package Manifest"
Cohesion: 0.06
Nodes (35): bugs, url, description, devDependencies, @fontsource-variable/geist, shadcn, tailwindcss, tw-animate-css (+27 more)

### Community 12 - "React Comments Container"
Cohesion: 0.10
Nodes (28): fetchViewerSession(), ModerationAction, moderationCommentToComment(), saveEditKey(), CommentFormInput, applyVoteOverlay(), Comments(), handleSubmit() (+20 more)

### Community 13 - "Vue Example Dependencies"
Cohesion: 0.06
Nodes (32): dependencies, clsx, @lst97-oss/last-comments-widgets, @lucide/vue, reka-ui, tailwind-merge, vue, devDependencies (+24 more)

### Community 14 - "Package Manifest Optional Fields"
Cohesion: 0.06
Nodes (33): optional, optional, optional, optional, optional, optional, optional, optional (+25 more)

### Community 15 - "Vue Comments Component"
Cohesion: 0.06
Nodes (28): BLOCKED_COPY, commentAs, dark, formError, guest, identityLabel, identityOpen, listEl (+20 more)

### Community 16 - "Angular Button and Comment List"
Cohesion: 0.12
Nodes (19): buttonClass(), SIZE, VARIANT, CommentSubmitHandler, LoadParams, RootLoad, Status, ITEM_INITIAL (+11 more)

### Community 17 - "Biome Lint Configuration"
Cohesion: 0.07
Nodes (27): source, assist, actions, enabled, includes, css, parser, files (+19 more)

### Community 18 - "React Package Manifest"
Cohesion: 0.07
Nodes (27): description, files, homepage, @base-ui/react, class-variance-authority, clsx, @last-comments-widgets/client, @last-comments-widgets/theme (+19 more)

### Community 19 - "Vue Comment Form and Item"
Cohesion: 0.09
Nodes (26): renderMarkdown(), applyToSelection(), authorName, body, bodyLimit, bodyTooLong, busy, counterId (+18 more)

### Community 20 - "React Viewer and Pager"
Cohesion: 0.15
Nodes (15): ViewerOptions, CommentError(), CommentErrorProps, CommentsPager, CommentViewer(), CommentViewerProps, threadSignature(), ThreadSortToggle() (+7 more)

### Community 21 - "Angular Package Manifest"
Cohesion: 0.08
Nodes (25): description, files, homepage, @angular/cdk, @angular/common, @angular/compiler, @angular/compiler-cli, @angular/core (+17 more)

### Community 22 - "Last-Comments Package Manifest"
Cohesion: 0.08
Nodes (25): description, files, homepage, @angular/cdk, @angular/common, @angular/core, @angular/platform-browser, @base-ui/react (+17 more)

### Community 23 - "React Turnstile Loader"
Cohesion: 0.11
Nodes (19): createTurnstileLoader(), getApi(), hasScript(), loadTurnstile, resolveTurnstileConfig(), FakeDocument, FakeScript, TurnstileApi (+11 more)

### Community 24 - "React Theme Variables"
Cohesion: 0.16
Nodes (18): ThemeVars, themeVarsToStyle(), WidgetTheme, CommentsTheme(), TurnstileOptions, TurnstileConfig, TurnstileConfigContext, ActionMode (+10 more)

### Community 25 - "Vue Package Manifest"
Cohesion: 0.08
Nodes (24): description, files, homepage, clsx, @last-comments-widgets/client, @last-comments-widgets/theme, @lucide/vue, reka-ui (+16 more)

### Community 26 - "Angular Example TypeScript Config"
Cohesion: 0.09
Nodes (22): angularCompilerOptions, enableI18nLegacyMessageIdFormat, strictInjectionParameters, strictInputAccessModifiers, strictTemplates, compileOnSave, compilerOptions, experimentalDecorators (+14 more)

### Community 27 - "Vue Skeleton Loading"
Cohesion: 0.10
Nodes (12): BODY_WIDTHS, NAME_WIDTHS, props, rows, emit, props, dark, listEl (+4 more)

### Community 28 - "Root Tooling Config"
Cohesion: 0.12
Nodes (19): typescript, license, name, packageManager, private, type, workspaces, angular-eslint (+11 more)

### Community 29 - "Angular Error and Skeletons"
Cohesion: 0.15
Nodes (11): LcCommentErrorComponent, LcCommentSkeletonsComponent, LoadParams, RootLoad, Status, matches, onChange(), prefersDark() (+3 more)

### Community 30 - "Angular Thread Guides"
Cohesion: 0.16
Nodes (11): LcThreadGuidesComponent, EMPTY_GUIDE, Guide, GuideMeasurement, GuideSpan, GUTTER_INSET, measureGuides(), PANEL_SELECTOR (+3 more)

### Community 31 - "Angular Example Dependencies"
Cohesion: 0.10
Nodes (19): @angular/cdk, @angular/common, @angular/compiler, @angular/compiler-cli, @angular/core, @angular/platform-browser, @lst97-oss/last-comments-widgets, @lucide/angular (+11 more)

### Community 32 - "Angular Form and Turnstile Directive"
Cohesion: 0.20
Nodes (15): Window, ActionMode, applyVoteOverlay(), canEditComment(), CommentsOptions, EditGateOptions, resolveTurnstileConfig(), Theme (+7 more)

### Community 33 - "Client Thread and Vote Logic"
Cohesion: 0.12
Nodes (10): buildCommentTree(), createClient(), listComments(), listModeration(), postComment(), setUserBlocked(), fetchViewerThreads(), normalizePageUrl() (+2 more)

### Community 34 - "Angular TypeScript Config"
Cohesion: 0.10
Nodes (19): angularCompilerOptions, standalone, strictTemplates, compilerOptions, declaration, emitDecoratorMetadata, experimentalDecorators, lib (+11 more)

### Community 35 - "Vue Demo App"
Cohesion: 0.11
Nodes (14): actionMode, baseUrl, bodyLimit, lazy, pageUrl, preset, presets, signInUrl (+6 more)

### Community 36 - "Root Build and Check Scripts"
Cohesion: 0.11
Nodes (18): scripts, build, changeset, changeset:status, check, fmt:staged, format, format:check (+10 more)

### Community 37 - "Vue Comment List and Moderation"
Cohesion: 0.23
Nodes (12): canModerate(), VoteValue, TurnstileOptions, ActionMode, canEditComment(), CommentsProps, Commentupdater, CommentViewerProps (+4 more)

### Community 38 - "Vanilla Rendering Helpers"
Cohesion: 0.26
Nodes (18): safeUrl(), actionEntries(), actionsTrigger(), avatarMarkup(), badge(), commentParts(), errorMarkup(), escapeHtml() (+10 more)

### Community 39 - "Vue Actions Menu"
Cohesion: 0.14
Nodes (13): ViewerSession, props, root, showEdit, showModeration, showOwnDelete, activeValue, emit (+5 more)

### Community 40 - "React Comment Form and Code Blocks"
Cohesion: 0.16
Nodes (9): CommentForm(), CommentFormProps, ComposerToolbar(), InsertFn, PrefixFn, Markdown(), MarkdownProps, Input() (+1 more)

### Community 41 - "Angular Demo App"
Cohesion: 0.15
Nodes (3): AppComponent, Fixture, @angular/forms

### Community 42 - "Angular Comment Viewer"
Cohesion: 0.14
Nodes (6): LcCommentViewerComponent, observeInView(), ObserverCtor, Entry, node, resolvePageUrl()

### Community 43 - "Vue Thread Guides"
Cohesion: 0.18
Nodes (14): buildThreadGuidePath(), contentLeft(), contentTop(), EMPTY_GUIDE, Guide, threadSignature(), useGuides(), measure() (+6 more)

### Community 44 - "Angular Peer Dependencies"
Cohesion: 0.12
Nodes (17): peerDependencies, @angular/cdk, @angular/common, @angular/core, @angular/platform-browser, @base-ui/react, class-variance-authority, clsx (+9 more)

### Community 45 - "Vanilla Action and Vote Rendering"
Cohesion: 0.14
Nodes (14): actionsMenuMarkup(), applyVotes(), insertPrefix(), insertWrap(), ITEM_INITIAL, applyTextEdit(), currentTree(), listBody() (+6 more)

### Community 47 - "Last-Comments Export Map"
Cohesion: 0.12
Nodes (16): import, types, exports, ./angular/styles.css, ./client, ./package.json, ./react, ./react/styles.css (+8 more)

### Community 48 - "React UI Primitives"
Cohesion: 0.22
Nodes (13): cn(), AlertAction(), AvatarBadge(), DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuPortal() (+5 more)

### Community 49 - "Vue Moderation Actions"
Cohesion: 0.20
Nodes (14): blockUser(), emit, moderate(), moderationError(), postOne(), {
  rows: comments,
  page,
  hasMore,
  loadingPage,
  status,
  errorInfo,
  limit,
  roots,
  pageRoots,
  nextDisabled,
  loadFirstPage,
  nextPage,
  previousPage,
}, signIn(), submit() (+6 more)

### Community 50 - "Root TypeScript Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch, noUncheckedSideEffectImports (+7 more)

### Community 51 - "Root Dev Dependencies"
Cohesion: 0.13
Nodes (15): devDependencies, angular-eslint, @biomejs/biome, bun-types, @changesets/cli, eslint, eslint-config-prettier, @eslint/js (+7 more)

### Community 52 - "Angular Vote Overlay Tests"
Cohesion: 0.16
Nodes (11): child, root, tree, untouched, Comment, ThreadNode, ThreadWindowFailure, ThreadWindowFailureStatus (+3 more)

### Community 53 - "Vanilla Thread Paging"
Cohesion: 0.27
Nodes (14): listCommentsPage(), loadThreadWindow(), sortCommentRoots(), attributionMarkup(), loadWindow(), renderCommentViewer(), currentTree(), load() (+6 more)

### Community 54 - "Angular Package Dev Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @angular/common, @angular/compiler, @angular/compiler-cli, @angular/core, @angular/platform-browser, @last-comments-widgets/theme, ng-packagr (+5 more)

### Community 55 - "Client Edit Window Rules"
Cohesion: 0.23
Nodes (8): DEFAULT_EDIT_WINDOW_MINUTES, EDIT_WINDOW_CLOSED, isEditWindowOpen(), ModerationComment, resolveEditWindow(), canEditComment(), EditGateOptions, canEditComment()

### Community 56 - "Theme Fixture Tests"
Cohesion: 0.23
Nodes (6): themeVars, first, viewer, branded, options, Window

### Community 57 - "Vue Button Styles"
Cohesion: 0.21
Nodes (7): buttonClass(), ButtonSize, ButtonVariant, SIZES, VARIANTS, cn(), OPTIONS

### Community 58 - "Vue Avatar and Participants"
Cohesion: 0.20
Nodes (9): collectThreadParticipants(), avatarSize, avatarUrl, initials, props, extra, participants, props (+1 more)

### Community 59 - "Vue Turnstile Loader"
Cohesion: 0.25
Nodes (10): createTurnstileLoader(), getApi(), hasScript(), TurnstileGlobals, TurnstileRenderConfig, TurnstileRenderParams, TurnstileWidgetAppearance, TurnstileWidgetSize (+2 more)

### Community 60 - "Vue Turnstile Component"
Cohesion: 0.25
Nodes (9): loadTurnstile, resolveTurnstileConfig(), TurnstileApi, attach(), config, container, detach(), emit (+1 more)

### Community 61 - "Vue Vote Overlay Tests"
Cohesion: 0.20
Nodes (5): child, root, tree, untouched, isolateStyles()

### Community 62 - "Vue TypeScript Config"
Cohesion: 0.18
Nodes (10): compilerOptions, allowImportingTsExtensions, jsx, moduleResolution, noEmit, strict, types, extends (+2 more)

### Community 63 - "Changeset Configuration"
Cohesion: 0.20
Nodes (9): access, baseBranch, changelog, commit, fixed, ignore, linked, $schema (+1 more)

### Community 65 - "Angular Example Forms Dependencies"
Cohesion: 0.20
Nodes (10): dependencies, @angular/cdk, @angular/common, @angular/core, @angular/forms, @angular/platform-browser, @angular/platform-browser-dynamic, @lst97-oss/last-comments-widgets (+2 more)

### Community 66 - "Angular Comment Item and Submit"
Cohesion: 0.33
Nodes (3): CommentSubmit, LcCommentItemComponent, LcCommentListComponent

### Community 67 - "React Dev Dependencies"
Cohesion: 0.20
Nodes (10): devDependencies, @last-comments-widgets/theme, react, react-dom, tailwindcss, @tailwindcss/cli, tsup, @types/react (+2 more)

### Community 68 - "React Code Block Highlighting"
Cohesion: 0.31
Nodes (6): buildCodeBlockChrome(), clearPending(), CODE_THEMES, copyText(), enhanceCodeBlocks(), normalizeCodeLanguage()

### Community 69 - "Vue Dev Dependencies"
Cohesion: 0.20
Nodes (10): devDependencies, @last-comments-widgets/theme, tailwindcss, @tailwindcss/cli, typescript, vite, vite-plugin-dts, @vitejs/plugin-vue (+2 more)

### Community 70 - "Angular Package Scripts"
Cohesion: 0.22
Nodes (9): scripts, build, check, format, format:check, lint, lint:fix, test (+1 more)

### Community 71 - "React Package Scripts"
Cohesion: 0.22
Nodes (9): scripts, build, check, format, format:check, lint, lint:fix, test (+1 more)

### Community 72 - "Vanilla Thread Guides"
Cohesion: 0.31
Nodes (8): contentLeft(), contentTop(), guidePath(), pickActive(), renderGuides(), draw(), measure(), pick()

### Community 73 - "Vue Package Scripts"
Cohesion: 0.22
Nodes (9): scripts, build, check, format, format:check, lint, lint:fix, test (+1 more)

### Community 75 - "React Client Dependencies"
Cohesion: 0.25
Nodes (8): dependencies, @base-ui/react, class-variance-authority, clsx, @last-comments-widgets/client, lucide-react, shiki, tailwind-merge

### Community 76 - "React In-View Observer"
Cohesion: 0.32
Nodes (5): observeInView(), ObserverCtor, Entry, node, useInView()

### Community 77 - "React TypeScript Config"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, paths, types, extends, include, ../../tsconfig.json

### Community 78 - "Vue Thread Window Loader"
Cohesion: 0.32
Nodes (7): refresh(), { started }, { started }, useThreadWindow(), load(), loadFirstPage(), nextPage()

### Community 79 - "Vue Theme Resolution"
Cohesion: 0.46
Nodes (6): matches, onMediaChange(), resolveDark(), subscribeMedia(), unsubscribeMedia(), useTheme()

### Community 80 - "Pack Check Script"
Cohesion: 0.25
Nodes (7): Manifest, OPTIONAL_PEER_LIBRARIES, PackResult, problems, PUBLISHED, REQUIRED_DEPENDENCIES, targets()

### Community 81 - "Angular Example App Config"
Cohesion: 0.29
Nodes (6): compilerOptions, types, exclude, extends, include, ./tsconfig.json

### Community 82 - "React Thread Guides"
Cohesion: 0.38
Nodes (6): ThreadGuideItem, contentLeft(), contentTop(), EMPTY_GUIDE, Guide, ThreadGuides()

### Community 83 - "React Actions Popover"
Cohesion: 0.48
Nodes (6): CommentActionsMenu(), Popover(), PopoverClose(), PopoverContent(), PopoverPortal(), PopoverTrigger()

### Community 85 - "Angular Example Build Tools"
Cohesion: 0.33
Nodes (6): devDependencies, @angular/build, @angular/cli, @angular/compiler, @angular/compiler-cli, typescript

### Community 86 - "Angular ng-package Config"
Cohesion: 0.33
Nodes (5): allowedNonPeerDependencies, dest, lib, entryFile, $schema

### Community 87 - "Client TypeScript Config"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.json

### Community 88 - "Vanilla TypeScript Config"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.json

### Community 89 - "Vue Client Dependencies"
Cohesion: 0.33
Nodes (6): dependencies, clsx, @last-comments-widgets/client, @lucide/vue, reka-ui, tailwind-merge

### Community 90 - "Theme Browser Check Script"
Cohesion: 0.33
Nodes (5): playwright-core, comment, frameworks, hydrationHtml, server

### Community 91 - "Angular Lucide Dependency"
Cohesion: 0.50
Nodes (4): dependencies, @angular/cdk, @last-comments-widgets/client, @lucide/angular

### Community 92 - "Angular Repository Metadata"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 93 - "Last-Comments Angular Export"
Cohesion: 0.50
Nodes (4): default, import, types, ./angular

### Community 94 - "Last-Comments Repository Metadata"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 95 - "React Repository Metadata"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 96 - "Vue Repository Metadata"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 97 - "Angular Peer Dependency Range"
Cohesion: 0.67
Nodes (3): peerDependencies, @angular/core, @angular/platform-browser

### Community 98 - "Last-Comments Vue Export"
Cohesion: 0.67
Nodes (3): ./vue, import, types

### Community 99 - "React Style Exports"
Cohesion: 0.67
Nodes (3): exports, ./package.json, ./styles.css

### Community 100 - "React Peer Dependencies"
Cohesion: 0.67
Nodes (3): peerDependencies, react, react-dom

### Community 101 - "Vue Style Exports"
Cohesion: 0.67
Nodes (3): exports, ./package.json, ./styles.css

## Ambiguous Edges - Review These
- `Cloudflare Turnstile verification requirement for posting` → `Turnstile challenge for every commenter, including signed-in authors (0.4.2)`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Published release process (local publish, CI verify claim, first-release claim)` → `CI triggers (push to main branch only, plus pull_request)`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Published release process (local publish, CI verify claim, first-release claim)` → `0.4.2 release notes (card padding, rails inside card, composer lock, Turnstile for every commenter)`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **129 isolated node(s):** `@angular/cdk`, `@angular/common`, `@angular/core`, `@angular/platform-browser`, `@angular/platform-browser-dynamic` (+124 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1020 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `describeError()` connect `Angular Comments Widget` to `Client Public API Types`, `Vanilla Mount and Theme`, `Angular Comment Viewer`, `React Comments Container`, `Vue Comments Component`, `Angular Button and Comment List`, `Vue Moderation Actions`, `Vue Comment Form and Item`, `React Viewer and Pager`, `Vanilla Thread Paging`, `Client Edit Window Rules`, `Vue Skeleton Loading`, `Angular Error and Skeletons`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `mountComments()` (e.g. with `handleSystemThemeChange()` and `onDocumentClick()`) actually correct?**
  _`mountComments()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@angular/cdk`, `@angular/common`, `@angular/core` to the rest of the system?**
  _129 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Angular Comments Widget` be split into smaller, more focused modules?**
  _Cohesion score 0.061872909698996656 - nodes in this community are weakly interconnected._
- **Why does `playwright-core` connect `Theme Browser Check Script` to `Root Tooling Config`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Cloudflare Turnstile verification requirement for posting` and `Turnstile challenge for every commenter, including signed-in authors (0.4.2)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Published release process (local publish, CI verify claim, first-release claim)` and `CI triggers (push to main branch only, plus pull_request)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._