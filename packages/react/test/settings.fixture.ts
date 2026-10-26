import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { CommentViewer, Comments } from '@last-comments-widgets/react'

// No `settings` prop: the widget reads the site's policy from the settings endpoint, as a host does.
// `?viewer` mounts the read-only viewer instead, so its gate is checked on the same policy.
const props = { site: 's', baseUrl: 'http://api.test', pageUrl: 'http://localhost/p' }
const viewer = new URLSearchParams(location.search).has('viewer')
createRoot(document.getElementById('root')!).render(createElement(viewer ? CommentViewer : Comments, props))
