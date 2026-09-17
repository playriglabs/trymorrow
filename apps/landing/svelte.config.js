import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Landing pages are static HTML at build time for SEO. No options: the defaults write to
    // `build` locally, and on Vercel any option turns off zero-config, which leaves the
    // deployment empty
    adapter: adapter(),
  },
}

export default config
