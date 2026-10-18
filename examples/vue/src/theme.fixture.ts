import { Comments, CommentViewer } from '@lst97-oss/last-comments-widgets/vue'
import { createApp, h, ref } from 'vue'
import { branded, options } from '../../../scripts/fixtures/theme'

const themeVars = ref(branded)
window.updateTheme = (theme) => {
  themeVars.value = theme
}
createApp({
  render: () => [
    h('div', { id: 'a' }, [h(Comments, { ...options, themeVars: themeVars.value })]),
    h('div', { id: 'b' }, [h(Comments, { ...options, theme: 'light', themeVars: { vars: { primary: '#abcdef' } } })]),
    h('div', { id: 'viewer' }, [h(CommentViewer, { ...options, themeVars: themeVars.value })]),
  ],
}).mount('#fixtures')
