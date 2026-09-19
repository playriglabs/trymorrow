<script lang="ts">
let { name, small = false }: { name: 'x' | 'reddit' | 'linkedin'; small?: boolean } = $props()

// Reddit's mark reads smaller than the others at the same box, so it gets a step up.
const sizes = {
  // svelte-ignore state_referenced_locally
  x: small ? 'size-4' : 'size-5',
  // svelte-ignore state_referenced_locally
  linkedin: small ? 'size-4' : 'size-5',
  // svelte-ignore state_referenced_locally
  reddit: small ? 'size-5' : 'size-6',
}
</script>

<span
  class="block shrink-0 bg-current {sizes[name]}"
  style:mask-image={`url('/${name}.svg')`}
  style:mask-repeat="no-repeat"
  style:mask-position="center"
  style:mask-size="contain"
  aria-hidden="true"
></span>
