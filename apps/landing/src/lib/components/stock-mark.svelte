<script lang="ts">
let {
  stock = 'nvidia',
  color = '#d5efb2',
  size = 44,
  /** How much of the circle the logo fills; raise it when a mark reads small beside another */
  scale = 0.55,
}: { stock?: string; color?: string; size?: number; scale?: number } = $props()

const names: Record<string, string> = {
  apple: 'Apple',
  nvidia: 'Nvidia',
  tesla: 'Tesla',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
}

// The Pre-IPO marks ship as full squares on the company's own colour, so they fill the circle
// instead of sitting inside one.
const filled: Record<string, string> = { openai: 'png', anthropic: 'png' }
const extension = $derived(filled[stock] ?? 'svg')
const isFilled = $derived(Boolean(filled[stock]))
</script>

<span
  class="inline-flex shrink-0 items-center justify-center rounded-full"
  style:width={`${size}px`}
  style:height={`${size}px`}
  style:background={color}
>
  <img
    src={`/stocks/${stock}.${extension}`}
    alt={`${names[stock] ?? stock} logo`}
    width={isFilled ? size : Math.round(size * scale)}
    height={isFilled ? size : Math.round(size * scale)}
    class={isFilled ? 'h-full w-full rounded-full object-cover' : 'object-contain'}
  />
</span>
