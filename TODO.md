# TODO

What's left, in the order it matters. Hackathon deadline: **Fri 2026-09-18, 4pm ET**.

## P0 — before submitting

- [x] **Test the remaining gift paths on mainnet** (a single-stock gift already works)
  - [x] Gift with 3 stocks at once: confirms the 400k compute ceiling and 1,232-byte limit hold on-chain
  - [x] Gift to 2+ people in one send: each gets their own link
  - [x] Gift to a brand-new email, opened by signing in with that email's code
  - [x] Fee paid in shares (sender with no cash)
  - [x] Claim a 3-stock gift
- [ ] **Deploy the app to Vercel**
  - [ ] Set every env var from `apps/app/.env`, including `CRON_SECRET` and `PUBLIC_APP_URL`
  - [ ] Raise the function duration (`vercel({ maxDuration })` in `astro.config.mjs`): sending a gift can wait up to ~60–90s while the transaction lands
  - [ ] Confirm the daily cron shows up in Vercel and `/api/cron/refund-gifts` returns 401 without the secret
- [x] **Jupiter referral fee**: create the referral account under the Ultra project at referral.jup.ag, open token accounts for USDC and SOL, set `JUPITER_REFERRAL_ACCOUNT`. Then check in logs how often the fee survives (gasless) versus falls back.
- [x] **Commit the work.** Nothing is in git yet.
- [ ] **Submission**: demo video (buy → gift → open), pitch, README screenshots, program address and a Solscan link.

## P0 — family funds (next feature)

A fund is a long-term pot for someone ("Aisyah's college fund"): locked until a date, shared by link so the whole family can add, and invested in a mix of stocks. Designs: `CreateFund` ("Start a fund") and `FundPage` in the design canvas, plus "Your funds" on Home.

### Decisions needed first

- [x] **Who can withdraw at unlock.** Decided 2026-09-15: the on-chain `beneficiary` is a pubkey set once at creation and never changeable (no `set_beneficiary` instruction). The creator holds it by default; giving a beneficiary email uses a pregenerated Privy wallet, as gifts do.
- [x] **Who pays long-lived rent.** Decided 2026-09-15: the relayer pays the SOL, the creator pays the fund account's cost in cash and each contributor pays for a vault their stock opens plus the account the beneficiary will need at unlock. `withdraw` and `close_fund` bring the SOL back.
- [ ] **Monthly auto-add.** Non-custodial means every contribution needs the contributor's signature. MVP: a monthly reminder plus a one-tap add. Later: token delegation with a spending cap, or Jupiter Recurring.
- [ ] **Long lock risk.** xStocks have a permanent delegate and can be paused by the issuer. Say so plainly on the create screen before someone locks money for 12 years.

### Program (upgrade the deployed program)

- [x] Add back `create_fund(fund_id, beneficiary, unlock_at)`, `contribute(amount)` (anyone, any stock, vault opened on first use) and `withdraw()` (beneficiary, after unlock)
- [x] `withdraw` closes the vault so its rent comes back; `close_fund` once every vault is empty (the fund counts its open vaults)
- [x] Cap `unlock_at` at 25 years and reject dates in the past
- [x] **Upgraded on mainnet** 2026-09-15: extended by 54,848 bytes and deployed at 312,080 bytes, program rent now ~1.59 SOL. On-chain bytecode matches the local build byte for byte and `create_fund` simulates clean. Deployer left with 1.707 SOL.
- [x] SDK: `findFundAddress`, instruction builders and discriminators, checked against the new IDL
- [x] Localnet tests (`pnpm test:program`): three contributions from two people, early withdrawal refused, withdrawal at unlock, rent back to the relayer
- [x] **Mainnet run through with a real xStock** (2026-09-15, fund `DCHzuiwG1krNmvwW4Di29p1agsxEFKcADXzYMskB4fUQ`): create, contribute, early withdrawal refused with `StillLocked` (0x1776), withdrawal at unlock, vault and fund closed. Shares came back whole and the whole thing cost 0.000068 SOL in fees, every lamport of rent returned. Transaction sizes: create 355 bytes, contribute 472, withdraw 465, close 265.

### Server and data

- [x] Migration `20260915110000_funds.sql`: `funds.allocations`, `name`, beneficiary email, status, fee and withdrawal columns; contributions get a `group_id`, wallet, status and fee. **Run it in the SQL editor before using any fund route.**
- [x] `POST /api/funds` builds `create_fund` (relayer-signed, creator signs), `GET /api/funds`, `GET /api/funds/[id]`, `POST /api/funds/quote` for the fee
- [x] `POST /api/funds/[id]/buy` splits cash by the fund's mix into gasless Jupiter orders; `POST /api/funds/[id]/contribute` then moves the shares in (one `contribute` per stock, 3 stocks = 732 bytes)
- [x] `submit` verification for fund transactions, as strict as gifts (mint and amount per recorded row, one kind of action, no token instruction but the fee)
- [x] Withdraw route; `GET /api/cron/funds` flags unlocked funds and closes emptied ones
- [x] Performance: `toFundView` reads the vaults on-chain and reports value, all-time change and goal progress
- [x] Cash deposits reach the feed (`20260915130000_cash_deposits.sql`): `users.cash_seen_raw`/`cash_seen_signature` hold the balance we last saw, and `GET /api/portfolio` turns anything above it that arrived as a plain transfer into a `cash_deposited` event. The add-cash screen already polls that every 10s
- [x] Feed events for funds (`20260915120000_fund_notifications.sql` adds the kinds and `notifications.fund_id`): `fund_added` for whoever put money in, `fund_contribution` for the creator and the person it's for, `fund_unlocked` from the daily cron
- [x] Fund events reach the phone through `notify()`, and notification settings now have fund toggles (someone adds, a fund unlocks) plus a per-device switch

### App

- [x] **Start a fund** screen (`/funds/new`): who it's for (with the optional beneficiary email), purpose, goal, unlock month, steady mix or up to three stocks of their own, cost to open, and the plain warning about locking money in shares for years
- [x] **Fund page** `/fund/[id]`: locked-until badge, value, all-time change, goal progress and years to go, Add to fund, Share link, What it holds, From the family. Signed-out visitors get the sign-in box; the beneficiary gets Take out once it unlocks
- [x] **Add to fund** sheet with an optional note, two ways in: cash splits by the mix and buys each stock gasless through Jupiter, or shares already owned (any stock, not just the mix) move straight into the vaults with no trade at all. `POST /api/funds/[id]/quote` prices the fee before either
- [x] **Home**: "Your funds" cards with progress and unlock date, See all
- [x] **Tab bar**: Home, Gifts, Funds, Profile, plus `/gifts` and `/funds` list pages
- [x] Server-rendered OG preview for fund links, like gift links
- [x] Click the whole fund flow through in the browser once (nothing has been driven by hand yet)

## P1 — before real users

- [ ] **Relayer health**: alert when its SOL runs low. Show a clear "gifts are paused" state instead of failing transactions.
- [ ] **Treasury top-up loop**: swap collected fees (USDC and shares) to SOL and refill the relayer, manually at first.
- [ ] **Take a gift back**: sender cancels before it's opened. The program already allows it (`refund_gift` with the sender as authority); needs a route, a submit case and a button on the sender's gift view.
- [ ] **Reconcile stuck gifts**: the cron reports `alreadyClosed` when a gift is pending in the DB but closed on-chain (e.g. a claim that landed after its request failed). Read the gift's last transaction and set `claimed` or `refunded`.
- [ ] **Rate limits** on `/api/recipients`, `/api/gifts/quote` and `/api/gifts`. Creating gifts pregenerates Privy users for any email, which can be abused.
- [ ] **Upgrade authority to a multisig** (e.g. Squads) and back up the deployer seed phrase and `programs/target/deploy/morrow-keypair.json` offline.
- [ ] **Tests**
  - [ ] Unit: `tokenTransfers`, `isFeeTransfer`, `planFeePayment`, `giftFees`, fair-price math
  - [ ] Program tests on localnet with a Token-2022 mint that mirrors xStocks extensions
  - [ ] A transaction-size test that fails when a gift transaction goes over 1,232 bytes
- [ ] **Migration tracking**: migrations were run by hand in the SQL editor. Adopt `supabase db push` (or record which files ran) so a fresh database matches production.

## P2 — product

- [x] **Trade history** stored in the DB (`trade_fills`, `pending_trades`), which gives a cost basis
  - [x] Real PnL on holdings (`pnl.ts` average cost, gifts included; no basis shown when the lots
        don't explain the whole balance)
  - [x] The "Just bought" share card no longer shows a bare percentage. Today's move sits on a
        cream receipt among labelled facts ("Bought at", "Shares", "Today's move"), so it reads as
        the stock's move and not the buyer's return. `renderShareCard` is generic over eyebrow,
        hero, subhero and rows, and the footer carries a code to the sharer's handle page
  - [ ] The second moment: share from a holding with the real return as the hero ("+12.4%",
        "Bought at" / "Now"). The template already takes it; needs an entry point on the holding
        and an empty state for when `pnl.ts` has no basis
- [x] **Ask a friend**: `/ask` builds a link (`morrow.fi/maya?stock=AAPLX&amount=25&note=…`). The ask
      lives in the link, so nothing is stored and there's nothing to abuse. The handle page renders
      it with an OG preview and `/send` opens prefilled, warning when the sender doesn't own it yet
- [x] **Gift share card and OG image** built on `renderShareCard`, which the trade card now shares
- [ ] **Move Jupiter Ultra to Swap V2** (needs an API key). Parked 2026-09-15: Ultra is what carries
      gasless (JupiterZ), which the whole fee-with-fallback rule depends on, and Swap V2 has no
      gasless. Revisit with a key and a plan for the fee
- [x] **Charts**: candles are cached in `price_candles`, shared across serverless instances, served
      while rate-limited, and daily candles accumulate past the six months GeckoTerminal still
      returns. 1Y still equals ALL until enough days have been collected
- [x] **Trade screen**: `?side=sell` opens at the full position
- [ ] **Landing site** (`apps/landing`): it's an empty `index.vue`. Needs a real page, not a copy edit
- [x] **PWA polish**: install prompt on Home (iOS gets the manual steps), offline shell via
      `public/sw.js` with an `/offline` page, and web push. Gifts now write feed events at all
      (sent, received, opened, returned) and anything that happened while you were away also goes
      to the phone. Needs `PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` set in Vercel
