import { mountComments, renderCommentViewer } from '../src/index'

// No `settings` prop: the widget reads the site's policy from the settings endpoint, as a host does.
// `?viewer` mounts the read-only viewer instead, so its gate is checked on the same policy.
const options = { site: 's', baseUrl: 'http://api.test', pageUrl: 'http://localhost/p' }
const root = document.getElementById('root')!
if (new URLSearchParams(location.search).has('viewer')) renderCommentViewer(root, options)
else mountComments(root, options)
