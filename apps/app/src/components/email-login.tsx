import { useLoginWithEmail } from '@privy-io/react-auth'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { Button, Label, TextInput } from '@/components/ui'

const CODE_LENGTH = 6
const RESEND_SECONDS = 45

/** Email → 6-digit code. Privy handles both sign-in and sign-up behind the same flow */
export function EmailLogin({ intro }: { intro?: string }) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const codeInput = useRef<HTMLInputElement>(null)
  const { sendCode, loginWithCode, state } = useLoginWithEmail()

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
      <form onSubmit={requestCode} className="flex flex-1 flex-col gap-7">
        <div className="flex flex-col gap-2">
          <h1 className="font-sans text-[30px] leading-[1.12] font-medium tracking-[-0.02em]">
            What’s your email?
          </h1>
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
            autoFocus
            required
          />
          {error && <p className="text-[13px] text-loss">{error}</p>}
        </div>
        <div className="mt-auto flex flex-col gap-2.5 pb-[max(28px,env(safe-area-inset-bottom))]">
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
    <div className="flex flex-1 flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-[30px] leading-[1.12] font-medium tracking-[-0.02em]">
          Enter the code
        </h1>
        <p className="text-stone">
          Sent to <span className="text-ink">{email}</span> ·{' '}
          <button type="button" className="text-ink underline" onClick={() => setStep('email')}>
            Change
          </button>
        </p>
      </div>

      <label className="relative grid grid-cols-6 gap-2">
        <span className="sr-only">6-digit code</span>
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length code slots
            key={index}
            className={clsx(
              'flex h-15 items-center justify-center rounded-[14px] border bg-surface font-sans text-[26px] font-medium',
              {
                'border-orange ring-4 ring-orange-wash': index === code.length,
                'border-line': index !== code.length,
              },
            )}
          >
            {code[index] ?? ''}
          </span>
        ))}
        <input
          ref={codeInput}
          className="absolute inset-0 opacity-0"
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

      <div className="mt-auto flex flex-col gap-2.5 pb-[max(28px,env(safe-area-inset-bottom))]">
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
