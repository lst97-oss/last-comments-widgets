import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Comments, CommentViewer, type ActionMode } from '@lst97-oss/last-comments-widgets/react'
import type { WidgetTheme } from '@lst97-oss/last-comments-widgets/client'
import '@lst97-oss/last-comments-widgets/react/styles.css'

const THEME_PRESETS: Record<string, WidgetTheme> = {
  Default: {},
  Brand: { vars: { primary: 'oklch(0.55 0.2 250)', radius: '1rem' }, dark: { primary: 'oklch(0.7 0.18 250)' } },
}

function Demo() {
  const [site, setSite] = useState('demo')
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000')
  const [pageUrl, setPageUrl] = useState(window.location.href)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('')
  const [viewerUserId, setViewerUserId] = useState('')
  const [viewerRole, setViewerRole] = useState('')
  const [signInUrl, setSignInUrl] = useState('')
  const [actionMode, setActionMode] = useState<ActionMode>('icon-text')
  // ?bodyLimit=40 narrows the composer cap, mirroring a host server limit
  const [bodyLimit, setBodyLimit] = useState(
    () => Number(new URLSearchParams(window.location.search).get('bodyLimit')) || 10_000,
  )
  // mount-time only: ?lazy makes the demo probe the deferred fetch path
  const [lazy, setLazy] = useState(() => new URLSearchParams(window.location.search).has('lazy'))
  // mount-time only: ?math / ?mermaid / ?noHighlight exercise the render flags
  const [math] = useState(() => new URLSearchParams(window.location.search).has('math'))
  const [mermaid] = useState(() => new URLSearchParams(window.location.search).has('mermaid'))
  const [codeHighlight] = useState(() => !new URLSearchParams(window.location.search).has('noHighlight'))
  const [preset, setPreset] = useState('Default')
  return (
    <main className="mx-auto grid max-w-2xl gap-4 p-6">
      <h1 className="text-xl font-semibold">last-comments React demo</h1>
      <label className="grid gap-1 text-sm">
        Theme preset
        <select
          className="rounded border border-input px-2 py-1"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
        >
          {Object.keys(THEME_PRESETS).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {/* ?tall pushes the widgets below the fold so the `lazy` path can be exercised */}
      {new URLSearchParams(window.location.search).has('tall') && (
        <div aria-hidden="true" style={{ height: '150vh' }} />
      )}
      <Comments
        site={site}
        baseUrl={baseUrl}
        pageUrl={pageUrl}
        actionMode={actionMode}
        bodyLimit={bodyLimit}
        turnstileSiteKey={turnstileSiteKey || undefined}
        viewerUserId={viewerUserId || undefined}
        signInUrl={signInUrl || undefined}
        viewerRole={viewerRole === 'admin' ? viewerRole : undefined}
        themeVars={THEME_PRESETS[preset]}
        lazy={lazy}
        math={math}
        mermaid={mermaid}
        codeHighlight={codeHighlight}
      />
      <h2 className="mt-6 text-lg font-semibold">Read-only viewer</h2>
      <CommentViewer
        site={site}
        baseUrl={baseUrl}
        pageUrl={pageUrl}
        themeVars={THEME_PRESETS[preset]}
        lazy={lazy}
        math={math}
        mermaid={mermaid}
        codeHighlight={codeHighlight}
      />
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Advanced settings</summary>
        <div className="mt-2 grid gap-2">
          <label className="grid gap-1">
            Site key
            <input
              className="rounded border border-input px-2 py-1"
              value={site}
              onChange={(e) => setSite(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            API base URL (same-origin proxy recommended for voting)
            <input
              className="rounded border border-input px-2 py-1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            Page URL
            <input
              className="rounded border border-input px-2 py-1"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            Turnstile site key (required for posting)
            <input
              className="rounded border border-input px-2 py-1"
              value={turnstileSiteKey}
              onChange={(e) => setTurnstileSiteKey(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            Viewer user ID (empty = guest, shows own Edit/Delete)
            <input
              className="rounded border border-input px-2 py-1"
              value={viewerUserId}
              onChange={(e) => setViewerUserId(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            Action style
            <select
              className="rounded border border-input px-2 py-1"
              value={actionMode}
              onChange={(e) => setActionMode(e.target.value as ActionMode)}
            >
              <option value="icon-text">icon + text</option>
              <option value="icon">icon only</option>
              <option value="text">text only</option>
            </select>
          </label>
          <label className="grid gap-1">
            Body limit (characters, must match the server)
            <input
              className="rounded border border-input px-2 py-1"
              type="number"
              min={1}
              value={bodyLimit}
              onChange={(e) => setBodyLimit(Number(e.target.value) || 10_000)}
            />
          </label>
          <label className="grid gap-1">
            Sign-in URL (empty = start the server OAuth flow)
            <input
              className="rounded border border-input px-2 py-1"
              value={signInUrl}
              onChange={(e) => setSignInUrl(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            Viewer role (admin shows inline moderation; needs the same-origin proxy)
            <select
              className="rounded border border-input px-2 py-1"
              value={viewerRole}
              onChange={(e) => setViewerRole(e.target.value)}
            >
              <option value="">none</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={lazy} onChange={(e) => setLazy(e.target.checked)} />
            Lazy (wait for the widget to scroll into view before fetching)
          </label>
        </div>
      </details>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Demo />)
