/** Orange check that pops in and draws itself; static when the device asks for reduced motion */
export function SuccessMark({ size = 76 }: { size?: number }) {
  return (
    <span
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span aria-hidden className="success-ring absolute inset-0 rounded-full bg-orange" />
      <span className="success-pop relative flex size-full items-center justify-center rounded-full bg-orange text-white">
        <svg
          viewBox="0 0 24 24"
          width={size * 0.47}
          height={size * 0.47}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M20 6 9 17l-5-5" pathLength={1} className="success-draw" />
        </svg>
      </span>
    </span>
  )
}
