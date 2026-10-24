// react-doctor suppressions for @last-comments-widgets/react.
// Cloned ui/** files are verbatim shadcn/Base-UI output — see reference
// last-comments/doctor.config.ts for the same override.
export default {
  lint: true,
  deadCode: true,
  verbose: false,
  blocking: 'error',
  respectInlineDisables: true,
  adoptExistingLintConfig: true,
  share: false,
  ignore: {
    files: ['dist/**'],
    overrides: [
      {
        files: ['src/ui/**', 'ui/**'],
        rules: [
          'react-doctor/only-export-components',
          'react-doctor/prefer-tag-over-role',
          'react-hooks-js/todo',
          'react-doctor/shadcn-icon-button-requires-label',
        ],
      },
      {
        // Markdown's dangerouslySetInnerHTML receives ONLY shared
        // renderMarkdown() output (client strips raw HTML at token level,
        // allowlists http(s)/mailto links; pinned in client tests). The local
        // Shiki enhancer only replaces fenced <pre> nodes after paint.
        files: ['src/Markdown.tsx', 'Markdown.tsx'],
        rules: ['react-doctor/dangerous-html-sink'],
      },
      {
        // Fenced blocks are highlighted sequentially: each codeToHtml call may
        // load a language grammar, and a comment with several fences should not
        // fire every grammar request at once. Math and diagram upgrades await a
        // lazy import and then render each placeholder in order for the same
        // reason.
        files: ['src/lib/codeBlock.ts', 'lib/codeBlock.ts', 'src/lib/math.ts', 'src/lib/mermaid.ts'],
        rules: ['react-doctor/async-await-in-loop'],
      },
      {
        // Composer/item branch on orthogonal product states (reply ×
        // preview × turnstile × error; edit × owner × window × readOnly).
        // Splitting further would scatter one form across files.
        files: ['src/CommentForm.tsx', 'src/CommentItem.tsx'],
        rules: ['react-doctor/no-high-complexity-react-function'],
      },
      {
        // Root widget owns the session of states that cannot be split
        // without prop-drilling them (public vs moderation load × vote ×
        // reply/edit/delete × lock × moderation actions).
        files: ['src/Comments.tsx'],
        rules: ['react-doctor/no-high-complexity-react-function', 'react-doctor/no-giant-component'],
      },
    ],
  },
}
