import type { ErrorInfo } from '@lst97-oss/client'
import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Button, buttonVariants } from './ui/button'

type CommentErrorProps = {
  info: ErrorInfo
  onRetry?: () => void
  onSignIn?: () => void
  signInHref?: string
}

// The one error block every failure surface renders. Copy (title/message/action)
// comes from describeError in the client; this only owns the layout.
export function CommentError({ info, onRetry, onSignIn, signInHref }: CommentErrorProps) {
  const retry = info.action === 'retry' && onRetry ? onRetry : null
  const signIn =
    info.action === 'sign-in' && (onSignIn || signInHref) ? (
      onSignIn ? (
        <Button size="sm" onClick={onSignIn}>
          Sign in
        </Button>
      ) : (
        // An anchor, not a Button: the sign-in URL is a navigation target.
        <a className={buttonVariants({ size: 'sm' })} href={signInHref}>
          Sign in
        </a>
      )
    ) : null
  return (
    <Alert className="lc-error" variant="destructive" data-lc-error="" data-error-code={info.code ?? ''}>
      <TriangleAlert />
      <AlertTitle>{info.title}</AlertTitle>
      <AlertDescription>
        {info.message}
        {(retry || signIn) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {retry && (
              <Button size="sm" variant="outline" onClick={retry}>
                Try again
              </Button>
            )}
            {signIn}
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}
