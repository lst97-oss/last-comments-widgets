import type { ErrorInfo } from '@last-comments-widgets/client'

type SignInPromptProps = {
  info: ErrorInfo
  // Which action was refused, so the prompt can be told apart in markup and tests.
  context: 'read' | 'write' | 'reply' | 'vote'
  onSignIn?: () => void
  signInHref?: string
}

// A sign-in request, not a failure: the neutral prompt on login and private sites. Its colours come from
// the theme tokens (--lc-signin-*), so a host retheme reaches it. The button is wired like CommentError's.
export function SignInPrompt({ info, context, onSignIn, signInHref }: SignInPromptProps) {
  return (
    <div className="lc-signin" role="status" data-lc-signin="" data-signin-context={context}>
      <p className="font-medium">{info.title}</p>
      <p>{info.message}</p>
      {onSignIn ? (
        <button type="button" className="lc-signin-button" onClick={onSignIn}>
          Sign in
        </button>
      ) : signInHref ? (
        <a className="lc-signin-button" href={signInHref}>
          Sign in
        </a>
      ) : null}
    </div>
  )
}
