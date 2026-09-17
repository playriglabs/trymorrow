<script lang="ts">
// Solid lock used wherever the page talks about control and privacy.
let { class: className = 'size-9' }: { class?: string } = $props()
</script>

<svg class={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <path
    d="M19 28V20a13 13 0 0 1 26 0v8"
    stroke="currentColor"
    stroke-width="6"
    stroke-linecap="round"
  />
  <rect x="11" y="25" width="42" height="33" rx="10" fill="currentColor" />
  <circle cx="32" cy="39" r="4" fill="#fff7e9" />
  <path d="M32 41v7" stroke="#fff7e9" stroke-width="4" stroke-linecap="round" />
</svg>
