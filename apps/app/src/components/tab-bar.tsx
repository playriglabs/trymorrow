import { Home, User } from 'lucide-react'
import { cx } from '@/components/ui'

const TABS = [
  { href: '/', label: 'Home', Icon: Home },
  { href: '/profile', label: 'Profile', Icon: User },
] as const

export function TabBar({ active }: { active: '/' | '/profile' }) {
  return (
    <nav className="sticky bottom-0 bg-cream px-5 pt-2 pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="flex gap-1 rounded-link border border-line bg-surface p-1">
        {TABS.map(({ href, label, Icon }) => (
          <a
            key={href}
            href={href}
            aria-current={active === href ? 'page' : undefined}
            className={cx(
              'flex h-12 flex-1 items-center justify-center gap-1.5 rounded-link text-[14px]',
              active === href ? 'bg-orange-wash text-ink' : 'text-stone',
            )}
          >
            <Icon className="size-[18px]" strokeWidth={1.75} />
            {label}
          </a>
        ))}
      </div>
    </nav>
  )
}
