# TODO

What's left, in the order it matters. Hackathon deadline: **Fri 2026-09-18, 4pm ET**.

## P0 — before submitting

- [ ] **Test the remaining gift paths on mainnet** (a single-stock gift already works)
  - [ ] Gift with 3 stocks at once: confirms the 400k compute ceiling and 1,232-byte limit hold on-chain
  - [ ] Gift to 2+ people in one send: each gets their own link
  - [ ] Gift to a brand-new email, opened by signing in with that email's code
  - [ ] Fee paid in shares (sender with no cash)
  - [ ] Claim a 3-stock gift
- [ ] **Deploy the app to Vercel**
  - [ ] Set every env var from `apps/app/.env`, including `CRON_SECRET` and `PUBLIC_APP_URL`
  - [ ] Raise the function duration (`vercel({ maxDuration })` in `astro.config.mjs`): sending a gift can wait up to ~60–90s while the transaction lands
  - [ ] Confirm the daily cron shows up in Vercel and `/api/cron/refund-gifts` returns 401 without the secret
- [ ] **Jupiter referral fee**: create the referral account under the Ultra project at referral.jup.ag, open token accounts for USDC and SOL, set `JUPITER_REFERRAL_ACCOUNT`. Then check in logs how often the fee survives (gasless) versus falls back.
- [ ] **Commit the work.** Nothing is in git yet.
- [ ] **Submission**: demo video (buy → gift → open), pitch, README screenshots, program address and a Solscan link.

## P0 — family funds (next feature)

A fund is a long-term pot for someone ("Aisyah's college fund"): locked until a date, shared by link so the whole family can add, and invested in a mix of stocks. Designs: `CreateFund` ("Start a fund") and `FundPage` in the design canvas, plus "Your funds" on Home.

### Decisions needed first

- [ ] **Who can withdraw at unlock.** The screen only asks for a name ("Aisyah"). Options: the creator acts as guardian and receives it (simplest), or an email for the beneficiary gets a pregenerated wallet (like gifts). Changing the beneficiary later is a security risk, so decide whether it's allowed and who can do it.
- [ ] **Who pays long-lived rent.** A fund holds rent for years (fund account plus one vault per stock, ~0.0015 SOL each). If the relayer pays, that capital is stuck until unlock. Proposal: the creator pays a small refundable deposit at creation, returned at withdrawal.
- [ ] **Monthly auto-add.** Non-custodial means every contribution needs the contributor's signature. MVP: a monthly reminder plus a one-tap add. Later: token delegation with a spending cap, or Jupiter Recurring.
- [ ] **Long lock risk.** xStocks have a permanent delegate and can be paused by the issuer. Say so plainly on the create screen before someone locks money for 12 years.

### Program (upgrade the deployed program)

- [ ] Add back `create_fund(fund_id, beneficiary, unlock_at)`, `contribute(amount)` (anyone, any stock, vault opened on first use) and `withdraw()` (beneficiary, after unlock)
- [ ] `withdraw` closes the vault so its rent comes back; add `close_fund` once every vault is empty
- [ ] Cap `unlock_at` (e.g. 25 years) and reject dates in the past
- [ ] Rebuild with `opt-level = "s"`, measure the size, `solana program extend` by the difference (roughly 0.35–0.45 SOL of extra rent, measure first), upgrade from the deployer wallet
- [ ] SDK: `findFundAddress`, instruction builders and discriminators, checked against the new IDL
- [ ] Localnet tests: contribute from several people, early withdraw fails, withdraw after unlock, rent returns

### Server and data

- [ ] Migration: `funds.allocations` (jsonb: mint → percent), `funds.name`, contribution `note`; keep `fund_contributions.usd_value` for all-time performance
- [ ] `POST /api/funds` builds `create_fund` (relayer-signed, creator signs), `GET /api/funds`, `GET /api/funds/[id]`
- [ ] `POST /api/funds/[id]/contribute`: cash is split by the fund's mix, each stock bought through Jupiter into the contributor's wallet (gasless), then one `contribute` transaction per stock (or per batch that fits 1,232 bytes) moves the shares into the vaults
- [ ] `submit` verification for fund transactions, as strict as gifts
- [ ] Withdraw route and a cron or reminder at unlock
- [ ] Performance: current value of the vaults minus the sum of contributions ("+$84.20 · 4.6% all time")

### App

- [ ] **Start a fund** screen: who it's for, purpose (College, First home, Wedding, Something else), goal, unlock month ("No one can withdraw early, including you"), what it buys (Steady mix: S&P 500 60% · Apple 20% · Nvidia 20%, or Pick my own)
- [ ] **Fund page** `/fund/[id]`: locked-until badge, value, all-time change, goal progress and years to go, Add to fund, Share link, What it holds (value, weight, change per stock), From the family (name, note, amount, date)
- [ ] **Add to fund** sheet for anyone with the link (sign-in required), with an optional note
- [ ] **Home**: "Your funds" cards with progress and unlock date, See all
- [ ] **Tab bar**: Home, Gifts, Funds, Profile, plus `/gifts` and `/funds` list pages
- [ ] Server-rendered OG preview for fund links, like gift links

## P1 — before real users

- [ ] **Relayer health**: alert when its SOL runs low. Show a clear "gifts are paused" state instead of failing transactions.
- [ ] **Treasury top-up loop**: swap collected fees (USDC and shares) to SOL and refill the relayer, manually at first.
- [ ] **Take a gift back**: sender cancels before it's opened. The program already allows it (`refund_gift` with the sender as authority); needs a route, a submit case and a button on the sender's gift view.
- [ ] **Reconcile stuck gifts**: the cron reports `alreadyClosed` when a gift is pending in the DB but closed on-chain (e.g. a claim that landed after its request failed). Read the gift's last transaction and set `claimed` or `refunded`.
- [ ] **Rate limits** on `/api/recipients`, `/api/gifts/quote` and `/api/gifts`. Creating gifts pregenerates Privy users for any email, which can be abused.
- [ ] **Account linking**: Google login and email-code login for the same address are separate Privy users today, so an email gift isn't visible after Google sign-in. Link accounts or bind gifts to the verified email.
- [ ] **Upgrade authority to a multisig** (e.g. Squads) and back up the deployer seed phrase and `programs/target/deploy/morrow-keypair.json` offline.
- [ ] **Tests**
  - [ ] Unit: `tokenTransfers`, `isFeeTransfer`, `planFeePayment`, `giftFees`, fair-price math
  - [ ] Program tests on localnet with a Token-2022 mint that mirrors xStocks extensions
  - [ ] A transaction-size test that fails when a gift transaction goes over 1,232 bytes
- [ ] **Migration tracking**: migrations were run by hand in the SQL editor. Adopt `supabase db push` (or record which files ran) so a fresh database matches production.

## P2 — product

- [ ] **Trade history** stored in the DB (price, shares, fee), which also gives a cost basis
  - [ ] Real PnL on holdings and on the "Just bought" share card (it shows today's move for now)
- [ ] **Ask a friend**: request a gift or a contribution via link
- [ ] **Gift share card and OG image** that match the trade share card
- [ ] **Move Jupiter Ultra to Swap V2** (needs an API key); keep the gasless fallback and fee logic
- [ ] **Charts**: paid or cached OHLCV source; 1Y currently equals ALL (about six months of history)
- [ ] **Trade screen**: `?side=sell` starts at $25; start at the full position instead
- [ ] **Landing site** (`apps/landing`): align copy with what shipped (funds aren't live yet)
- [ ] **PWA polish**: install prompt, offline shell, push notification when a gift is opened
