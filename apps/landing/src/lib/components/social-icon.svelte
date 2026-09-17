<script lang="ts">
let { name }: { name: 'x' | 'reddit' | 'linkedin' } = $props()
</script>

<span
  class="block shrink-0 bg-current"
  class:size-5={name === 'x' || name === 'linkedin'}
  class:size-6={name === 'reddit'}
  style:mask-image={`url('/${name}.svg')`}
  style:mask-repeat="no-repeat"
  style:mask-position="center"
  style:mask-size="contain"
  aria-hidden="true"
></span>
