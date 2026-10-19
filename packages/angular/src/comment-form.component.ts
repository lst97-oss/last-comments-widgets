import type { ElementRef } from '@angular/core'
import { Component, computed, input, type OnInit, output, signal, viewChild } from '@angular/core'
import { DEFAULT_BODY_LIMIT, type ErrorInfo, renderMarkdown } from '@last-comments-widgets/client'
import { LcCommentErrorComponent } from './comment-error.component'
import { LcTurnstileDirective } from './turnstile.directive'

export type CommentSubmit = { body: string; authorName?: string; token?: string }

// One counter per composer: the counter `<p>` id must be unique per instance.
let formSeq = 0

// Panel composer: Write/Preview toggle + icon toolbar, borderless
// textarea, guest name + markdown hint + submit row. Name + Turnstile
// show only for guests when a turnstileSiteKey is set (token resets
// after every submit).
@Component({
  selector: 'lc-comment-form',
  standalone: true,
  imports: [LcTurnstileDirective, LcCommentErrorComponent],
  template: `
    <form (submit)="onSubmit($event)" class="lc-composer rounded-xl border border-border p-3">
      @if (parentId()) {
        <div class="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Replying to this comment</span>
          <button
            type="button"
            (click)="cancelReply.emit()"
            class="h-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[length:calc(var(--lc-font-size,1rem)*0.8)] font-medium hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      }
      <div class="mb-1 flex flex-wrap items-center justify-end gap-0.5">
        <div class="mr-auto flex gap-0.5">
          <button
            type="button"
            [attr.aria-pressed]="!preview()"
            (click)="preview.set(false)"
            [class]="
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ' +
              (!preview()
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground')
            "
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <path d="M13 21h8" />
              <path
                d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
              />
            </svg>
            Write
          </button>
          <button
            type="button"
            [attr.aria-pressed]="preview()"
            (click)="preview.set(true)"
            [class]="
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ' +
              (preview()
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground')
            "
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <path
                d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
              />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Preview
          </button>
        </div>
        <div class="flex gap-0.5" role="toolbar" aria-label="Markdown formatting">
          <button
            type="button"
            (click)="wrap('**', '**', 'bold')"
            title="Bold"
            aria-label="Bold"
            class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
            </svg>
          </button>
          <button
            type="button"
            (click)="wrap('*', '*', 'italic')"
            title="Italic"
            aria-label="Italic"
            class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <line x1="19" x2="10" y1="4" y2="4" />
              <line x1="14" x2="5" y1="20" y2="20" />
              <line x1="15" x2="9" y1="4" y2="20" />
            </svg>
          </button>
          <button
            type="button"
            (click)="prefix('> ', 'quote')"
            title="Quote"
            aria-label="Quote"
            class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <path
                d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"
              />
              <path
                d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"
              />
            </svg>
          </button>
          <button
            type="button"
            (click)="wrap('\`', '\`', 'code')"
            title="Code"
            aria-label="Code"
            class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <path d="m18 16 4-4-4-4" />
              <path d="m6 8-4 4 4 4" />
              <path d="m14.5 4-5 16" />
            </svg>
          </button>
          <button
            type="button"
            (click)="wrap('[', '](url)', 'link')"
            title="Link"
            aria-label="Link"
            class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <path d="M9 17H7A5 5 0 0 1 7 7h2" />
              <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
              <line x1="8" x2="16" y1="12" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            (click)="prefix('- ', 'item')"
            title="Bullet list"
            aria-label="Bullet list"
            class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <path d="M3 5h.01" />
              <path d="M3 12h.01" />
              <path d="M3 19h.01" />
              <path d="M8 5h13" />
              <path d="M8 12h13" />
              <path d="M8 19h13" />
            </svg>
          </button>
          <button
            type="button"
            (click)="prefix('1. ', 'item')"
            title="Numbered list"
            aria-label="Numbered list"
            class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <path d="M11 5h10" />
              <path d="M11 12h10" />
              <path d="M11 19h10" />
              <path d="M4 4h1v5" />
              <path d="M4 9h2" />
              <path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02" />
            </svg>
          </button>
        </div>
      </div>
      @if (preview()) {
        <div class="lc-markdown min-h-24 px-1 py-2 font-sans text-sm" [innerHTML]="previewHtml()"></div>
      } @else {
        <textarea
          #bodyEl
          [placeholder]="parentId() ? 'Write a reply…' : 'Your comment here…'"
          rows="4"
          required
          [attr.aria-label]="parentId() ? 'Reply body' : 'Comment body'"
          [attr.aria-describedby]="counterId"
          [attr.aria-invalid]="bodyTooLong() || null"
          class="w-full border-0 bg-transparent px-1 font-sans text-sm focus-visible:outline-none"
          [value]="body()"
          (input)="body.set($any($event.target).value)"
        ></textarea>
      }
      <!-- Counts what the author typed: the server caps the same raw length. -->
      <p [id]="counterId" data-lc-char-count class="mt-1 text-right text-xs text-muted-foreground tabular-nums">
        <span [class.text-destructive]="bodyTooLong()">{{ body().length.toLocaleString() }}</span
        >{{ ' / ' + bodyLimit().toLocaleString() }}
      </p>
      @if (guest() && turnstileSiteKey()) {
        <div [lcTurnstile]="turnstileSiteKey()" (token)="token.set($event)" (expired)="token.set(undefined)"></div>
      }
      @if (error(); as failure) {
        <lc-comment-error [info]="failure" (retry)="retrySubmit()" (signIn)="signIn.emit()" />
      }
      <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <ng-content select="[lcSignIn]" />
        @if (guest()) {
          <input
            type="text"
            placeholder="Anonymous"
            maxlength="80"
            autocomplete="nickname"
            aria-label="Your name"
            class="w-32 min-w-0 border-0 bg-transparent px-1 text-sm focus-visible:outline-none sm:w-40"
            [value]="authorName()"
            (input)="authorName.set($any($event.target).value)"
          />
        }
        <p class="ml-auto hidden text-xs text-muted-foreground sm:block">
          Styling with <span class="font-medium text-primary">Markdown</span> is supported
        </p>
        <!-- The reply form cancels from its header; a standalone editor needs this row. -->
        @if (!parentId() && showCancel()) {
          <button
            type="button"
            [disabled]="submitting()"
            (click)="cancelReply.emit()"
            class="h-7 rounded-[min(var(--radius-md),12px)] border border-border px-2.5 text-[length:calc(var(--lc-font-size,1rem)*0.8)] font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
        }
        <button
          type="submit"
          [disabled]="
            submitting() || sessionPending() || bodyTooLong() || (guest() && turnstileSiteKey() ? !token() : false)
          "
          class="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground disabled:opacity-50"
        >
          {{ submitText() }}
        </button>
      </div>
    </form>
  `,
})
export class LcCommentFormComponent implements OnInit {
  guest = input(false)
  turnstileSiteKey = input<string | undefined>(undefined)
  parentId = input<string | null>(null)
  submitting = input(false)
  // Posting before the viewer identity resolves would guess `guest` on the wire.
  sessionPending = input(false)
  error = input<ErrorInfo | null>(null)
  initialBody = input('')
  submitLabel = input<string | undefined>(undefined)
  showCancel = input(false)
  // Max body characters, counted before trimming to match the server routes.
  bodyLimit = input(DEFAULT_BODY_LIMIT)
  submitted = output<CommentSubmit>()
  signIn = output<void>()
  cancelReply = output<void>()

  // `<textarea>` describes itself with the counter's id.
  readonly counterId = `lc-char-count-${++formSeq}`
  authorName = signal('')
  body = signal('')
  token = signal<string | undefined>(undefined)
  preview = signal(false)
  turnstile = viewChild(LcTurnstileDirective)
  box = viewChild<ElementRef<HTMLTextAreaElement>>('bodyEl')

  readonly bodyTooLong = computed(() => this.body().length > this.bodyLimit())
  readonly submitText = computed(() =>
    this.submitting() ? 'Posting…' : (this.submitLabel() ?? (this.parentId() ? 'Post reply' : 'Post comment')),
  )
  // Sanitization happened in the shared renderer; Angular [innerHTML] sanitizes again.
  readonly previewHtml = computed(
    () => renderMarkdown(this.body()) || '<p class="text-muted-foreground">Nothing to preview.</p>',
  )

  ngOnInit(): void {
    if (this.initialBody()) this.body.set(this.initialBody())
  }

  // Wraps the current textarea selection with a markdown delimiter pair.
  wrap(before: string, after: string, placeholder = ''): void {
    const el = this.box()?.nativeElement
    const current = this.body()
    const start = el?.selectionStart ?? current.length
    const end = el?.selectionEnd ?? current.length
    const selected = current.slice(start, end) || placeholder
    this.body.set(current.slice(0, start) + before + selected + after + current.slice(end))
    const caret = start + before.length + selected.length + after.length
    if (el) {
      queueMicrotask(() => {
        el.focus()
        el.setSelectionRange(caret, caret)
      })
    }
  }

  // Prefixes each selected line (e.g. quote/list markers).
  prefix(prefixText: string, placeholder = 'item'): void {
    const el = this.box()?.nativeElement
    const current = this.body()
    const start = el?.selectionStart ?? current.length
    const end = el?.selectionEnd ?? current.length
    const selected = current.slice(start, end) || placeholder
    const lines = selected.split('\n')
    this.body.set(current.slice(0, start) + prefixText + lines.join(`\n${prefixText}`) + current.slice(end))
    if (el) {
      queueMicrotask(() => {
        el.focus()
        el.setSelectionRange(
          start + prefixText.length,
          start + prefixText.length + selected.length + prefixText.length * lines.length,
        )
      })
    }
  }

  onSubmit(event: Event): void {
    event.preventDefault()
    this.retrySubmit()
  }

  // Emits the current draft; the error block's "Try again" reuses the submit path.
  retrySubmit(): void {
    // The submit button is already disabled; keep the guard so a stale render can
    // never post a body the server would reject with a validation error.
    if (this.bodyTooLong()) return
    const text = this.body().trim()
    if (text.length === 0) return
    this.submitted.emit({
      body: text,
      authorName: this.guest() ? this.authorName().trim() || 'Anonymous' : undefined,
      token: this.token(),
    })
  }

  // Clears inputs and resets the single-use Turnstile token.
  reset(): void {
    this.body.set('')
    this.token.set(undefined)
    this.preview.set(false)
    this.turnstile()?.reset()
  }
}
