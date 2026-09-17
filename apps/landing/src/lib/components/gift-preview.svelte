<script lang="ts">
import Icon from './landing-icon.svelte'
import StockMark from './stock-mark.svelte'

let { compact = false }: { compact?: boolean } = $props()
</script>

<div
  class="@container relative overflow-hidden rounded-3xl bg-orange p-[clamp(12px,5cqw,20px)] text-white"
  class:compact
>
  <div class="flex items-center justify-between text-xs">
    <span>Something for your tomorrow</span><Icon name="gift" size={20} />
  </div>
  <div class="py-7 font-sans text-[clamp(30px,21cqw,54px)] leading-none tracking-[-0.06em]">
    For you<span class="ml-1 text-sun">*</span>
  </div>
  <div class="rounded-button bg-cream p-4 text-ink">
    <div class="flex items-center gap-3">
      <StockMark stock="nvidia" size={38} />
      <div>
        <p class="text-xs text-stone">A gifts for you.</p>
        <p class="font-sans text-2xl tracking-tight">$50.00</p>
      </div>
      <span class="ml-auto text-orange"><Icon name="heart" size={21} /></span>
    </div>
    <div class="mt-4 border-t border-line pt-3 text-xs text-stone">
      “Here’s to your next big thing.”
    </div>
  </div>
  <div class="mt-4 flex justify-between text-[10px]">
    <span>With love, Alex</span><span>morrow ↗</span>
  </div>
</div>
