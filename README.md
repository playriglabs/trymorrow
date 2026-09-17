# Morrow

Gift stocks that grow. Send a piece of a real company to anyone, and only they can open it. Built on Solana for the Stocklana hackathon.

pnpm monorepo. Design system lives in [DESIGN.md](./DESIGN.md). Working on the code (or an AI agent is)? Start with [AGENT.md](./AGENT.md). What's next is in [TODO.md](./TODO.md).

## Structure

| Path              | What                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `apps/landing`    | SvelteKit marketing site — prerendered HTML, sitemap, robots, SEO meta  |
| `apps/app`        | Astro 7 (SSR) + React islands — the mobile-first app, Privy login, API  |
| `packages/ui`     | Shared design tokens (`styles.css`) and fonts                           |
| `packages/sdk`    | TypeScript client for the on-chain program (PDAs, instructions, assets) |
| `programs/morrow` | Anchor program: recipient-bound gift escrow (mainnet)                   |
| `supabase`        | Postgres migrations and the `avatars` storage bucket                    |

## Setup

```sh
nvm use                          # Node 24
pnpm install                     # also installs lefthook git hooks
cp apps/app/.env.example apps/app/.env
```

Supabase: create a project, then `supabase link --project-ref <ref>` and `supabase db push` to apply `supabase/migrations`.

Program: needs the Solana CLI and Anchor 0.32.1. `pnpm build:program` uses platform-tools v1.51 because the default tools can't read edition-2024 crates; `programs/Cargo.lock` pins a few crates (blake3, zeroize, indexmap, proc-macro-crate) for the same reason, so keep it committed. The program keypair lives in `programs/target/deploy/morrow-keypair.json` (git-ignored) — back it up, it controls the program address.

## Commands

| Command              | Does                                                 |
| -------------------- | ---------------------------------------------------- |
| `pnpm dev`           | Run landing on :3000                                 |
| `pnpm dev:app`       | Run the app on :4321                                 |
| `pnpm generate`      | Static landing build to `apps/landing/build`         |
| `pnpm build`         | Build all apps                                       |
| `pnpm build:program` | Build the Anchor program and its IDL                 |
| `pnpm test:program`  | Run the fund flow on a throwaway local validator     |
| `pnpm typecheck`     | `svelte-check`, `astro check`, `tsc` across packages |
| `pnpm lint`          | Biome check + Prettier check                         |
| `pnpm format`        | Biome + Prettier write                               |

## How money moves

- **Cash** in the UI is USDC in the user's own Privy embedded wallet. Morrow never holds funds and does no KYC.
- **Stocks** are xStocks (Token-2022). Buying and selling are Jupiter swaps from the user's wallet.
- **Gifts** lock tokens in a program vault keyed to the recipient's wallet. Only that wallet can claim. Email recipients get a Privy-pregenerated wallet, so the gift is bound to their email before they ever sign up. Unclaimed gifts go back to the sender after expiry.
- **Fees and rent** are paid by a relayer wallet that co-signs transactions the server builds. Rent locked in a gift comes back when it's opened or refunded; the cost that doesn't come back (opening an account for the recipient) is charged at cost. Cash left after a gift pays first; when that balance is short, the rest of the fee comes out of the cash received so sending the whole balance still works. Otherwise a gift's shares can cover it. Gifts to accounts that already hold every asset are free.
- **Expired gifts** are refunded by a daily cron (`/api/cron/refund-gifts`).
- **Trading fee** is a Jupiter referral fee, applied only when the trade can stay gasless.

## Conventions

- Svelte component files use kebab-case: `hero-section.svelte`; landing components live in `apps/landing/src/lib/components`, never in `packages/ui`
- React component files in `apps/app` use kebab-case: `send-gift-screen.tsx` exports `SendGiftScreen`
- `apps/app` imports use the `@/` alias for `src/` (`@/components/ui`), never `../`
- Client data fetching goes through React Query hooks in `@/lib/client/queries`
- The UI never shows crypto words (token, wallet, USDC, Solana) except where an exchange requires them (deposit screen)

## Tooling

- **Tailwind CSS v4** — all styling via utilities; design tokens are the `@theme` in `packages/ui/src/styles.css` (default color palette disabled — only DESIGN.md colors)
- **Biome** — lint everything (incl. `<script>` in `.svelte` and `.astro`); format JS/TS/TSX/JSON/CSS
- **Prettier** — format `.svelte`, `.astro`, Markdown, YAML, HTML, and sort Tailwind classes (Biome-owned files are in `.prettierignore`)
- **Lefthook** — `pre-commit`: Biome then Prettier on staged files, re-stages fixes; `pre-push`: typecheck

## Environment

| Variable                    | App     | Notes                                                                                      |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `PUBLIC_SITE_URL`           | landing | Landing domain; defaults to `https://trymorrow.money` (app lives on `app.trymorrow.money`) |
| `PUBLIC_APP_URL`            | app     | Used for share links and OG tags                                                           |
| `PUBLIC_PRIVY_APP_ID`       | app     | Privy dashboard                                                                            |
| `PUBLIC_PRIVY_CLIENT_ID`    | app     | Optional                                                                                   |
| `PRIVY_APP_SECRET`          | app     | Server only                                                                                |
| `SUPABASE_URL`              | app     | Server only                                                                                |
| `SUPABASE_SERVICE_ROLE_KEY` | app     | Server only                                                                                |
| `SOLANA_RPC_URL`            | app     | Mainnet RPC                                                                                |
| `RELAYER_SECRET_KEY`        | app     | Base58 key of the fee and rent payer                                                       |
| `TREASURY_WALLET`           | app     | Receives gift fees; defaults to the relayer                                                |
| `CRON_SECRET`               | app     | Auth for the daily expired-gift refund cron                                                |
| `JUPITER_REFERRAL_ACCOUNT`  | app     | Jupiter Ultra referral account; enables fee                                                |
| `TRADE_FEE_BPS`             | app     | Trading fee, 50–255 bps (default 50)                                                       |
| `PUBLIC_VAPID_PUBLIC_KEY`   | app     | Web push public key; unset = no phone alerts                                               |
| `VAPID_PRIVATE_KEY`         | app     | Web push private key                                                                       |
| `VAPID_SUBJECT`             | app     | `mailto:` we identify ourselves to push with                                               |
