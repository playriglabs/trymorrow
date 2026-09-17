import clsx from 'clsx'

export function GiftCardTabs({ active }: { active: 'create' | 'redeem' }) {
  return (
    <nav
      aria-label="Gift card"
      className="grid grid-cols-2 gap-1 rounded-link border border-line bg-surface p-1"
    >
      {[
        { key: 'create', label: 'Create', href: '/gift-cards' },
        { key: 'redeem', label: 'Redeem', href: '/redeem' },
      ].map((tab) => (
        <a
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? 'page' : undefined}
          className={clsx(
            'flex h-11 items-center justify-center rounded-link font-sans text-[15px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
            {
              // Same orange glass as the active tab in the bottom bar
              'glass-active text-white': active === tab.key,
              'text-stone hover:bg-orange-wash hover:text-ink': active !== tab.key,
            },
          )}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  )
}
