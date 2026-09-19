import { useLoginWithEmail } from '@privy-io/react-auth'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { Button, Label, TextInput } from '@/components/ui'

const CODE_LENGTH = 6
const RESEND_SECONDS = 45

/**
 * Email → 6-digit code. Privy handles both sign-in and sign-up behind the same flow.
 *
 * On its own screen it fills the height and sits its button at the bottom like a footer. Inside
 * another screen that already has one, `compact` makes it flow with what's around it instead, so
 * a host never ends up showing two primary buttons and a hole between them.
 */
export function EmailLogin({
  intro,
  title,
  compact = false,
}: {
  intro?: string
  /** Replaces "What's your email?" when the screen around it needs to say something else */
  title?: string
  compact?: boolean
}) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const codeInput = useRef<HTMLInputElement>(null)
  const { sendCode, loginWithCode, state } = useLoginWithEmail()

  const frame = compact ? 'flex flex-col gap-6' : 'flex flex-1 flex-col gap-7 mt-3'
  const actions = compact
    ? 'flex flex-col gap-2.5'
    : 'mt-auto flex flex-col gap-2.5 pb-[max(28px,env(safe-area-inset-bottom))]'
  const headingClass = compact
    ? 'font-sans text-[22px] leading-[1.15] font-medium tracking-[-0.02em]'
    : 'font-sans text-[30px] leading-[1.12] font-medium tracking-[-0.02em]'

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  async function requestCode(event?: { preventDefault(): void }) {
    event?.preventDefault()
    setError(null)
    try {
      await sendCode({ email: email.trim() })
      setStep('code')
      setResendIn(RESEND_SECONDS)
      setTimeout(() => codeInput.current?.focus(), 50)
    } catch {
      setError('We couldn’t send a code to that email. Check it and try again.')
    }
  }

  async function submitCode(value: string) {
    setError(null)
    try {
      await loginWithCode({ code: value })
    } catch {
      setError('That code didn’t work. Check the latest email and try again.')
      setCode('')
    }
  }

  if (step === 'email') {
    return (
      <form onSubmit={requestCode} className={frame}>
        <div className="flex flex-col gap-2">
          {compact ? (
            <h2 className={headingClass}>{title ?? 'What’s your email?'}</h2>
          ) : (
            <h1 className={headingClass}>{title ?? 'What’s your email?'}</h1>
          )}
          <p className="text-stone">
            {intro ?? 'We’ll send you a 6-digit code. No password needed.'}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <TextInput
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus={!compact}
            required
          />
          {error && <p className="text-[13px] text-loss">{error}</p>}
        </div>
        <div className={actions}>
          <Button
            type="submit"
            loading={state.status === 'sending-code'}
            disabled={!email.includes('@')}
          >
            Send code
          </Button>
          <p className="text-center text-[13px] text-stone">
            New here? We’ll create your account after you verify.
          </p>
        </div>
      </form>
    )
  }

  return (
    <div className={frame}>
      <div className="flex flex-col gap-2">
        {compact ? (
          <h2 className={headingClass}>Enter the code</h2>
        ) : (
          <h1 className={headingClass}>Enter the code</h1>
        )}
        <p className="text-stone">
          Sent to <span className="text-ink">{email}</span> ·{' '}
          <button type="button" className="text-ink underline" onClick={() => setStep('email')}>
            Change
          </button>
        </p>
      </div>

      <label className="group relative grid grid-cols-6 gap-1.5">
        <span className="sr-only">6-digit code</span>
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length code slots
            key={index}
            className={clsx(
              'relative flex h-15 min-w-0 items-center justify-center rounded-[14px] border bg-surface font-sans text-[26px] leading-none font-medium',
              {
                'border-orange ring-4 ring-orange-wash': index === code.length,
                'border-line': index !== code.length,
              },
            )}
          >
            {code[index] ?? ''}
            {index === code.length && state.status !== 'submitting-code' && (
              <span
                className="pointer-events-none absolute top-1/2 left-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-ink opacity-0 group-focus-within:opacity-100"
                aria-hidden
              />
            )}
          </span>
        ))}
        <input
          ref={codeInput}
          className="absolute inset-0 h-full w-full caret-transparent opacity-0"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          value={code}
          disabled={state.status === 'submitting-code'}
          onChange={(event) => {
            const value = event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
            setCode(value)
            if (value.length === CODE_LENGTH) void submitCode(value)
          }}
        />
      </label>

      {error && <p className="-mt-3 text-[13px] text-loss">{error}</p>}

      <p className="text-[14px] text-stone">
        {resendIn > 0 ? (
          `Didn’t get it? Resend in 0:${String(resendIn).padStart(2, '0')}`
        ) : (
          <button type="button" className="text-ink underline" onClick={() => requestCode()}>
            Resend code
          </button>
        )}
      </p>

      <div className={actions}>
        <Button
          loading={state.status === 'submitting-code'}
          disabled={code.length < CODE_LENGTH}
          onClick={() => submitCode(code)}
        >
          Verify
        </Button>
        <p className="text-center text-[13px] text-stone">
          Check your spam folder if it’s not there.
        </p>
      </div>
    </div>
  )
}
