import react from '@astrojs/react'
import vercel from '@astrojs/vercel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, envField } from 'astro/config'

export default defineConfig({
  // Gift and profile links render on the server so chat apps get real previews
  output: 'server',
  prefetch: { defaultStrategy: 'hover' },
  // Vite 8 answers the toolbar's `/@id/` script with 504 "Outdated Optimize Dep" on every page,
  // even right after a clean start. The app never used the toolbar.
  devToolbar: { enabled: false },
  adapter: vercel({ maxDuration: 120 }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // Every page is a client-only React island, and screens load lazily, so Vite's startup scan
    // misses their dependencies. One found after the first page loads re-bundles everything and
    // the page already running gets a 504 "Outdated Optimize Dep". List every package the
    // browser imports so the bundle is complete before the first request.
    optimizeDeps: {
      include: [
        '@phosphor-icons/react',
        '@privy-io/react-auth',
        '@privy-io/react-auth/solana',
        '@tanstack/react-query',
        'clsx',
        'ldrs/react',
        'qrcode',
        'react',
        'react-confetti',
        'react-dom',
        'react-dom/client',
        'react-easy-crop',
        'react/jsx-dev-runtime',
        'react/jsx-runtime',
        'ts-pattern',
      ],
    },
  },
  env: {
    schema: {
      PUBLIC_APP_URL: envField.string({
        context: 'client',
        access: 'public',
        default: 'http://localhost:4321',
      }),
      PUBLIC_PRIVY_APP_ID: envField.string({ context: 'client', access: 'public' }),
      PUBLIC_PRIVY_CLIENT_ID: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      // VAPID public key the browser needs to subscribe to push. Unset means no phone
      // notifications: the feed still works, the app just never asks for permission.
      PUBLIC_VAPID_PUBLIC_KEY: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PRIVY_APP_SECRET: envField.string({ context: 'server', access: 'secret' }),
      SUPABASE_URL: envField.string({ context: 'server', access: 'secret' }),
      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: 'server', access: 'secret' }),
      SOLANA_RPC_URL: envField.string({ context: 'server', access: 'secret' }),
      // Base58 secret key of the wallet that pays network fees and rent for users.
      // Optional so login/profile work before the relayer is funded; gift routes need it.
      RELAYER_SECRET_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      // Where gift fees (cash) go. Defaults to the relayer, which is what spends SOL on gifts.
      TREASURY_WALLET: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Vercel sends it as a bearer token to cron routes (refunding expired gifts)
      CRON_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Jupiter Referral Program account under the Ultra project; unset means no trading fee
      JUPITER_REFERRAL_ACCOUNT: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      // Private half of the VAPID pair, and the mailto: we identify ourselves with. Both
      // needed to send a push; without them notifications stay in the feed.
      VAPID_PRIVATE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      VAPID_SUBJECT: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Financial Modeling Prep key, for the one-line company descriptions on a stock page.
      // Unset means no descriptions: every stock page just leaves the section out.
      FMP_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Our trading fee in basis points; Jupiter allows 50-255 and keeps 20% of it
      TRADE_FEE_BPS: envField.number({
        context: 'server',
        access: 'secret',
        default: 50,
        int: true,
        gte: 50,
        lte: 255,
      }),
    },
  },
})
