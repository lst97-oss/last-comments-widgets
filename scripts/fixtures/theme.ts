import type { Comment, WidgetTheme } from '../../packages/client/src/index'

export const branded: WidgetTheme = {
  vars: {
    primary: '#123456',
    primaryForeground: '#ffffff',
    background: '#eef4ff',
    foreground: '#112233',
    card: '#fff8ee',
    cardForeground: '#223344',
    popover: '#fedcba',
    popoverForeground: '#112233',
    accent: '#cafe00',
    accentForeground: '#110022',
    fontFamily: 'Georgia, serif',
    fontSize: '20px',
    spacing: '6px',
    controlHeight: '44px',
    controlRadius: '7px',
    radius: '12px',
    cardPadding: '18px',
    composerPadding: '22px',
    cardShadow: 'rgb(1 2 3) 0px 2px 8px',
    dropdownShadow: 'none',
    dialogShadow: 'none',
    backdrop: 'rgb(0 0 0 / 0.5)',
  },
  dark: { popover: '#332211', destructive: '#ff99aa' },
}
export const sampleComment: Comment = {
  id: 'standalone',
  pageId: 'page',
  parentId: null,
  userId: 'u1',
  authorName: 'Ada',
  bodyMarkdown: 'Standalone comment',
  status: 'visible',
  pinnedAt: null,
  createdAt: new Date().toISOString(),
  editedAt: null,
  score: 1,
  viewerVote: null,
}

export const options = {
  site: 'demo',
  baseUrl: location.origin,
  pageUrl: `${location.origin}/post`,
  themeVars: branded,
}

declare global {
  interface Window {
    updateTheme: (theme: WidgetTheme) => void
  }
}
