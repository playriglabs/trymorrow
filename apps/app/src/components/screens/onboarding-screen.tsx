import { navigate } from 'astro:transitions/client'
import { CaretDownIcon, CheckIcon, ShieldCheckIcon, XIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { type ReactNode, useEffect, useState } from 'react'
import { AvatarPicker } from '@/components/avatar-picker'
import { withProviders } from '@/components/providers'
import { Button, Label, Loading, Notice, Screen, TextInput } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import {
  type ProfileUpdate,
  useHandleAvailabilityQuery,
  useUpdateProfileMutation,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { safeNext } from '@/lib/format'
import { MAX_HANDLE, MIN_HANDLE } from '@/lib/handles'
import type { Profile } from '@/lib/types'

const COUNTRIES = [
  ['ID', 'Indonesia'],
  ['SG', 'Singapore'],
  ['MY', 'Malaysia'],
  ['PH', 'Philippines'],
  ['VN', 'Vietnam'],
  ['TH', 'Thailand'],
  ['IN', 'India'],
  ['AE', 'United Arab Emirates'],
  ['GB', 'United Kingdom'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['NL', 'Netherlands'],
  ['AU', 'Australia'],
  ['CA', 'Canada'],
  ['BR', 'Brazil'],
  ['MX', 'Mexico'],
  ['NG', 'Nigeria'],
  ['KE', 'Kenya'],
  ['JP', 'Japan'],
  ['KR', 'South Korea'],
  ['US', 'United States'],
  ['ZZ', 'Somewhere else'],
] as const

const flagEmoji = (code: string) =>
  code === 'ZZ'
    ? '🌐'
    : String.fromCodePoint(...code.split('').map((letter) => 127397 + letter.charCodeAt(0)))

function Steps({ current }: { current: 1 | 2 }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid w-full grid-cols-2 gap-1.5">
        <span className="h-1 rounded-full bg-orange" />
        <span
          className={clsx('h-1 rounded-full', {
            'bg-orange': current === 2,
            'bg-line': current !== 2,
          })}
        />
      </div>
      <span className="shrink-0 text-[13px] text-stone">{current} of 2</span>
    </div>
  )
}

function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  children: ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-3.5">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={clsx(
          'flex size-6 shrink-0 items-center justify-center rounded-[7px] border peer-focus-visible:ring-4 peer-focus-visible:ring-orange-wash',
          {
            'border-orange bg-orange text-white': checked,
            'border-line bg-surface': !checked,
          },
        )}
      >
        {checked && <CheckIcon className="size-4" />}
      </span>
      <span className="text-[15px] leading-[1.45]">{children}</span>
    </label>
  )
}

function Onboarding() {
  const session = useSession({ required: false })
  const update = useUpdateProfileMutation()
  const [step, setStep] = useState<1 | 2>(1)
  const [country, setCountry] = useState('ID')
  const [countryPickerOpen, setCountryPickerOpen] = useState(false)
  const [notUs, setNotUs] = useState(false)
  const [terms, setTerms] = useState(false)
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const next = safeNext(new URLSearchParams(location.search).get('next'))

  useEffect(() => {
    if (!session.ready) return
    if (!session.authenticated) navigate('/login', { history: 'replace' })
    else if (session.profile?.onboarded) navigate(next, { history: 'replace' })
    else if (session.profile) {
      setProfile(session.profile)
      setName((value) => value || session.profile?.name || '')
    }
  }, [session.ready, session.authenticated, session.profile, next])

  const cleanHandle = handle.trim().toLowerCase()
  const availability = useHandleAvailabilityQuery(cleanHandle)

  if (!session.ready || !profile) return <Loading />

  const save = (patch: ProfileUpdate, after: () => void) =>
    update.mutate(patch, {
      onSuccess: (updated) => {
        setProfile(updated)
        after()
      },
    })
  const saving = update.isPending
  const error = update.isError ? errorMessage(update.error) : null

  if (step === 1) {
    const blocked = country === 'US'
    return (
      <Screen
        back="/login"
        footer={
          <Button
            disabled={blocked || !notUs || !terms}
            loading={saving}
            onClick={() =>
              save({ country, notUsPerson: true, acceptTerms: true }, () => setStep(2))
            }
          >
            Continue
          </Button>
        }
      >
        <Steps current={1} />
        <div className="flex flex-col gap-2">
          <h1 className="font-sans text-[30px] leading-[1.12] font-medium tracking-[-0.02em]">
            One quick check
          </h1>
          <p className="text-stone">Morrow isn’t available everywhere yet.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="country">Where do you live?</Label>
          <button
            type="button"
            id="country"
            onClick={() => setCountryPickerOpen(true)}
            className="flex h-14 w-full items-center gap-3 rounded-button border border-line bg-surface px-4 text-left text-[17px] outline-none focus:border-orange focus:ring-4 focus:ring-orange-wash"
          >
            <span aria-hidden>{flagEmoji(country)}</span>
            <span className="flex-1">
              {COUNTRIES.find(([code]) => code === country)?.[1] ?? 'Choose a country'}
            </span>
            <CaretDownIcon aria-hidden className="size-5 text-stone" />
          </button>
        </div>
        {blocked ? (
          <Notice tone="warning">Morrow isn’t available in the United States yet.</Notice>
        ) : (
          <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface px-4">
            <Checkbox checked={notUs} onChange={setNotUs}>
              I’m not a citizen or resident of the United States.
            </Checkbox>
            <Checkbox checked={terms} onChange={setTerms}>
              I agree to the{' '}
              <a href="/terms" className="underline">
                Terms
              </a>{' '}
              and{' '}
              <a href="/privacy" className="underline">
                Privacy Policy
              </a>
              .
            </Checkbox>
          </div>
        )}
        <Notice icon={<ShieldCheckIcon className="size-4.5 text-stone" />}>
          No ID or selfie needed. Your account and your money stay in your control.
        </Notice>
        {error && <p className="text-[13px] text-loss">{error}</p>}
        {countryPickerOpen && (
          <div
            className="modal-backdrop-in fixed inset-0 z-40 flex items-end bg-ink/35"
            role="presentation"
          >
            <button
              type="button"
              aria-label="Close country picker"
              className="absolute inset-0 cursor-default"
              onClick={() => setCountryPickerOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="country-picker-title"
              className="modal-sheet-in relative flex max-h-[82dvh] w-full flex-col gap-4 overflow-hidden rounded-t-sheet bg-cream px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-elevated"
            >
              <div className="flex items-center justify-between">
                <h2 id="country-picker-title" className="font-sans text-xl font-medium">
                  Where do you live?
                </h2>
                <button
                  type="button"
                  aria-label="Close country picker"
                  onClick={() => setCountryPickerOpen(false)}
                  className="flex size-10 items-center justify-center rounded-full hover:bg-orange-wash"
                >
                  <XIcon className="size-5" />
                </button>
              </div>
              <div className="flex min-h-0 flex-col overflow-y-auto rounded-card border border-line bg-surface">
                {COUNTRIES.map(([code, label]) => {
                  const selected = country === code
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setCountry(code)
                        setCountryPickerOpen(false)
                      }}
                      className={clsx(
                        'flex min-h-14 items-center gap-3 border-b border-line px-4 py-2 text-left last:border-b-0',
                        { 'bg-orange-wash': selected },
                      )}
                    >
                      <span className="text-2xl" aria-hidden>
                        {flagEmoji(code)}
                      </span>
                      <span className="flex-1 text-[16px]">{label}</span>
                      {selected && <CheckIcon className="size-5 text-orange" weight="bold" />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </Screen>
    )
  }

  const handleReady = availability.data?.available === true
  return (
    <Screen
      back={true}
      footer={
        <Button
          disabled={!name.trim() || !handleReady}
          loading={saving}
          onClick={() =>
            save({ name: name.trim(), handle: cleanHandle }, () =>
              navigate(next, { history: 'replace' }),
            )
          }
        >
          Finish
        </Button>
      }
    >
      <Steps current={2} />
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-[30px] leading-[1.12] font-medium tracking-[-0.02em]">
          What should friends call you?
        </h1>
        <p className="text-stone">This shows on gifts you send.</p>
      </div>
      <div className="flex items-center gap-4">
        <AvatarPicker
          profile={{ name: name || profile.name, avatarUrl: profile.avatarUrl }}
          size={80}
          onChange={setProfile}
        />
        <div className="flex flex-col">
          <span>Add a photo</span>
          <span className="text-[13px] text-stone">Optional. Friends recognize you faster.</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <TextInput
          id="name"
          maxLength={40}
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="handle">Your gift link</Label>
        <div className="flex h-14 items-center rounded-button border border-line bg-surface px-4 text-[17px] focus-within:border-orange focus-within:ring-4 focus-within:ring-orange-wash">
          <span className="text-stone">app.trymorrow.money/</span>
          <input
            id="handle"
            className="min-w-0 flex-1 bg-transparent outline-none"
            autoCapitalize="none"
            autoCorrect="off"
            value={handle}
            maxLength={MAX_HANDLE}
            onChange={(event) =>
              setHandle(event.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, MAX_HANDLE))
            }
          />
        </div>
        {cleanHandle.length > 0 && cleanHandle.length < MIN_HANDLE && (
          <p className="text-[13px] text-stone">
            At least {MIN_HANDLE} letters, numbers or underscores.
          </p>
        )}
        {availability.data && (
          <p
            className={clsx('flex items-center gap-1.5 text-[13px]', {
              'text-gain': handleReady,
              'text-loss': !handleReady,
            })}
          >
            {handleReady && <CheckIcon className="size-3.5" />}
            {handleReady ? 'Available' : 'Taken. Try another.'}
          </p>
        )}
      </div>
      {error && <p className="text-[13px] text-loss">{error}</p>}
    </Screen>
  )
}

export default withProviders(Onboarding)
