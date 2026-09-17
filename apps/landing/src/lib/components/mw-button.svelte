<script lang="ts">
import type { Snippet } from 'svelte'

let {
  variant = 'filled',
  href,
  children,
}: {
  variant?: 'filled' | 'soft' | 'ghost'
  href?: string
  children?: Snippet
} = $props()

const variants = {
  filled: 'button-shiny bg-orange px-5 py-3 text-white hover:brightness-95',
  soft: 'glass-soft px-6 py-4 text-ink',
  ghost: 'bg-transparent py-3 text-ink',
} as const
</script>

{#if href}
  <a
    {href}
    class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-button font-sans text-base/[1.2] font-medium transition-[filter] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink {variants[
      variant
    ]}"
  >
    {@render children?.()}
  </a>
{:else}
  <button
    type="button"
    class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-button font-sans text-base/[1.2] font-medium transition-[filter] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink {variants[
      variant
    ]}"
  >
    {@render children?.()}
  </button>
{/if}
