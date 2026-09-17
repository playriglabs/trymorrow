<script lang="ts">
import { afterNavigate } from '$app/navigation'
import '../app.css'

let { children } = $props()

// html has smooth scrolling for in-page anchors, so SvelteKit's reset to the top on a new page
// animates from wherever the last page was, and the home page's pinned sections interrupt it
// partway down. Jump straight to the top instead. Back/forward keeps its restored position.
afterNavigate(({ type, to }) => {
  if (type === 'popstate' || type === 'enter' || to?.url.hash) return
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
})
</script>

{@render children()}
