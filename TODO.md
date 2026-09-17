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
- [x] **Take a gift back**: sender cancels before it's opened. `POST /api/gifts/[id]/refund` builds the `refund_gift` transaction (sender as authority, browser signs), `submit` verifies and broadcasts it, and the sender's gift view has a two-step "Take it back" button.
- [x] **Reconcile stuck gifts**: the refund cron reads a fully closed gift's last on-chain transaction and sets `claimed` or `refunded` (summary: `reconciledClaimed`/`reconciledRefunded`). It also checks up to 200 not-yet-expired pending gifts per run, so a claim whose submit failed doesn't show a broken claim button for 30 days.
- [x] **Rate limits** on `/api/recipients` (30/min), `/api/gifts/quote` (20/min) and `/api/gifts` (5/min), per user, in `lib/server/rate-limit.ts`. In-memory, so a soft cap across Vercel instances — revisit a shared store before real traffic.
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
  - [x] The second moment: share from a holding with the real return as the hero ("+12.4%",
        "Bought at" / "Now"). The template already takes it; needs an entry point on the holding
        and an empty state for when `pnl.ts` has no basis
- [x] **Ask a friend**: `/ask` builds a link (`app.trymorrow.money/maya?stock=AAPLX&amount=25&note=…`). The ask
      lives in the link, so nothing is stored and there's nothing to abuse. The handle page renders
      it with an OG preview and `/send` opens prefilled, warning when the sender doesn't own it yet
- [x] **Gift share card and OG image** built on `renderShareCard`, which the trade card now shares
- [ ] **Move Jupiter Ultra to Swap V2** (needs an API key). Parked 2026-09-15: Ultra is what carries
      gasless (JupiterZ), which the whole fee-with-fallback rule depends on, and Swap V2 has no
      gasless. Revisit with a key and a plan for the fee
- [x] **Charts**: candles come from Jupiter's chart API (per share, split-adjusted, full history)
      and are cached in `price_candles`, shared across serverless instances and served while
      rate-limited
- [x] **Trade screen**: `?side=sell` opens at the full position
- [ ] **Landing site** (`apps/landing`): basic homepage is in place; expand it into a full marketing page
- [x] **PWA polish**: install prompt on Home (iOS gets the manual steps), offline shell via
      `public/sw.js` with an `/offline` page, and web push. Gifts now write feed events at all
      (sent, received, opened, returned) and anything that happened while you were away also goes
      to the phone. Needs `PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` set in Vercel

## P3 — growth and earning roadmap (proposed for review)

The product loop to strengthen is: someone asks or creates an occasion, another person sends a
gift, the recipient opens it, both people see it grow, then either person starts the next gift.
Daily opens are not the goal. More useful gift relationships, repeat occasions and long-term
contributions are.

### Scorecard

- **North star:** gifts opened and still held 30 days later, measured weekly
- **Acquisition:** shared-link visits that become a first funded gift; new senders per recipient
- **Activation:** gift-open rate and median time from send to open
- **Retention:** recipients who return in 30 days; senders who send again within 90 days
- **Funds:** contributors per fund, repeat contributions and progress toward the goal
- **Earn:** eligible balance opted in, net reward delivered and retention versus non-Earn users
- **Guardrails:** failed money movements, unresolved balances, user losses, support contacts per
  funded user and every fee disclosed before signing

Instrument these events and establish a baseline before judging a feature. Keep amounts private by
default in analytics and anything shared outside the app.

### Phase 1 — make asking and sending repeatable

- [ ] **Persistent wishlist:** save several wanted stocks, an optional target amount and purpose;
      show it on the handle page and let a sender fill a gift from it in one tap
- [ ] **Occasions:** save birthdays, graduations and other dates against a person or wishlist, with
      reminders at useful intervals and a direct path to a prefilled gift
- [ ] **Recipient-aware suggestions:** prefer wishlist items, avoid suggesting a stock the person
      already has when that is known, and always offer a simple diversified choice
- [ ] **Gift reminders:** tell the sender when a gift is unopened, let them resend its existing link,
      and warn clearly before the 30-day return date
- [ ] **First-gift incentive experiment:** test a fee credit, not points or a cash promise; cap its
      cost and measure incremental completed gifts rather than link clicks

**Exit:** more shared-link visitors complete a gift and more gifts are opened, without increasing
failed transactions or support contacts.

### Phase 2 — make a gift worth returning to

- [ ] **Gift journey:** keep the original message, starting value, current value and change since
      the gift was opened in one durable view
- [ ] **Thank-you flow:** after opening, send a lightweight thank-you card back to the giver and
      bring them to the gift's current journey
- [ ] **Growth updates:** optional, infrequent milestones for meaningful value changes; never send
      noisy daily price alerts or imply that gains are guaranteed
- [ ] **Private-by-default milestone cards:** share growth, time held or fund progress with the
      amount hidden unless the user explicitly includes it
- [ ] **Continue the loop:** from a claimed gift, offer `Add more` and `Give something like this`
      with the stock and amount prefilled but editable

**Exit:** claimed-gift recipients return within 30 days and either hold, add or give, while push
opt-outs stay within the agreed guardrail.

### Phase 3 — turn occasions into long-term habits

- [ ] **Monthly fund reminder:** ship the non-custodial version first: a reminder plus a one-tap
      prefilled contribution that the contributor still signs
- [ ] **Recurring contribution discovery:** compare capped token delegation with Jupiter Recurring;
      require revocation, a per-period spending cap, pause controls and a visible next-run date
- [ ] **Group gift 2.0:** add a contribution deadline, organizer updates, message wall, contributor
      invites and progress milestones to family funds
- [ ] **Family circle:** reuse people and occasions across wishlists and funds; do not expose one
      person's balances or holdings to another
- [ ] **Smart amount guidance:** recommend a contribution from the remaining goal and time, never
      from pressure, leaderboards or public comparisons

**Exit:** funds gain more than one contributor and receive a second contribution without weakening
the requirement that every money movement is authorized by its owner.

### Phase 4 — Morrow Earn

Start discovery alongside Phase 1. Do not ship deposits until the legal, liquidity and failure-mode
gates below pass. Earn stays opt-in; ordinary gifts, holdings and funds must continue to work without
it.

Market reference, not a product promise: on 2026-09-14 xStocks announced partner-operated vaults
for SPYx, QQQx and NVDAx with variable rewards up to 2% net, rewards accruing in the deposited
xStock and a three-day deallocation period. Use the live partner terms and contracts during
discovery; do not hard-code those assets, rates or timing.

What a fund already earns, with no work: xStocks reinvest dividends by raising the mint's scaled UI
multiplier, so a fund vault's raw balance stays put while the shares it stands for grow, and
`toFundView` already values that through `tokenPriceUsd`. It's fair to say "dividends are
reinvested automatically", only for stocks that pay them, and never for PreStocks. It is not yield
on top.

Two shapes of Earn, very different in effort:

- **Cash in a person's own account** needs no program change. The server builds a deposit into a
  lending market or earn vault (Kamino K-Lend, Jupiter Lend's earn tokens), the person signs it
  from their Privy wallet as with any trade, and the receipt token sits in their own account. USDC
  supply rates on K-Lend were reported between 4% and 9% through 2026, variable with borrow demand.
- **Shares locked in a fund** do need a program change, because the vaults belong to the program
  and only it can move them.

- [ ] **Eligibility and legal gate:** confirm where Morrow may surface xStocks and DeFi yield,
      whether the no-KYC model can remain, the disclosures required and how restricted users are
      blocked before a quote or transaction is built
- [ ] **Provider diligence:** evaluate a partner-operated, non-custodial vault rather than writing a
      leveraged strategy; record contracts, audits, curator powers, fees, oracle/bridge exposure,
      supported xStocks, capacity, withdrawal queue and emergency procedure
- [ ] **Accounting prototype:** prove Token-2022 scaled balances, dividend rebases, vault shares,
      deposits, rewards, partial withdrawals and cost basis reconcile without trusting the database
- [ ] **Fund Earn pilot:** offer Earn only for supported allocations in newly created long-term funds;
      keep unsupported shares in the existing fund vault and show the two balances plainly
  - [ ] Program: `earn_deposit` and `earn_withdraw` that CPI from the vault PDA (`invoke_signed`)
        into an allowlisted partner program only; needs `solana program extend`, an upgrade and a
        review before mainnet
  - [ ] Earn is chosen when the fund is created and stored on-chain, never switched on later, so
        every contributor knows before adding that their money sits with a third party for years
  - [ ] Unlock: `withdraw` first unwinds the earn position, and the partner's deallocation period
        (three days at launch) means the beneficiary waits past the unlock date. Say so on create
        and on the fund page
  - [ ] Decide what happens if the partner pauses or winds down a vault mid-lock: who can pull the
        shares back into the fund vault, and whether anyone can (a crank) or only the beneficiary
  - [ ] Measure transaction size: a partner deposit carries many accounts, so it may be one stock
        per transaction or need our first address lookup table
  - [ ] Receipt accounting: the fund holds vault shares, not xStocks, so `toFundView`, all-time
        change and `withdraw`'s vault count have to read the partner's exchange rate
  - [ ] Risk that compounds over a long lock: partner contracts, curator powers, bridge (Chainlink
        CCIP) and oracle exposure. Cap how much of a fund can be in Earn
- [ ] **Claimed-holding Earn:** after a gift is opened, let the owner allocate supported shares to
      Earn and request withdrawal; never enroll a pending gift automatically
- [ ] **Idle-cash Earn:** likely the first to ship, since it needs no program change; never describe
      variable yield as savings interest or guaranteed return
  - [ ] Pick the venue: compare Kamino K-Lend and Jupiter Lend on rate history, withdrawal liquidity
        at high utilization, audits and how deposit and withdraw fit our transaction checks
  - [ ] Keep ready cash: leave enough outside Earn for trades and fees, or unwind in the same
        transaction as a buy, gift or cash out (measure the size first)
  - [ ] One cash balance on screen with the earning part inside it, plus what it earned; no receipt
        token names or rates dressed as promises
  - [ ] `submit` checks for deposit and withdraw as strict as trades: only the recorded amount, only
        between the person's own account and the chosen market
  - [ ] Fee and share-paid fee rules: decide whether cash in Earn counts as cash for gift fees and
        the "send the whole balance" case
  - [ ] Cash in a fund: funds hold only shares today; a cash allocation that earns would go through
        the same program CPI as Fund Earn
- [ ] **Transparent earnings view:** separate market change, dividend-related balance changes, gross
      Earn rewards, provider fees and Morrow's fee
- [ ] **Revenue experiment:** test a disclosed performance fee or provider revenue share charged
      only on rewards; do not take principal, stock appreciation or hidden spread

**Earn launch gates:** an independent contract review, end-to-end mainnet tests with small balances,
withdrawal and provider-pause drills, per-user and global deposit caps, monitoring and an incident
runbook. The UI must show variable rate, possible loss, withdrawal timing and total fees before the
user signs.

**Exit:** the pilot delivers positive net rewards after all fees, withdrawals reconcile, no user
funds are lost or stranded, and eligible users retain better than the comparable non-Earn cohort.

### Phase 5 — Private mode

An opt-in setting that keeps a person's money private on the network, not just inside Morrow. The
app already shows no account addresses on handle pages or share cards, so the gap is on-chain:
anyone can follow a gift, buy or fund from one address to the next.

What stops it today (checked 2026-09-17), so the setting must not ship as a label alone:

- Cash (USDC) is a classic token with no confidential transfers.
- xStocks carry `confidentialTransferMint`, but `autoApproveNewAccounts` is false and Backed holds
  the authority, so every account needs their approval. It would also hide amounts only, not who
  sent to whom.
- Gift and fund vaults belong to the program, which can't hold the secret key a confidential
  transfer needs, so escrow can't be confidential in the current design.
- Jupiter trades need public balances, so a buy stays visible.
- The ZK ElGamal proof program is back on mainnet (June 2026), but almost nobody uses it.

Direction: Helius Rings (Anonymous Ring hides sender, recipient, asset and amount; devnet and
private beta, mainnet targeted by October 2026). Public steps stay public and the balance moves
into the ring right after: a buy is visible but the holding afterwards isn't, a fund withdrawal is
visible but what happens next isn't.

- [ ] **Rings asset support:** Token-2022 with permanent delegate, pausable, transfer hook and
      scaled UI (xStocks), transfer fees (PreStocks) and USDC; test one of each on devnet
- [ ] **Issuer check:** ask Backed and PreStocks whether shielded balances fit their terms, given
      they can pause and seize
- [ ] **Gift escrow:** find out whether Rings can express a gift locked to one recipient with a
      30-day return; if not, decide what a private gift gives up (take-back, automatic return)
- [ ] **Per-flow honesty:** when the setting is on and a flow can't be private (a buy, a fund
      withdrawal), say so before the person signs; never fall back to public silently
- [ ] **Timing leaks:** delay or batch the move into the ring so a buy and its shield aren't
      trivially linked
- [ ] **Small anonymity set:** opt-in users are few at first; don't promise anonymity the numbers
      can't give, and word the setting around what's hidden rather than "private"
- [ ] **Email gifts by proof (separate, later):** lock a gift to a hash of the email and let the
      recipient claim with a ZK proof of owning it (OIDC token or zkEmail, Groth16 verified through
      `alt_bn128`). Removes pregenerated Privy wallets and the Google-login gift gap; needs a
      circuit, trusted setup, mobile proving time measured and a program upgrade

**Exit:** a person with the setting on can buy, hold, gift and receive supported stocks and cash
without a stranger linking those moves to them on an explorer, and every flow that can't do that
says so before signing.

### Later, only if the core loop earns it

- [ ] Round-up contributions after recurring authorization is proven safe and understandable
- [ ] Sponsored gift boosts with a fixed campaign budget and clear sponsor labeling
- [ ] Portfolio health guidance that explains concentration without personalized investment advice
- [ ] Broader Earn assets only after each asset passes the same liquidity and risk gates

Do not prioritize a public wealth leaderboard, daily streak, generic social feed, chat or points
without a redeemable benefit. They can create activity without making gifts or long-term saving more
useful.
