import { GiftIcon, HouseIcon, PiggyBankIcon, UserIcon } from '@phosphor-icons/react'
import clsx from 'clsx'

const TABS = [
  { href: '/', label: 'Home', Icon: HouseIcon },
  { href: '/gifts', label: 'Gifts', Icon: GiftIcon },
  { href: '/funds', label: 'Funds', Icon: PiggyBankIcon },
  { href: '/profile', label: 'Profile', Icon: UserIcon },
] as const

export type Tab = (typeof TABS)[number]['href']

export function TabBar({ active }: { active: Tab }) {
  return (
    <nav className="sticky bottom-0 bg-cream px-5 pt-2 pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="flex gap-1 rounded-link border border-line bg-surface p-1">
        {TABS.map(({ href, label, Icon }) => (
          <a
            key={href}
            href={href}
            aria-current={active === href ? 'page' : undefined}
            className={clsx(
              'flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-link text-[12px]',
              {
                'bg-orange-wash text-ink': active === href,
                'text-stone': active !== href,
              },
            )}
          >
            <Icon className="size-4.5" />
            {label}
          </a>
        ))}
      </div>
    </nav>
  )
}
