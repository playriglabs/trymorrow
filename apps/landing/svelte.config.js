import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Landing pages are static HTML at build time for SEO
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      strict: true,
    }),
  },
}

export default config
