import { DEFAULT_BODY_LIMIT, type ErrorInfo, renderMarkdown } from '@last-comments-widgets/client'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { Bold, CodeXml, Eye, Italic, Link2, List, ListOrdered, PenLine, Quote } from 'lucide-react'
import { type ReactNode, useId, useRef, useState } from 'react'
import { CommentError } from './CommentError'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

export type CommentFormInput = {
  authorName: string
  bodyMarkdown: string
  verificationToken: string | undefined
}

type CommentFormProps = {
  siteKey: string | undefined
  guest: boolean
  parentId: string | null
  pending: boolean
  error: ErrorInfo | null
  // Max body characters, counted before trimming to match the server routes.
  bodyLimit?: number
  // Sign-in route for errors whose action is `sign-in` (post/reply only).
  onSignIn?: () => void
  signInHref?: string
  // Holds the submit button while the viewer identity is still resolving.
  identityPending?: boolean
  initialBody?: string
  submitLabel?: string
  identity?: ReactNode
  // Return `false` when the send failed: the form keeps the draft for a retry.
  // Anything else (including nothing) clears it.
  onSubmit: (input: CommentFormInput) => unknown
  onCancelReply?: () => void
}

type InsertFn = (before: string, after: string, placeholder?: string) => void
type PrefixFn = (prefix: string, placeholder?: string) => void

function ComposerToolbar({
  preview,
  onPreview,
  onInsert,
  onPrefix,
}: {
  preview: boolean
  onPreview: (value: boolean) => void
  onInsert: InsertFn
  onPrefix: PrefixFn
}) {
  const tools = [
    { label: 'Bold', icon: <Bold />, action: () => onInsert('**', '**', 'bold') },
    { label: 'Italic', icon: <Italic />, action: () => onInsert('*', '*', 'italic') },
    { label: 'Quote', icon: <Quote />, action: () => onPrefix('> ', 'quote') },
    { label: 'Code', icon: <CodeXml />, action: () => onInsert('`', '`', 'code') },
    { label: 'Link', icon: <Link2 />, action: () => onInsert('[', '](url)', 'link') },
    { label: 'Bullet list', icon: <List />, action: () => onPrefix('- ', 'item') },
    { label: 'Numbered list', icon: <ListOrdered />, action: () => onPrefix('1. ', 'item') },
  ]
  return (
    <div className="mb-1 flex flex-wrap items-center justify-end gap-0.5">
      <div className="mr-auto flex gap-0.5">
        <Button
          type="button"
          size="sm"
          variant={!preview ? 'secondary' : 'ghost'}
          aria-pressed={!preview}
          onClick={() => onPreview(false)}
        >
          <PenLine /> Write
        </Button>
        <Button
          type="button"
          size="sm"
          variant={preview ? 'secondary' : 'ghost'}
          aria-pressed={preview}
          onClick={() => onPreview(true)}
        >
          <Eye /> Preview
        </Button>
      </div>
      <div className="flex gap-0.5" role="toolbar" aria-label="Markdown formatting">
        {tools.map((tool) => (
          <Button
            key={tool.label}
            type="button"
            size="icon-sm"
            variant="ghost"
            title={tool.label}
            aria-label={tool.label}
            onClick={tool.action}
          >
            {tool.icon}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function CommentForm({
  siteKey,
  guest,
  parentId,
  pending,
  error,
  bodyLimit = DEFAULT_BODY_LIMIT,
  onSignIn,
  signInHref,
  initialBody = '',
  submitLabel,
  identity,
  identityPending = false,
  onSubmit,
  onCancelReply,
}: CommentFormProps) {
  const [authorName, setAuthorName] = useState('')
  const [body, setBody] = useState(initialBody)
  const [token, setToken] = useState<string | undefined>(undefined)
  const [preview, setPreview] = useState(false)
  const turnstileRef = useRef<TurnstileInstance>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const counterId = useId()

  function insert(before: string, after: string, placeholder = 'text') {
    const el = bodyRef.current
    if (!el) return
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    const selected = body.slice(start, end) || placeholder
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + before.length + selected.length + after.length
      el.setSelectionRange(pos, pos)
    })
  }

  function prefixLines(prefix: string, placeholder = 'item') {
    const el = bodyRef.current
    if (!el) return
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    const selected = body.slice(start, end) || placeholder
    const lines = selected.split('\n')
    const next = `${body.slice(0, start)}${prefix}${lines.join(`\n${prefix}`)}${body.slice(end)}`
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selected.length + prefix.length * lines.length,
      )
    })
  }

  const bodyTooLong = body.length > bodyLimit

  // Form Action: the fields are controlled, so the action reads state rather
  // than FormData; the reset lives here for the forms that stay mounted.
  async function submitAction() {
    // The submit button is already disabled; keep the guard so a stale render can
    // never post a body the server would reject with a validation error.
    if (bodyTooLong) return
    const result = await onSubmit({
      authorName: guest ? authorName.trim() || 'Anonymous' : authorName,
      bodyMarkdown: body,
      verificationToken: token,
    })
    // `false` = the send failed: keep the draft so it can be retried. The head
    // composer remounts on success (key epoch); the edit/reply slots unmount.
    if (result === false) return
    turnstileRef.current?.reset()
  }

  return (
    <form action={submitAction} className="lc-composer rounded-xl border border-border p-3">
      {parentId && (
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Replying to this comment</span>
          {onCancelReply && (
            <Button type="button" size="sm" variant="ghost" onClick={onCancelReply}>
              Cancel
            </Button>
          )}
        </div>
      )}
      <ComposerToolbar preview={preview} onPreview={setPreview} onInsert={insert} onPrefix={prefixLines} />
      {preview ? (
        <div
          className="lc-markdown min-h-24 px-1 py-2 font-sans text-sm"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by shared renderMarkdown (strips raw HTML, allowlists http(s)/mailto links)
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(body) || '<p class="text-muted-foreground">Nothing to preview.</p>',
          }}
        />
      ) : (
        <Textarea
          ref={bodyRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={parentId ? 'Write a reply…' : 'Your comment here…'}
          rows={4}
          required
          aria-label={parentId ? 'Reply body' : 'Comment body'}
          aria-describedby={counterId}
          aria-invalid={bodyTooLong || undefined}
          className="border-0 bg-transparent px-1 focus-visible:ring-0"
        />
      )}
      {/* Counts what the author typed: the server caps the same raw length. */}
      <p id={counterId} data-lc-char-count="" className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
        <span className={bodyTooLong ? 'text-destructive' : undefined}>{body.length.toLocaleString()}</span>
        {` / ${bodyLimit.toLocaleString()}`}
      </p>
      {guest && siteKey && (
        <Turnstile
          ref={turnstileRef}
          siteKey={siteKey}
          onSuccess={setToken}
          onExpire={() => setToken(undefined)}
          onError={() => setToken(undefined)}
        />
      )}
      {error && (
        <div className="mt-2">
          <CommentError info={error} onSignIn={onSignIn} signInHref={signInHref} />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {identity}
        {guest && (
          <Input
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
            placeholder="Anonymous"
            maxLength={80}
            aria-label="Your name"
            className="w-32 min-w-0 border-0 bg-transparent px-1 focus-visible:ring-0 sm:w-40"
          />
        )}
        <p className="ml-auto hidden text-xs text-muted-foreground sm:block">
          Styling with <span className="font-medium text-primary">Markdown</span> is supported
        </p>
        {/* The reply form cancels from its header; a standalone editor needs this row. */}
        {!parentId && onCancelReply && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onCancelReply}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={pending || bodyTooLong || identityPending || (guest && siteKey ? !token : false)}
        >
          {pending ? 'Posting…' : (submitLabel ?? (parentId ? 'Post reply' : 'Post comment'))}
        </Button>
      </div>
    </form>
  )
}
