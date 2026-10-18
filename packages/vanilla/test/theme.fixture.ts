import { mountComments, renderCommentViewer } from '../src/index'
import { branded, options } from '../../../scripts/fixtures/theme'

document.getElementById('fixtures')!.innerHTML = '<div id="a"></div><div id="b"></div><div id="viewer"></div>'
let first = mountComments(document.getElementById('a')!, options)
mountComments(document.getElementById('b')!, {
  ...options,
  theme: 'light',
  themeVars: { vars: { primary: '#abcdef' } },
})
let viewer = renderCommentViewer(document.getElementById('viewer')!, options)
window.updateTheme = (themeVars) => {
  first.destroy()
  viewer.destroy()
  first = mountComments(document.getElementById('a')!, { ...options, themeVars })
  viewer = renderCommentViewer(document.getElementById('viewer')!, { ...options, themeVars })
}
