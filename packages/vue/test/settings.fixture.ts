import { Comments, CommentViewer } from '@last-comments-widgets/vue'
import { createApp, h } from 'vue'

// No `settings` prop: the widget reads the site's policy from the settings endpoint, as a host does.
// `?viewer` mounts the read-only viewer instead, so its gate is checked on the same policy.
const props = { site: 's', baseUrl: 'http://api.test', pageUrl: 'http://localhost/p' }
const viewer = new URLSearchParams(location.search).has('viewer')
createApp({
  render: () => h(viewer ? CommentViewer : Comments, props),
}).mount('#root')
