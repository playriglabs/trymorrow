# Agent guide

Read [README.md](./README.md) for setup, commands and env vars, [DESIGN.md](./DESIGN.md) for the design system, and [TODO.md](./TODO.md) for what's next. This file is what you need on top of those to change the code safely.

## Product in one paragraph

Morrow is a mobile-first PWA for gifting tokenized stocks (xStocks) on Solana. A gift is locked to one recipient's wallet and only they can open it; unopened gifts go back to the sender after 30 days. People also buy and sell stocks with cash (USDC) through Jupiter. Built for the Solana Foundation Stocklana hackathon (deadline Fri 2026-09-18, 4pm ET), and meant to survive as a real product, so nothing should quietly cost us money.

## Rules that aren't negotiable

- **No crypto words in the UI.** Cash, not USDC. Shares, not tokens. Receipt, not transaction hash. Account, not wallet. The deposit screen is the only exception, because exchanges need the details.
- **Non-custodial, no KYC.** Money only moves from the user's own Privy embedded wallet, signed by them. The server builds transactions and the relayer co-signs; it never holds user funds.
- **Never print secrets.** Read `apps/app/.env` programmatically if you must (e.g. `node --env-file=.env`), print derived facts only (a hostname, a public key, whether a value is empty). Don't echo keys, RPC URLs with API keys, or `CRON_SECRET`.
- **Anything that spends SOL or touches mainnet state needs the user's go-ahead**: deploys, transfers, creating accounts from scripts. The app doing it in response to the user clicking is fine.
- **Code conventions**: kebab-case component files, `@/` imports in `apps/app` (never `../`), all browser fetching through React Query hooks in `@/lib/client/queries`. Match the surrounding comment style: comments explain why, not what.

## Environment gotchas

- The shell defaults to Node 20; the repo needs Node 24. Prefix commands with `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`.
- Solana CLI 2.1 lives in `~/.local/share/solana/install/active_release/bin`. The deployer keypair is `~/.config/solana/id.json`.
- macOS zsh: no `timeout`; unquoted `$VAR` doesn't word-split.
- Supabase migrations are applied by the user in the SQL editor, not `supabase db push`. Write new migrations as new files that are safe to re-run (`if not exists`), end them with `notify pgrst, 'reload schema';`, and check they landed through the service-role REST API.

## Verify every change

```sh
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
pnpm exec biome check --write apps/app/src packages/sdk   # lint + format
cd apps/app && pnpm exec astro check                      # 0 errors expected
pnpm exec astro build                                     # must complete
```

Program changes: `pnpm build:program`, then confirm the discriminators in `programs/target/idl/morrow.json` match `packages/sdk/src/program.ts`.

## On-chain facts

| What              | Value                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------- |
| Program           | `AjwKavx3r4NJ9tgmjxv24mCpFLp2QMnKzcRC5J7vaupa` (mainnet, 312,080 bytes, ~1.59 SOL rent) |
| Upgrade authority | `2eBHmEyWnBdBSvPUY7xjXXwtGCEVt2GApXaU5qeuf19A` (deployer, `~/.config/solana/id.json`)   |
| Relayer           | `F87G3CmAhmhTAQGtzxrQNrdKmD4QfSRKCBHbD6e7utKi` (key in `.env`, pays fees and rent)      |
| Treasury          | `TREASURY_WALLET`, defaults to the relayer                                              |
| RPC               | Helius mainnet                                                                          |

- Instructions: `create_gift`, `claim_gift`, `refund_gift` (sender any time, anyone after expiry), `create_fund`, `contribute` (anyone, any stock, vault opened on first use), `withdraw` (beneficiary, after `unlock_at`, closes the vault) and `close_fund` (rent payer, once `vaults` is 0).
- The fund instructions are live: extended by 54,848 bytes and upgraded on 2026-09-15 (`4xVMU1NAwwxD8xKwgNdPYcbxuiiEXmWoJFHibH2u9eTo4BhLmxA84rpRFoBCEGX1BU5xxarTXfmyGgQtFREivVKG`). The on-chain bytecode was dumped and compared byte for byte with `programs/target/deploy/morrow.so`, and `create_fund` simulates clean at 12,539 compute units.
- Deploying through Helius needs `--use-rpc --with-compute-unit-price 50000`; without a priority fee the write transactions die with `Max retries exceeded` and strand a buffer. If that happens, `solana program show --buffers` then `solana program close <address>` gets the SOL back before retrying.
- `pnpm test:program` runs the fund flow end to end on a throwaway validator (several contributors, early withdrawal refused, withdrawal at unlock, rent returned). The same flow was run once on mainnet against a real xStock on 2026-09-15 and cost 0.000068 SOL in fees with all rent returned.
- The program is built with `opt-level = "s"` and deployed with `--max-len` equal to its size. A bigger build needs `solana program extend` before upgrading.
- The SDK hand-encodes Anchor discriminators and accounts. If you change an instruction's accounts or args, update `packages/sdk/src/instructions.ts` and re-check against the IDL.

## How the app is put together

`apps/app` is Astro 7 SSR with React islands (`client:only="react"`, wrapped in `withProviders`). Pages in `src/pages`, API routes in `src/pages/api`, screens in `src/components/screens`.

Server modules in `src/lib/server`:

| Module          | Owns                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `http.ts`       | `route()` wrapper, `HttpError`, `badRequest`/`forbidden`/`notFound`, `readBody` (zod)                                               |
| `privy.ts`      | Access-token auth, wallet lookup, `walletForEmail` (creates) vs `findWalletForEmail` (read-only)                                    |
| `users.ts`      | Profile rows, `requireUser`, onboarding state                                                                                       |
| `recipients.ts` | `@handle`/email resolution, `resolveGiftRecipients`                                                                                 |
| `solana.ts`     | Relayer, `signRelayed` (simulate, size compute, sign), `sendRelayedTransaction` (resend loop), transaction parsing and verification |
| `gifts.ts`      | Gift rows (`gift_items` embedded) to `GiftView`                                                                                     |
| `fees.ts`       | Gift fee math, fee payment plan (cash, else shares), treasury accounts, fee transfer checks                                         |
| `catalog.ts`    | xStocks list from Jupiter's verified tokens, 5-minute cache, name overrides                                                         |
| `funds.ts`      | Fund rows, vault balances on-chain, `toFundView` (value, all-time change, contributors)                                             |
| `prices.ts`     | Jupiter Price v3                                                                                                                    |
| `jupiter.ts`    | Ultra `/order` and `/execute` (keyless `lite-api`), optional referral fee                                                           |
| `trades.ts`     | Quotes, fair-price check (3%, fee excluded), fee-with-gasless-fallback, trade transaction checks                                    |
| `charts.ts`     | GeckoTerminal OHLCV with pool selection and sanity checks, cached in `price_candles`                                                |
| `notify.ts`     | The only way into the feed: settings filter, insert, then push for what happened while away                                         |
| `push.ts`       | Web push through VAPID; inert with no keys set, prunes subscriptions the browser dropped                                            |
| `pnl.ts`        | Average-cost basis per stock from claimed gifts and `trade_fills`; no basis rather than a wrong one                                 |

### Fund flow

1. `POST /api/funds` records the fund (beneficiary wallet and unlock date fixed there, never changeable) and returns `create_fund` plus the creator's cash fee, relayer-signed.
2. `POST /api/funds/[id]/buy` splits cash by the fund's mix and returns one gasless Jupiter order per stock; the browser signs each and sends it through `POST /api/trades/submit`.
3. `POST /api/funds/[id]/contribute` records draft contribution rows and returns one `contribute` per stock plus the contributor's fee; `POST /api/funds/[id]/submit` verifies mint and amount against those rows before broadcasting. Contributions aren't limited to the mix: anyone can put in shares they already hold, up to the fund's six-stock cap, and `POST /api/funds/[id]/quote` prices it first.
4. `POST /api/funds/[id]/withdraw` returns one transaction per batch of four vaults, emptied to the beneficiary only after the unlock date. `submit` accepts a partial withdrawal and only marks the fund withdrawn when the last vault is gone.
5. `GET /api/cron/funds` (daily) flags funds that have reached their unlock date and closes emptied ones so the rent comes back.

### Gift flow

1. `POST /api/gifts/quote` shows the fee before sending (never pregenerates wallets).
2. `POST /api/gifts` resolves recipients (pregenerating Privy wallets for new emails), checks balances, plans the fee, inserts one `gifts` row per recipient with its `gift_items`, and returns one relayer-signed transaction per recipient: one `create_gift` per stock plus at most one fee transfer.
3. The browser adds the sender's signature (Privy, no UI) and calls `POST /api/gifts/[id]/submit`.
4. `submit` re-reads the transaction and only broadcasts if it's exactly one expected action per gift item, all the same kind, and the only token instruction is the recorded fee transfer. Keep that check strict when adding features.
5. Claim is the same shape: `POST /api/gifts/[id]/claim` builds it, `submit` verifies and sends.
6. `GET /api/cron/refund-gifts` (daily on Vercel, `Authorization: Bearer CRON_SECRET`) refunds expired gifts and deletes stale drafts.

### Ask a friend

`/ask` builds a link to the asker's own handle page carrying the wish: `morrow.fi/maya?stock=AAPLX&amount=25&note=Birthday`. Nothing is stored, so there's no row to abuse and no cleanup. `[handle].astro` renders the ask with its own OG preview and points at `/send` with the same values; `send-gift-screen.tsx` preselects the stock only when the sender actually holds it, and says so when they don't.

### Share cards

`renderShareCard` (`lib/client/share-card.ts`) draws every shareable image on a canvas: eyebrow, hero, subhero, a cream receipt of labelled rows, and a footer with a code to the sharer's handle page. It shares its module grid with `qr-code.tsx` through `qr-layout.ts`, so both codes look the same.

**Every number on a card needs a label that says whose it is.** A bare percentage on a "Just bought" card reads as the sharer's return, and a fresh buy has none, so today's move goes in a row called "Today's move" rather than a pill. Gain and loss only work on the cream receipt; they don't pass AA on the orange panel.

### Notifications

Everything goes through `notify()`. It reads `notification_settings` (no row means the defaults, all on), inserts the feed rows, and pushes only the kinds someone can switch off — those are exactly the things that happened while they were away, so a person's own buys and sends never buzz. Push needs `PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`; without them the feed still works and the browser is never asked for permission. `public/sw.js` holds the push handlers and the offline shell, and ships from `/public` unbundled.

### Money rules (don't regress these)

- Rent locked in a gift account and its vault comes back to the relayer on claim or refund. It's working capital, not a cost.
- Opening a share account the recipient doesn't have yet (Token-2022 ATA, 179 bytes for xStocks) never comes back. The sender pays that plus network fees, at cost with 15% SOL price headroom. Gifts of stocks the recipient already holds are free.
- The fee is paid in cash first, otherwise in shares of the gift's stock with the most left over, always on top of the gift. The client mirrors this in `send-gift-screen.tsx`; the server is authoritative.
- Trading fee: Jupiter referral fee only when the order stays gasless. JupiterZ (RFQ) can't carry integrator fees; if the fee order isn't gasless, fall back to fee-free and pause the fee for that pair for 10 minutes.
- A fund locks rent for years: the relayer pays it, and the creator pays what the fund account costs while the contributor pays for each new vault plus the account the beneficiary will need at unlock. `withdraw` closes the vaults and `close_fund` (daily cron) closes the fund, so the SOL comes home.
- When you add an on-chain flow, decide who pays rent, whether it comes back, and charge unrecoverable costs at cost.

### Limits you'll hit

- Solana transactions cap at 1,232 bytes and we use no lookup tables. Measured: 3 stocks + cash fee = 1,159 bytes, 3 stocks + share fee = 1,097, claim of 3 = 859, contribute of 3 = 732, withdraw of 2 = 690, withdraw of 4 = 924. That's why `MAX_GIFT_STOCKS` and `MAX_FUND_STOCKS` (the mix) are 3, a fund keeps at most `MAX_FUND_HOLDINGS` (6) stocks, and withdrawals go out `MAX_WITHDRAWALS_PER_TRANSACTION` (4) at a time. `pnpm test:program` fails if a full batch ever goes over the limit. Measure again (build the transaction and serialize it) before adding accounts to a gift transaction.
- xStocks are Token-2022 with 8 decimals, a scaled UI amount multiplier, permanent delegate, pausable and an (unset) transfer hook. Jupiter prices are per unscaled token; convert with `toUi`/`uiMultiplier` in `tokens.ts` before showing shares. Use `TransferChecked` for Token-2022.
- GeckoTerminal's free tier is ~8 calls a minute and about six months of history, so charts cache per range and serve stale copies on 429s.
- Jupiter Ultra is deprecated in favour of Swap V2 (API key). It still works keyless.
- Gifts to an email must be opened by signing in with that email code. Google login creates a separate Privy user, so it won't see the gift.

## Don'ts

- Don't add token or wallet jargon to screens, even in error messages.
- Don't loosen `parseRelayedTransaction` or the `submit` checks to make something pass.
- Don't pregenerate Privy wallets outside actually sending a gift.
- Don't change an already-applied migration file; add a new one.
- Don't commit or push unless asked. Nothing is committed yet.
