# Agent guide

Read [README.md](./README.md) for setup, commands and env vars, [DESIGN.md](./DESIGN.md) for the design system, and [TODO.md](./TODO.md) for what's next. This file is what you need on top of those to change the code safely.

## Product in one paragraph

Morrow is a mobile-first PWA for gifting tokenized stocks (xStocks, plus PreStocks for private companies before they list) on Solana. A gift is locked to one recipient's wallet and only they can open it; unopened gifts go back to the sender after 30 days. People also buy and sell stocks with cash (USDC) through Jupiter. Built for the Solana Foundation Stocklana hackathon (deadline Fri 2026-09-25, 4pm ET), and meant to survive as a real product, so nothing should quietly cost us money.

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

| Module            | Owns                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `http.ts`         | `route()` wrapper, `HttpError`, `badRequest`/`forbidden`/`notFound`, `readBody` (zod)                                                                                          |
| `privy.ts`        | Access-token auth, wallet lookup, `walletForEmail` (creates) vs `findWalletForEmail` (read-only)                                                                               |
| `users.ts`        | Profile rows, `requireUser`, onboarding state                                                                                                                                  |
| `recipients.ts`   | `@handle`/email/Telegram-name resolution, `resolveGiftRecipients`                                                                                                              |
| `rate-limit.ts`   | Per-user fixed windows on the recipient lookup and the gift routes; in-memory, so a soft cap across instances                                                                  |
| `solana.ts`       | Relayer, `signRelayed` (simulate, size compute, sign), `sendRelayedTransaction` (resend loop), transaction parsing and verification                                            |
| `gifts.ts`        | Gift rows (`gift_items` embedded) to `GiftView`                                                                                                                                |
| `fees.ts`         | Gift fee math, fee payment plan (cash, else shares), treasury accounts, fee transfer checks                                                                                    |
| `catalog.ts`      | xStocks, PreStocks and Backpack Securities from Jupiter's verified tokens (PreStocks cross-checked with their API), 5-minute cache, name overrides                             |
| `funds.ts`        | Fund rows, vault balances on-chain, `toFundView` (value, all-time change, contributors)                                                                                        |
| `prices.ts`       | Jupiter Price v3: `usdPrice` per share, `tokenPriceUsd` per raw token                                                                                                          |
| `jupiter.ts`      | Ultra `/order` and `/execute` (keyless `lite-api`), optional referral fee                                                                                                      |
| `trades.ts`       | Quotes, fair-price check (3%, fee excluded, plus 10% over the listed stock for buys), fee-with-gasless-fallback, weekend no-route as "market closed", trade transaction checks |
| `listed-price.ts` | The real stock's exchange price from FMP, trusted only when the company name matches; 10-minute cache, null when unknown                                                       |
| `charts.ts`       | Jupiter chart candles (per share, split-adjusted) with sanity checks, cached in `price_candles`                                                                                |
| `notify.ts`       | The only way into the feed: settings filter, insert, then push and email for what happened while away                                                                          |
| `push.ts`         | Web push through VAPID; inert with no keys set, prunes subscriptions the browser dropped                                                                                       |
| `telegram.ts`     | Phone-notification routing: a bot message for whoever `users.telegram_user_id` names, web push for everyone else                                                               |
| `email.ts`        | Resend; inert with no key set, addresses read from the profile, never from the caller                                                                                          |
| `pnl.ts`          | Average-cost basis per stock from claimed gifts and `trade_fills`; no basis rather than a wrong one                                                                            |
| `posthog.ts`      | Analytics events from the routes that moved money; no keys means a no-op, amounts only as bands, people only by Privy id                                                       |

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

### Cash against shares

`/borrow` is the other side of Earn: shares stay, cash comes out. It runs on **Kamino's isolated
xStocks market** (`5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua`, program
`KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD`), so no program change of ours: the shares back the
loan inside the market, the cash lands in the person's own account, and `lib/server/borrow.ts`
only builds what they sign. The market is the book — `GET /api/borrow` reads the terms, the
position and the debt back from it, and we record nothing.

- **Ten stocks, not 188**, and each has its own numbers: loan-to-value 30–73%, liquidation
  threshold 40–90%, per-stock deposit caps. `borrowMarket()` reads them live and hides a reserve
  that is paused, full or takes no collateral. For 9 of the 10 our catalog already prefers the same
  mint Kamino takes; a Backpack mint of the same company is not collateral.
- **The relayer pays the rent, as everywhere else.** `initUserMetadata`, `initObligation` and the
  debt farm state each take a fee payer apart from the owner, and `split()` swaps the relayer into
  that slot by instruction label. The obligation (0.01764 SOL) and the metadata (0.00589) have no
  close instruction in `klend-sdk` v12, so `loanSetupFee` charges those at cost, once, out of the
  cash borrowed. Every later loan is free.
- **Two transactions the first time.** The account openings and the money don't fit together
  (1,367 bytes). `POST /api/borrow/open` returns `setup` and `transaction`; the browser signs and
  submits them in that order. The money transaction can't be simulated before the accounts exist,
  so it is built with `buildRelayedTransaction(..., { simulate: false })`.
- **Sizes are tight**: money 1,137 bytes bare, 1,184 with the fee, 1,211 with a cash-account
  opening, against 1,232. That's why the opening rides with the setup, and why a second collateral
  stock is refused (`one_stock_only`) — each adds a refresh instruction to everything after it.
- `POST /api/borrow/submit` allows only the lending program, the farms program, the token and
  associated-token programs and the compute budget, no lookup tables, relayer first and the person
  signing — and the only token transfer it accepts is our own fee into the treasury.
- **Say what liquidation is, in plain words**: if the shares fall far enough they are sold to cover
  the loan, and that sale costs up to 10%. The screens show the price the stock would have to reach
  and the percent fall that gets there; never show a loan without it.
- Not yet: nothing has run on mainnet, nobody is warned as a loan gets close, and the debt farm
  state's 0.00532 SOL isn't reclaimed on full repayment. See TODO.

### Orders at a price

The trade screen's "At a price" mode places limit orders through **Jupiter Trigger V1**
(`lite-api.jup.ag/trigger/v1`, keyless, program `j1o2qRpjcyUwEvwtcfhEQefh773ZgjxcVRry7LDqg5X`).
V2 was rejected: it needs an API key and holds the money in a custodial vault. In V1 the order and
its escrow are accounts of Jupiter's program that only the person can cancel, and Jupiter's keepers
fill it. `lib/server/limit-orders.ts` builds, `POST /api/limit-orders/submit` verifies and sends.

- **Jupiter's transaction is rebuilt, not passed through.** It makes the maker pay the network fee
  and fund the idempotent account opening; `relayedInstructions` keeps only the order program's
  instruction, points the account opening at the relayer and signs it with our compute budget.
- **The order is exact, so a keeper keeps anything the market gives on top.** That's why the server
  refuses a buy at or over today's price and a sell at or under it — both would fill immediately and
  hand the difference away. Minimum $5 (Jupiter's). PreStocks can't be used (transfer fee).
- **The typed price is when it fills, not what it pays.** A keeper can only pay the order's price
  once a real trade of that size gets there, after the size moves the pool and Jupiter's 0.1%. An
  order at exactly the typed price therefore sat unfilled while the screen showed the price past it
  (CYPH, 2026-09-22: $3.76 ask, ~0.6% short at $3.78). `marketGap` prices the same trade through
  Ultra now and places the order at `limit × gap`, so it fills when today's price reaches the limit;
  the review screen shows the cost as "Market costs" and what they get after it. Over 3% the market
  is too thin and the order is refused (`thin_market`). `limit_orders.limit_price_usd` keeps the
  typed price, and that's what the screens show.
- **Rent goes back to the maker, never the payer.** Measured on mainnet 2026-09-22 with the relayer
  as payer: placing cost it 0.005638 SOL (order 0.00254, escrow 0.00149, the TSLAx account the order
  pays into 0.00156, fees), and cancelling returned 0.004028 to the maker. So `limitOrderFee` charges
  that rent at cost on someone's first order, and once their SOL covers it (`rentFromWallet`) the next
  order has them pay the rent themselves and costs nothing, bar a new payout account.
- The fee comes out of cash; a sell without cash pays it in the shares on offer.
- Jupiter is the book for what an order holds; `limit_orders` records whose it is, what it was
  placed as, when it runs out and what the feed has said. `POST /api/limit-orders` writes a draft
  row, `submit` only sends a transaction naming that row's order and marks it open or cancelled.
- `syncLimitOrders` catches up whenever someone looks (portfolio, trade history, order list; once a
  minute per person): fills reach `trade_fills` keyed by their signature, net of Jupiter's fee, so
  cost basis and trade history see them, and each order that ended is told once. `depositIn`
  ignores anything the order program did, so a fill or a cancel is never "cash arrived".
- **Order notifications are feed only** (`order_placed`, `order_filled`, `order_expired`,
  `order_cancelled`, none of them in `notify`'s toggles): no push, no Telegram, no email.
- **Expiry** is 1 day, 1 week, 1 month or none, sent as `expiredAt` (unix seconds as a _string_;
  Jupiter rejects a number). What V1 does with an expired order isn't documented and hasn't been
  seen: the code handles both a Jupiter-closed `Expired` order (money back, said so) and one still
  open past its date (shown as "Ran out", with "Take back" running the cancel).
- Not yet: nothing reaches someone who never opens the app, since there's no cron under daily.

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

### Telegram

The app also runs as a Telegram Mini App, and Telegram names work wherever a handle does. No bot code runs in this repo — the setup lives in BotFather and the Privy dashboard (checklist in TODO).

- **Login is Privy's seamless Telegram auth.** With `'telegram'` in `loginMethods`, Privy reads the Mini App launch params itself and logs the person in with no UI, creating the same embedded Solana wallet as email; every server route is unchanged. The bot's credentials and the seamless toggle are in the Privy dashboard, and the bot's domain is set with `/setdomain`.
- **`telegram-web-app.js` loads only when Telegram is actually there.** The detection script in `app-layout.astro` looks for `tgWebAppData` in the URL (query on current clients, hash on old ones), sets `window.__morrowTelegram` and then loads the script for the one thing Privy doesn't do: `ready()`, `expand()`, `disableVerticalSwipes()` and the cream header colour. `lib/client/telegram.ts` is how anything else asks "are we inside Telegram?".
- **Web push is off inside Telegram** (`pushAvailable` checks `inTelegram()`): the webview never offers it. Their phone notifications are bot messages instead — the layout asks once, ever, with `Telegram.WebApp.requestWriteAccess()` (bots can't write otherwise), `syncUser` stores the Telegram person into `users.telegram_user_id`, and `sendPhoneNotifications` (`telegram.ts`) sends a message through the Bot API in place of the web push, falling back to it whenever the bot can't write. A bot that gets blocked loses the link, never the notification.
- **A Telegram name resolves only to someone who has already signed in.** `telegramRowByUsername` (`users.ts`) maps a Telegram username through Privy to our row, and never creates or pregenerates anything — the opposite of email, which pregenerates so a gift can wait. Names 11–32 characters (longer than any handle) parse as Telegram outright; shorter ones fall back to Telegram only when no Morrow handle matches, and never when the word is one of `RESERVED_HANDLES`. Gifts, cash outs and share sends all resolve the same way, so `resolveCashoutTarget` and `resolveGiftRecipients` agree on who a name is.

### Watchlists

Stocks someone follows without buying, grouped into named lists with an emoji. `lib/client/watchlists.ts` is the whole store: `localStorage` under `morrow.watchlists.v1.<privy user id>`, one store per account (the same identity `providers.tsx` scopes the query cache to), read through `useSyncExternalStore` so every screen and every tab of the app agrees. Signing in as someone else on the same phone therefore shows their own lists, not the last person's. Nothing reaches the server — it isn't money, and keeping it local costs nothing to run. `useWatchlists()` hands back the lists and the actions; nothing writes storage directly.

- At most `MAX_WATCHLISTS` (5) lists, names capped at `MAX_WATCHLIST_NAME` (16) so a tab never truncates. Unparseable or hand-edited storage is dropped entry by entry rather than thrown.
- The heart in the trade screen header opens `SaveToWatchlistSheet`; taps save immediately. With no lists yet it offers to make "Watching" ⭐️ in one tap instead of asking someone to name something first.
- `/watchlist` lists the baskets as tabs (scroll-snapped past three), swaps the stocks below as tabs change, and holds the edit sheet (rename, icon, delete) plus per-stock removal behind "Edit stocks".
- `WatchlistTabs` is shared: Home's "Watching" section shows the same baskets (no "New list" tab) and swaps its rows as they're picked. Prices come from the existing `/api/stocks`; Home only asks for them when something is actually being watched.
- Say "heart" and "list" on screen. Lists live on one device, and the screen says so.

### Share cards

`renderShareCard` (`lib/client/share-card.ts`) draws every shareable image on a canvas: eyebrow, hero, subhero, a cream receipt of labelled rows, and a footer with a code to the sharer's handle page. It shares its module grid with `qr-code.tsx` through `qr-layout.ts`, so both codes look the same.

The ticker sits on the hero's own baseline, to its right and smaller — "+6.7% $HOOD" — so the
line under the hero is the hero's to use. `subhero` is that ticker; an empty string drops it.

**Every number on a card needs a label that says whose it is.** A bare percentage on a "Just bought" card reads as the sharer's return, and a fresh buy has none, so today's move goes in a row called "Today's move" rather than a pill. Gain and loss only work on the cream receipt; they don't pass AA on the orange panel.

### Analytics

PostHog, and only as much as it needs. The browser (`components/posthog.astro`) sends page views and unhandled errors; autocapture and session replay stay off because screens show balances, addresses and emails. Money events (`gift_sent`, `gift_claimed`, `gift_refunded`, `trade_completed`, `cashout_completed`, `fund_created`, `fund_contributed`, `fund_withdrawn`) come from the submit routes after the transaction lands, through `captureServerEvent`. Never send an email, handle, address or exact amount; use `usdBand`. Unset `PUBLIC_POSTHOG_PROJECT_TOKEN` or `PUBLIC_POSTHOG_HOST` turns it all off.

### Notifications

Everything goes through `notify()`. It reads `notification_settings` (no row means the defaults, all on), inserts the feed rows, and reaches out only for the kinds someone can switch off — those are exactly the things that happened while they were away, so a person's own buys and sends never buzz. The phone half is routed by `telegram.ts`: someone who signed in from the Mini App gets a Telegram message from the bot (`TELEGRAM_BOT_TOKEN`, unset means nobody does, same settings as push), everyone else web push, which needs `PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`; without either the feed still works and the browser is never asked for permission. `public/sw.js` holds the push handlers and the offline shell, and ships from `/public` unbundled.

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
- Fees arrive as cash but the relayer spends SOL. `GET /api/cron/relayer-sol` (daily) swaps the treasury's cash to SOL through Jupiter Ultra when the relayer drops under 0.1 SOL, aiming for 0.25 and at most $50 a run. It only runs while the treasury is the relayer: a separate `TREASURY_WALLET` is a key this app never signs for.

### Limits you'll hit

- Solana transactions cap at 1,232 bytes and we use no lookup tables. Measured: 3 stocks + cash fee = 1,159 bytes, 3 stocks + share fee = 1,097, claim of 3 = 859, contribute of 3 = 732, withdraw of 2 = 690, withdraw of 4 = 924. That's why `MAX_GIFT_STOCKS` and `MAX_FUND_STOCKS` (the mix) are 3, a fund keeps at most `MAX_FUND_HOLDINGS` (6) stocks, and withdrawals go out `MAX_WITHDRAWALS_PER_TRANSACTION` (4) at a time. `pnpm test:program` fails if a full batch ever goes over the limit. Measure again (build the transaction and serialize it) before adding accounts to a gift transaction.
- xStocks are Token-2022 with 8 decimals, a scaled UI amount multiplier, permanent delegate, pausable and an (unset) transfer hook. Use `TransferChecked` for Token-2022.
- Jupiter's `usdPrice` is per share, with the scaled UI multiplier applied (Netflix is ×10, OpenAI's PreStock ×1.49). Anything that works in raw amounts (fair-price check, fund vault values, share-paid fees) must use `tokenPriceUsd` from `getPriceData`/`getTokenPrices`. Convert raw balances to shares with `toUi`/`uiMultiplier`.
- Charts come from `datapi.jup.ag/v2/charts` (keyless, undocumented), so they cache per range and serve stale copies on 429s or outages. Intraday candles from a thin pool are real trades at prices nobody could trade out of — Alibaba's pool ran $117 to $263 and back in an hour — so `dropOutliers` (`charts.ts`) leaves out candles beyond `maxDeviation` from the window's median, and keeps everything when more than a fifth would go, because then the outliers are the market. Bands (a ratio either way from the median): 25% on 1D, 35% on 3D, 45% on 1W, 70% on 1M, 4x on daily candles. A thin pool (under `LOW_LIQUIDITY_USD`) whose window still doesn't hold together gets no pool chart at all — Applied Materials' xStock had $2 of liquidity and five trades between $731 and $15,395 — so it falls back to the listed stock's closes or says there's no reliable history. Measured across the catalog, a stock with a working market never reaches 5% over a day.
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
