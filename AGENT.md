# Agent guide

Read [README.md](./README.md) for setup, commands and env vars, [DESIGN.md](./DESIGN.md) for the design system, and [TODO.md](./TODO.md) for what's next. This file is what you need on top of those to change the code safely.

## Product in one paragraph

Morrow is a mobile-first PWA for gifting tokenized stocks (xStocks, plus PreStocks for private companies before they list) on Solana. A gift is locked to one recipient's wallet and only they can open it; unopened gifts go back to the sender after 30 days. People also buy and sell stocks with cash (USDC) through Jupiter. Built for the Solana Foundation Stocklana hackathon (deadline Fri 2026-09-18, 4pm ET), and meant to survive as a real product, so nothing should quietly cost us money.

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

| Module          | Owns                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http.ts`       | `route()` wrapper, `HttpError`, `badRequest`/`forbidden`/`notFound`, `readBody` (zod)                                                              |
| `privy.ts`      | Access-token auth, wallet lookup, `walletForEmail` (creates) vs `findWalletForEmail` (read-only)                                                   |
| `users.ts`      | Profile rows, `requireUser`, onboarding state                                                                                                      |
| `recipients.ts` | `@handle`/email resolution, `resolveGiftRecipients`                                                                                                |
| `rate-limit.ts` | Per-user fixed windows on the recipient lookup and the gift routes; in-memory, so a soft cap across instances                                      |
| `solana.ts`     | Relayer, `signRelayed` (simulate, size compute, sign), `sendRelayedTransaction` (resend loop), transaction parsing and verification                |
| `gifts.ts`      | Gift rows (`gift_items` embedded) to `GiftView`                                                                                                    |
| `fees.ts`       | Gift fee math, fee payment plan (cash, else shares), treasury accounts, fee transfer checks                                                        |
| `catalog.ts`    | xStocks, PreStocks and Backpack Securities from Jupiter's verified tokens (PreStocks cross-checked with their API), 5-minute cache, name overrides |
| `funds.ts`      | Fund rows, vault balances on-chain, `toFundView` (value, all-time change, contributors)                                                            |
| `prices.ts`     | Jupiter Price v3: `usdPrice` per share, `tokenPriceUsd` per raw token                                                                              |
| `jupiter.ts`    | Ultra `/order` and `/execute` (keyless `lite-api`), optional referral fee                                                                          |
| `trades.ts`     | Quotes, fair-price check (3%, fee excluded), fee-with-gasless-fallback, trade transaction checks                                                   |
| `charts.ts`     | Jupiter chart candles (per share, split-adjusted) with sanity checks, cached in `price_candles`                                                    |
| `notify.ts`     | The only way into the feed: settings filter, insert, then push and email for what happened while away                                              |
| `push.ts`       | Web push through VAPID; inert with no keys set, prunes subscriptions the browser dropped                                                           |
| `email.ts`      | Resend; inert with no key set, addresses read from the profile, never from the caller                                                              |
| `pnl.ts`        | Average-cost basis per stock from claimed gifts and `trade_fills`; no basis rather than a wrong one                                                |
| `posthog.ts`    | Analytics events from the routes that moved money; no keys means a no-op, amounts only as bands, people only by Privy id                           |

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
5. Claim is the same shape: `POST /api/gifts/[id]/claim` builds it, `submit` verifies and sends. Take-back mirrors it: `POST /api/gifts/[id]/refund` builds `refund_gift` with the sender as authority, `submit` verifies and sends, no notification (the sender is watching it happen).
6. `GET /api/cron/refund-gifts` (daily on Vercel, `Authorization: Bearer CRON_SECRET`) refunds expired gifts and deletes stale drafts. A gift closed on-chain but still pending in the DB is reconciled by reading its last on-chain transaction (`claimed` or `refunded`); the cron also scans up to 200 not-yet-expired pending gifts per run for the same problem.
7. Cash gifts ride this same flow. `findGiftAsset` (`catalog.ts`) resolves the USDC mint the way `findStock` resolves xStocks — every gift route, the views and the refund cron go through it, so a cash item is `gift_items` row with the USDC mint, nothing more (no `kind` column). Cash left after the gifts pays the fee first; any shortfall comes out of the cash locked for the recipients, so sending the whole balance still works. Cash is never a share-paid-fee candidate. `pnpm test:gifts` runs the gift flow on a throwaway validator with a plain SPL cash stand-in and fails if the biggest gift (2 stocks + cash + cash fee, measured 1,139 bytes) ever exceeds the byte limit.

### Send stocks out

`/send-stocks` is the cash out flow for shares, and it reuses its parts: `resolveCashoutTarget`
(address, @handle, or a Morrow user — never a pregenerated wallet) and `resolveDestination` (on
curve, unused or system-owned). `POST /api/stock-sends/quote` prices it, `POST /api/stock-sends`
records a draft row and returns the relayer-signed transfer, `POST /api/stock-sends/submit` reads
the signed transaction back and only broadcasts when the shares leave the sender's own account for
the mint, address and amount on that row, with nothing else but the recorded fee.

- The fee is only ever the unrecoverable part: opening a share account the destination doesn't
  have. Cash pays it when there is any, exactly like a gift; without cash it comes out of the
  shares themselves (`fee_mint` on the row), so sending an entire holding still works.
- A destination that already holds the stock is free.
- PreStocks carry the issuer's own transfer fee, so the screen says a little less than the amount
  sent will arrive. Never promise the full number.
- Both sides hear about it. The sender gets `stock_sent`; a destination that belongs to a Morrow
  account gets `stock_deposited` naming the sender, at the moment it lands. `noteDeposits` skips
  signatures found in `stock_sends` for exactly that reason — without it the same transfer would
  surface again days later as coming "from an outside account".

### Earn on cash

`/earn` lends idle cash through **Jupiter Lend Earn** (`lite-api.jup.ag/lend/v1`, keyless, program
`jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9`). No program change of ours: `POST /api/earn/move`
builds one relayer-signed transaction, the browser adds the person's signature, and
`POST /api/earn/submit` verifies and broadcasts it. Receipt tokens (jlUSDC) sit in the person's own
account, so the market is the only book — `GET /api/earn` reads the rate, the position and the
earnings back from it rather than from our database.

- Putting cash in needs the receipt account to exist, so the relayer opens it (idempotent, ~0.00204
  SOL). Taking **everything** back is asked for in receipt tokens (`redeem`) rather than dollars, so
  interest earned between building and signing can't strand a sliver, and the transaction closes the
  receipt account so that rent comes back to the relayer. A partial take-back uses `withdraw` and
  leaves the account open.
- Cash in Earn is **not** spendable cash: `cashBalance` only sees the plain balance, so gift fees,
  trades and "send the whole balance" all ignore it. The screen says which part is which.
- Say the rate is variable, never "savings" or "interest guaranteed", and say plainly that a
  take-back can wait if the market has lent out nearly everything.
- The screen lists Kamino and Save beside our rate (`earnRoutes`, read-only, cached 5 minutes) so
  "best rate" is something a person can check. Kamino was measured and rejected as a venue: its
  first deposit opens an obligation plus user metadata, 0.0250 SOL against Jupiter's 0.00149, for a
  lower rate. Before adding any venue, build one deposit and price the accounts it opens.

### Cash out flow

1. `POST /api/cashouts/quote` prices it: `planCashout` validates the address, checks the balance and returns the fee. Nothing is recorded.
2. `POST /api/cashouts` re-plans server-side, opens the destination's cash account if it needs one (its own relayer transaction, like `ensureTreasuryAccount`), records a draft row, and returns one relayer-signed transfer plus at most one fee transfer.
3. `POST /api/cashouts/submit` reads the signed transaction back and only broadcasts when the cash leaves the user's own account for the address and amount on the draft row, with nothing else but the recorded fee.

The address must be on-curve and either unused or system-owned, so a pasted cash-account address or a program is refused rather than sent to. That rules out multisigs; refusing what we can't check beats sending and hoping.

### After a gift is opened

An opened gift keeps being worth looking at: `/gift/[id]` shows what it was worth when it was sent,
what it's worth today and the change, then the recipient's note back to the giver. `toGiftViews`
computes `valueNow` from the amounts on the row, with any transfer fee taken off twice (into the
vault and out of it), and returns nothing rather than a number it can't price. The note is
`gifts.thanks_note`, written once by the recipient through `POST /api/gifts/[id]/thanks`, seen only
by the two of them, and it rides the sender's existing "they opened it" notification switch.

### Ask a friend

`/ask` builds a link to the asker's own handle page carrying the wish: `app.trymorrow.money/maya?stock=AAPLX&amount=25&note=Birthday`. Nothing is stored, so there's no row to abuse and no cleanup. `[handle].astro` renders the ask with its own OG preview and points at `/send` with the same values; `send-gift-screen.tsx` preselects the stock only when the sender actually holds it, and says so when they don't.

### Watchlists

Stocks someone follows without buying, grouped into named lists with an emoji. `lib/client/watchlists.ts` is the whole store: `localStorage` under `morrow.watchlists.v1.<privy user id>`, one store per account (the same identity `providers.tsx` scopes the query cache to), read through `useSyncExternalStore` so every screen and every tab of the app agrees. Signing in as someone else on the same phone therefore shows their own lists, not the last person's. Nothing reaches the server — it isn't money, and keeping it local costs nothing to run. `useWatchlists()` hands back the lists and the actions; nothing writes storage directly.

- At most `MAX_WATCHLISTS` (5) lists, names capped at `MAX_WATCHLIST_NAME` (16) so a tab never truncates. Unparseable or hand-edited storage is dropped entry by entry rather than thrown.
- The heart in the trade screen header opens `SaveToWatchlistSheet`; taps save immediately. With no lists yet it offers to make "Watching" ⭐️ in one tap instead of asking someone to name something first.
- `/watchlist` lists the baskets as tabs (scroll-snapped past three), swaps the stocks below as tabs change, and holds the edit sheet (rename, icon, delete) plus per-stock removal behind "Edit stocks".
- `WatchlistTabs` is shared: Home's "Watching" section shows the same baskets (no "New list" tab) and swaps its rows as they're picked. Prices come from the existing `/api/stocks`; Home only asks for them when something is actually being watched.
- Say "heart" and "list" on screen. Lists live on one device, and the screen says so.

### Share cards

`renderShareCard` (`lib/client/share-card.ts`) draws every shareable image on a canvas: eyebrow, hero, subhero, a cream receipt of labelled rows, and a footer with a code to the sharer's handle page. It shares its module grid with `qr-code.tsx` through `qr-layout.ts`, so both codes look the same.

**Every number on a card needs a label that says whose it is.** A bare percentage on a "Just bought" card reads as the sharer's return, and a fresh buy has none, so today's move goes in a row called "Today's move" rather than a pill. Gain and loss only work on the cream receipt; they don't pass AA on the orange panel.

### Analytics

PostHog, and only as much as it needs. The browser (`components/posthog.astro`) sends page views and unhandled errors; autocapture and session replay stay off because screens show balances, addresses and emails. Money events (`gift_sent`, `gift_claimed`, `gift_refunded`, `trade_completed`, `cashout_completed`, `fund_created`, `fund_contributed`, `fund_withdrawn`) come from the submit routes after the transaction lands, through `captureServerEvent`. Never send an email, handle, address or exact amount; use `usdBand`. Unset `PUBLIC_POSTHOG_PROJECT_TOKEN` or `PUBLIC_POSTHOG_HOST` turns it all off.

### Notifications

Everything goes through `notify()`. It reads `notification_settings` (no row means the defaults, all on), inserts the feed rows, and reaches out only for the kinds someone can switch off — those are exactly the things that happened while they were away, so a person's own buys and sends never buzz. Push needs `PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`; without them the feed still works and the browser is never asked for permission. `public/sw.js` holds the push handlers and the offline shell, and ships from `/public` unbundled.

Email rides the same switch plus `email_enabled`, and only when the call site wrote an `email` for that notification: a feed line is a glance, an email is an interruption, so each one is written on purpose. Four exist today — a gift arriving, cash arriving, shares arriving (named when they came from another Morrow account, anonymous when they came from outside) and someone adding to your fund. One of each per person per `notify()` call, so a run of deposits isn't a run of emails.

- `lib/email-template.ts` draws every one of them: an orange panel carrying the news, a cream receipt of labelled facts under it, one button. Same language as the share card. Tables and inline styles only — Gmail drops a `<style>` block — and no images, so nothing has to load before it reads. Aeonik and Pilat can't be loaded in mail, so the brand carries on colour and shape.
- `lib/server/email.ts` sends through Resend from `notification@send.trymorrow.money`. Addresses are read from `users.email` by id, never taken from the caller. Unset `RESEND_API_KEY` and nothing is sent; the feed and push are unaffected.
- `pnpm preview:emails` renders every template to `.email-preview/index.html` without sending anything. Add a sample there whenever you add an email.
- The word rules apply harder here than on screen: an inbox is outside the app, so still no token, wallet or network.

### Money rules (don't regress these)

- Rent locked in a gift account and its vault comes back to the relayer on claim or refund. It's working capital, not a cost.
- Opening a share account the recipient doesn't have yet (Token-2022 ATA, 179 bytes for xStocks) never comes back. The sender pays that plus network fees, at cost with 15% SOL price headroom. Gifts of stocks the recipient already holds are free.
- The fee is paid from cash left after the gift first. When the gift contains cash and that balance is short, the unpaid part is deducted from the cash each recipient gets; the full fee transfer remains in the transaction, so the sender never spends more than their balance. If reducing cash would empty a gift, shares can pay on top instead. Without a cash gift, the existing cash-then-shares rule applies. The client mirrors this in `send-gift-screen.tsx`; the server is authoritative.
- Trading fee: Jupiter referral fee only when the order stays gasless. JupiterZ (RFQ) can't carry integrator fees; if the fee order isn't gasless, fall back to fee-free and pause the fee for that pair for 10 minutes.
- A fund locks rent for years: the relayer pays it, and the creator pays what the fund account costs while the contributor pays for each new vault plus the account the beneficiary will need at unlock. `withdraw` closes the vaults and `close_fund` (daily cron) closes the fund, so the SOL comes home.
- Cashing out is free when the destination already has a cash account (the network fee is well under a cent). When it doesn't, the relayer opens one and that rent never comes back, so it's charged at cost — taken out of the amount, not added on top, so "All" always works.
- When you add an on-chain flow, decide who pays rent, whether it comes back, and charge unrecoverable costs at cost.

### Limits you'll hit

- Solana transactions cap at 1,232 bytes and we use no lookup tables. Measured: 3 stocks + cash fee = 1,159 bytes, 3 stocks + share fee = 1,097, claim of 3 = 859, contribute of 3 = 732, withdraw of 2 = 690, withdraw of 4 = 924. That's why `MAX_GIFT_STOCKS` and `MAX_FUND_STOCKS` (the mix) are 3, a fund keeps at most `MAX_FUND_HOLDINGS` (6) stocks, and withdrawals go out `MAX_WITHDRAWALS_PER_TRANSACTION` (4) at a time. `pnpm test:program` fails if a full batch ever goes over the limit. Measure again (build the transaction and serialize it) before adding accounts to a gift transaction.
- xStocks are Token-2022 with 8 decimals, a scaled UI amount multiplier, permanent delegate, pausable and an (unset) transfer hook. Use `TransferChecked` for Token-2022.
- Jupiter's `usdPrice` is per share, with the scaled UI multiplier applied (Netflix is ×10, OpenAI's PreStock ×1.49). Anything that works in raw amounts (fair-price check, fund vault values, share-paid fees) must use `tokenPriceUsd` from `getPriceData`/`getTokenPrices`. Convert raw balances to shares with `toUi`/`uiMultiplier`.
- Charts come from `datapi.jup.ag/v2/charts` (keyless, undocumented), so they cache per range and serve stale copies on 429s or outages. Intraday candles from a thin pool are real trades at prices nobody could trade out of — Alibaba's pool ran $117 to $263 and back in an hour — so `dropOutliers` (`charts.ts`) leaves out candles beyond `maxDeviation` from the window's median, and keeps everything when more than a fifth would go, because then the outliers are the market. Bands: 25% on 1D, 35% on 3D, 45% on 1W, 70% on 1M, none on daily candles. Measured across the catalog, a stock with a working market never reaches 5% over a day.
- Jupiter Ultra is deprecated in favour of Swap V2 (API key). It still works keyless.
- Gifts to an email must be opened by signing in with that email code. Google login creates a separate Privy user, so it won't see the gift.

### PreStocks

Tokenized pre-IPO shares (Anthropic, OpenAI, Kalshi…) from prestocks.com. They ride every existing flow (buy, sell, gift, gift card, fund) with no program change, but they differ from xStocks where it matters:

- **9 decimals and a Token-2022 transfer fee** on every move (the issuer raised it from 0.5% to 1% at epoch 1039; `transferFeeBps` takes the higher of the current and scheduled rates, so never hard-code the number). A gift arrives about 1% lighter (fee on the way into the vault and on the way out), a fund withdrawal likewise. The UI says so on the send screen and the stock page; never promise a recipient the full amount.
- **Vaults can't close while holding withheld fees** (`AccountHasWithheldTransferFees`). Every claim, refund, cron refund and withdrawal puts `harvestsBeforeClosing` (`tokens.ts`) in front, which adds a permissionless `HarvestWithheldTokensToMint` for transfer-fee mints only. `tokenTransfers` lets that instruction through and nothing else new. Any new flow that closes a vault needs the same.
- `LISTED_PRESTOCKS` in `catalog.ts` hides companies that have since listed as xStocks (SpaceX, xAI).
- **Logos are ours, not the issuer's.** Both Jupiter and PreStocks serve the company mark inside a PreStocks hexagon, so `PRESTOCK_LOGOS` (`catalog.ts`) points at the plain marks in `public/logos/prestocks/<SYMBOL>.png` instead. They're same-origin, so the share card canvas stays exportable; `/api/stocks/[mint]/logo` redirects rather than proxies, and the OG card resolves the path against `PUBLIC_APP_URL`. A new PreStock with no file falls back to the issuer's image. Marks that ship as black on white are repainted onto the company's own colour (OpenAI white on `#10A37F`, Anthropic black on kraft `#D4A27F`), so no logo reads as an empty white disc.
- `pnpm test:prestocks` runs gift, claim, refund and fund on a throwaway validator with a mint carrying the same fee, and asserts the recipient amounts to the unit. Measured: 3 PreStocks + cash fee = 1,171 bytes, withdrawing 3 with harvests = 828. The validator's Token-2022 lacks pausable and scaled UI, so those were covered by simulating create → harvest → claim/refund against the real mainnet mints (2026-09-17, all ok; without the harvest the claim fails).

### Backpack Securities

A third issuer of tokenized stocks, tagged `backpack` in Jupiter's verified list. The mints are the
same shape as xStocks — Token-2022, permanent delegate, pausable, unset transfer hook, no transfer
fee, scaled UI multiplier, 179-byte accounts — so they ride every flow with no program change. They
differ only in having 6 decimals instead of 8, which the catalog already reads per mint.

- **They are often where the trading actually is.** xStocks lists 929 mints and most have no pool:
  Roblox has $2 of liquidity as `RBLXx` against $128k as Backpack's `RBLX`, which is why a buy on
  our side showed no price. 36 companies are minted by both issuers.
- `markSuperseded` (`catalog.ts`) keeps the more liquid mint per ticker and flags the other.
  **Both stay in `byMint`**, so a holding, gift or fund of the thin one still has a name and a
  price; only browsing and buying (`/api/stocks`) skip it, unless the person holds it.
- `findStockByTicker` returns the most liquid mint because the catalog is sorted by liquidity, so
  `/trade/[ticker]`, `/holding/[ticker]` and an `/ask` link all land on the tradeable one.
- Logos come from `backpack.exchange/api/stock-logo/<TICKER>` (SVG, no CORS headers), so the host is
  allowlisted in `/api/stocks/[mint]/logo`, which proxies rather than redirects for exactly that
  reason — a cross-origin image taints the share-card canvas.
- These mints trade at a premium or discount to the issuer's mark (Roblox was +7% the day they were
  added). The 3% fair-price check in `trades.ts` compares against Jupiter's price, not the mark, so
  it isn't affected — but never show the mark as the price.
- `primeMints` (`tokens.ts`) reads every listed mint in one `getMultipleAccounts` call before the
  catalog asks for fees. One request per mint rate-limited the RPC: 23 of 55 failed.

## Don'ts

- Don't add token or wallet jargon to screens, even in error messages.
- Don't loosen `parseRelayedTransaction` or the `submit` checks to make something pass.
- Don't pregenerate Privy wallets outside actually sending a gift.
- Don't change an already-applied migration file; add a new one.
- Don't commit or push unless asked. Nothing is committed yet.
