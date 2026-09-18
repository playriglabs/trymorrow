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
    <nav className="sticky bottom-0 z-20 px-5 pt-3 pb-[max(23px,env(safe-area-inset-bottom))]">
      <div className="glass-surface flex gap-1 rounded-link border border-line p-1">
        {TABS.map(({ href, label, Icon }) => (
          <a
            key={href}
            href={href}
            data-astro-prefetch="hover"
            aria-current={active === href ? 'page' : undefined}
            className={clsx(
              'flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-link text-[12px]',
              {
                'glass-active text-white': active === href,
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
