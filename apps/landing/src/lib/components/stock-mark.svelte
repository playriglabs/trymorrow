<script lang="ts">
let {
  stock = 'nvidia',
  color = '#d5efb2',
  size = 44,
}: { stock?: string; color?: string; size?: number } = $props()

const names: Record<string, string> = { apple: 'Apple', nvidia: 'Nvidia', tesla: 'Tesla' }
</script>

<span
  class="inline-flex shrink-0 items-center justify-center rounded-full"
  style:width={`${size}px`}
  style:height={`${size}px`}
  style:background={color}
>
  <img
    src={`/stocks/${stock}.svg`}
    alt={`${names[stock] ?? stock} logo`}
    width={Math.round(size * 0.55)}
    height={Math.round(size * 0.55)}
    class="object-contain"
  />
</span>
