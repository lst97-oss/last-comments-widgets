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
        // CommentItem dangerouslySetInnerHTML receives ONLY shared
        // renderMarkdown() output (client strips raw HTML at token level,
        // allowlists http(s)/mailto links; pinned in client tests).
        // Never pass raw bodyMarkdown here.
        files: ['src/CommentItem.tsx', 'CommentItem.tsx'],
        rules: ['react-doctor/dangerous-html-sink'],
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
