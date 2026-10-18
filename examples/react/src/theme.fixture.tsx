import { CommentItem, Comments, CommentsTheme, CommentViewer } from '@last-comments/react'
import { useState } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { branded, options, sampleComment } from '../../../scripts/fixtures/theme'

function Fixture() {
  const [themeVars, setThemeVars] = useState(branded)
  window.updateTheme = setThemeVars
  return (
    <>
      <div id="a">
        <Comments {...options} themeVars={themeVars} />
      </div>
      <div id="b">
        <Comments {...options} theme="light" themeVars={{ vars: { primary: '#abcdef' } }} />
      </div>
      <CommentsTheme id="standalone" themeVars={themeVars}>
        <CommentItem
          node={{ comment: sampleComment, children: [] }}
          depth={0}
          pendingVotes={{}}
          replyTo={null}
          viewerUserId="u1"
          onVote={() => {}}
          onClear={() => {}}
          onReply={() => {}}
          onEdit={async () => null}
          onDelete={() => {}}
        />
      </CommentsTheme>
      <div id="viewer">
        <CommentViewer {...options} themeVars={themeVars} />
      </div>
    </>
  )
}
createRoot(document.getElementById('fixtures')!).render(<Fixture />)

hydrateRoot(
  document.getElementById('hydration')!,
  <CommentsTheme id="hydration-theme" themeVars={{ dark: { primary: '#ffee00' } }}>
    Hydration
  </CommentsTheme>,
)
