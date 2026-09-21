# TODO

What's left, in the order it matters. Hackathon deadline: **Thu 2026-09-25** (extended).

## P0 — before submitting

- [x] **Test the remaining gift paths on mainnet** (a single-stock gift already works)
  - [x] Gift with 3 stocks at once: confirms the 400k compute ceiling and 1,232-byte limit hold on-chain
  - [x] Gift to 2+ people in one send: each gets their own link
  - [x] Gift to a brand-new email, opened by signing in with that email's code
  - [x] Fee paid in shares (sender with no cash)
  - [x] Claim a 3-stock gift
- [x] **Deploy the app to Vercel** — live at `app.trymorrow.money`
  - [x] Set every env var from `apps/app/.env`, including `CRON_SECRET` and `PUBLIC_APP_URL`
  - [x] Raise the function duration (`vercel({ maxDuration })` in `astro.config.mjs`): sending a gift can wait up to ~60–90s while the transaction lands
  - [x] Confirm the daily cron shows up in Vercel and `/api/cron/refund-gifts` returns 401 without the secret
- [x] **Jupiter referral fee**: create the referral account under the Ultra project at referral.jup.ag, open token accounts for USDC and SOL, set `JUPITER_REFERRAL_ACCOUNT`. Then check in logs how often the fee survives (gasless) versus falls back.
- [x] **Commit the work.** Nothing is in git yet.
- [x] **Apply `20260919090000_gift_thanks.sql`.** Applied; `gifts.thanks_note` and `thanked_at`
      answer through the service-role REST API (checked 2026-09-19).
- [x] **Apply `20260919100000_stock_sends.sql`.** Applied; `stock_sends` answers through the
      service-role REST API and the feed's `stock_sent` kind came with it (checked 2026-09-19).
- [x] **Push for shares arriving.** Fixed by `20260919140000_email_notifications.sql`:
      `cash_deposited` and `stock_deposited` now have toggle columns, so both reach a phone as
      well as the feed. `deposits.ts` was inserting into `notifications` directly, which is why
      neither could — both now go through `notify()`, as everything is supposed to.
- [ ] **Apply `20260919140000_email_notifications.sql`.** Adds `email_enabled`, `cash_deposited`
      and `stock_deposited` to `notification_settings`. Email and the two new phone notifications
      stay silent until it has run.
- [ ] **Set `RESEND_API_KEY` in Vercel**, after verifying `send.trymorrow.money` in Resend (SPF,
      DKIM and the return-path record). Unset means no email is sent at all. Send one of each to a
      real inbox before the demo — Gmail, Apple Mail and Outlook all render differently.
- [x] **Run one share send on mainnet**: to an address that already holds the stock (free), then to
      one that doesn't (fee opens their account). Only the cash-out twin has been proven on chain.
- [ ] **Telegram Mini App** — the app runs inside Telegram and gifts resolve by Telegram name. Code is
      done (`telegram-web-app.js` loads only when Telegram launch params are in the URL, web push is
      off in there, Privy logs people in seamlessly). Still to do, all outside the repo:
  - [ ] Create the bot via `@BotFather`, `/setdomain app.trymorrow.money`, note the bot token
  - [ ] Privy Dashboard → Login Methods → Socials → Telegram: paste the bot token and username,
        enable **seamless authentication**
  - [ ] Add `web.telegram.org` to Privy's allowed domains (Telegram's web client)
  - [ ] Open the app from the bot (`t.me/<bot>` → add the Mini App via `/newapp`), sign a real
        gift on mainnet from inside Telegram and confirm the embedded wallet signs in the webview
- [ ] **Submission**: the video is scripted shot by shot in [DEMO-VIDEO.md](./DEMO-VIDEO.md) —
      4:30, product first, deck only between demo beats. Still to do: record it, mint the judge
      redeem codes, and put the program address and a Solscan link in the README.

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
  - [ ] Unit: `tokenTransfers`, `isFeeTransfer`, `planFeePayment`, `giftFees`, fair-price math. No
        unit test file exists yet; everything proven so far runs against a validator
  - [x] Program tests on localnet with a Token-2022 mint that mirrors xStocks extensions:
        `pnpm test:prestocks` runs gift, claim, refund and fund against a mint carrying the same
        0.5% transfer fee and asserts recipient amounts to the unit. The validator's Token-2022
        has no pausable or scaled UI, so those two were covered by simulating create → harvest →
        claim/refund against the real mainnet mints (2026-09-17)
  - [x] A transaction-size test that fails when a gift transaction goes over 1,232 bytes:
        `pnpm test:gifts` measures the biggest gift (2 stocks + cash + cash fee, 1,139 bytes) and
        `pnpm test:program` fails if a full withdrawal batch goes over
- [ ] **Migration tracking**: migrations were run by hand in the SQL editor. Adopt `supabase db push` (or record which files ran) so a fresh database matches production.

## P1.5 — key export on a phone (decided, not built)

Someone on a phone can't get their key out. Privy's hosted export modal measures its container
once at mount with no `ResizeObserver`, bakes that width into both the iframe and its `width=`
query param, and the Copy button ends up untappable on a sheet. Everything else was tried and
closed, on 2026-09-18:

| Approach                                  | What happened                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `useGetWalletPrivateKey` (client export)  | 403 `Client wallet export is not enabled for this app` — per-app flag Privy controls                              |
| Server relay, app secret                  | Wallet's owner quorum holds no key of ours                                                                        |
| Server relay, user JWT                    | `/wallets/authenticate` wants a JWT from a registered auth provider; Privy's own tokens refused                   |
| Browser signs, server relays              | User signer refuses: `Wallet export is not supported`                                                             |
| Call the client API directly              | 403 `invalid_origin` — by design, it only answers Privy's own iframe                                              |
| **Wallet owned by our authorization key** | **Works.** `POST /v1/wallets` with `owner.public_key`, then `POST /v1/wallets/{id}/export` returns the sealed key |

**The one that works makes us custodial.** A 1-of-k quorum means our key alone can export, and a
key that can export can drain. It would live in the same env as `PRIVY_APP_SECRET`, which today
can't touch user money. That ends "money only moves signed by them", and the no-KYC posture rests
on not holding customer assets. It also makes leaving Privy easy, since we could export everyone.

- [ ] **Decide the custody question first.** If no, the answer is Privy enabling client export
      (ticket) or another provider (Turnkey, Dynamic and Web3Auth document key export properly)
- [ ] If yes: wallets must be owned by a quorum holding **both** the person and our key, or they
      can't sign their own transactions. Verify a 1-of-2 wallet still signs in-app before anything
      depends on it
- [ ] Creation moves server-side. `createOnLogin` in `providers.tsx` makes wallets client-side with
      Privy's default owner, so the login path, `walletForEmail` and `useEnsureWallet` all change
- [ ] Existing accounts can't be retrofitted: adding a key to their quorum needs a signature from a
      current member, and the only member is the person. Either they stay on the modal, or the
      browser signs the `PATCH /v1/key_quorums/{id}` itself — untested, and the user signer already
      refuses export, so it may refuse this too
- [ ] Signing, already proven: canonicalize the request (RFC 8785), SHA-256, P-256 ECDSA, DER,
      base64, in `privy-authorization-signature`. Body is `encryption_type: HPKE`,
      `recipient_public_key` (plain base64 SPKI, not PEM — PEM is the seed-phrase export),
      `export_seed_phrase: false`. Seal to a keypair the browser keeps so the key never lands here

**Meanwhile:** the modal works on desktop, and Cash out already lets someone on a phone move their
money out. Worth re-testing the modal on HTTPS — `navigator.clipboard` doesn't exist on the LAN dev
origin, so "the button does nothing" may just have been the clipboard failing silently.

## P1 — cash without selling (Kamino xStocks market)

Kamino runs an isolated market where tokenized shares are collateral and cash is the only thing
borrowed: **xStocks Market `5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua`**. It answers the one
thing a holder asks that we had no answer for — "I need money, do I have to sell?" — and it needs
no program change of ours, because the shares stay in the person's own account and the market
holds them, exactly like Earn.

Measured 2026-09-20 against mainnet with `klend-sdk` v12 and noop signers:

- **Collateral, loan-to-value / liquidation threshold:** SPYx 73/75, QQQx 70/72, GOOGLx 60/70,
  TSLAx 55/65, NVDAx 55/65, AAPLx 40/50, METAx 35/45 (paused, deposit cap 0), MSTRx, CRCLx and
  HOODx 30/40, plus cbBTC 75/80. Ten of our stocks, not 188. Deposit caps are per stock and real:
  AAPLx takes 2,000 shares, NVDAx 18,000, SPYx 20,000.
- **Liquidation costs the borrower 5–10%** of what is sold (`minLiquidationBonusBps` 500,
  `maxLiquidationBonusBps` 1000), half of it to Kamino. That is the number a screen has to say out
  loud, because it is the price of being wrong.
- **Cash:** $5.64M supplied, $4.92M borrowed, so 87% is already lent and about $720k is free to
  borrow. 5.11% a year to borrow, variable. A borrow bigger than what's free simply fails.
- **Our catalog already points at the right mint.** For 9 of the 10, the xStocks mint is the most
  liquid one, so `findStockByTicker` and a holding bought in the app both land on the mint Kamino
  takes. A Backpack mint of the same company is not collateral; `markSuperseded` keeps both, so
  eligibility is decided per mint, never per ticker.
- **Transaction sizes, no lookup tables:** a first-time deposit-and-borrow in one transaction is
  **1,367 bytes** — over the 1,232 limit — so the accounts are opened in their own transaction and
  the money moves in the next. As the app builds them: setup **730** (**868** when it also opens a
  cash account), the money **1,137** bare, **1,184** with the fee and **1,211** with an account
  opening, repay **794**, unlock shares **830**. That is why the account opening rides with the
  setup and never beside the fee, and why a second collateral stock is refused for now: each one
  adds its own refresh instruction to every transaction after it. No lookup tables anywhere.
- **Rent:** the obligation is 3,344 bytes (0.01764 SOL) and the user metadata 1,032 (0.00589), and
  `klend-sdk` v12 exposes no instruction that closes either, so **0.02353 SOL per person never
  comes back**. Charged at cost out of the cash they borrow, like every other unrecoverable
  account. The debt farm state (920 bytes, 0.00532) does come back — `getCloseEmptyUserStateIx`
  closes it once the loan is gone.
- **The relayer can pay it.** `initUserMetadata` and `initObligation` take a `feePayer` separate
  from the owner, so the person never needs SOL, which is what made this fit our shape at all.
- **The SDK bundles.** `@kamino-finance/klend-sdk` v12 builds inside the Astro/Vercel function, and
  its `@solana/kit` v2 accepts the app's kit v5 RPC client.

This is the same Kamino we measured and turned down for Earn: a bad place to _put_ cash, the only
place to borrow it against these shares.

- [x] `lib/server/borrow.ts`: market terms, the position read back from the obligation, and the
      instruction builders (open, repay, unlock), all converted from the SDK's kit instructions
- [x] `GET /api/borrow`, `POST /api/borrow/quote`, `/open`, `/repay`, `/submit`, mirroring Earn:
      the relayer builds and signs, the browser adds the person's signature, `submit` accepts only
      the lending program, the farms program, the token programs and the recorded fee
- [x] `/borrow` screens: what a stock can raise, what a loan costs, and how far the stock can fall
      before shares are sold, plus `/borrow/open` and `/borrow/repay` (which also hands the shares
      back once nothing is owed)
- [x] Ways in: a home banner (the loan and its room to fall once there is one, the offer before
      that) and a line on the holding screen. Home only asks the lending market anything when the
      person actually holds shares
- [x] A floor on the loan: `minimumLoanUsd` is ten times the one-off cost, never under $5, because
      charging $2.99 to hand someone $1.70 is a fee and not a service. The list marks holdings too
      small to reach it, `/borrow/open` offers the ones that can instead of a screen of dead
      buttons, and the route refuses anything under it
- [ ] **Run it once on mainnet with about $5** — open, top up, repay part, repay the rest and
      unlock the shares. Nothing here has touched mainnet yet
- [ ] **Watch the loan.** A daily cron that notifies at 80% of the liquidation threshold and again
      at 90%, plus a "shares were sold" notification when a liquidation happens, so nobody finds
      out by noticing their shares are gone
- [ ] Close the debt farm state on full repayment so its 0.00532 SOL comes home
- [ ] Decide whether borrowed cash counts as cash for gift fees and "send the whole balance". It
      does today, because it is plain cash in their account — but the fee planner has no idea it is
      owed to someone
- [x] A second collateral stock is refused in `POST /api/borrow/open` (`one_stock_only`) until the
      bytes and the liquidation maths for two have been measured; the obligation itself holds many

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
- [x] **Landing site** (`apps/landing`): homepage with swipeable feature cards and a gift card in
      the hero, plus `/how-it-works`, `/privacy-policy`, `/terms-conditions`, a sitemap, robots and
      Organization/WebSite structured data
- [x] **PWA polish**: install prompt on Home (iOS gets the manual steps), offline shell via
      `public/sw.js` with an `/offline` page, and web push. Gifts now write feed events at all
      (sent, received, opened, returned) and anything that happened while you were away also goes
      to the phone. Needs `PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` set in Vercel

### Shipped after this list was first written

These landed without ever having a line here. Recorded so the list matches the code.

- [x] **PreStocks** (the $5k bounty): pre-IPO shares ride buy, sell, gift, gift card and fund with
      no program change. 9 decimals and a 0.5% transfer fee, so `harvestsBeforeClosing` goes in
      front of every close; `LISTED_PRESTOCKS` hides companies that have since listed as xStocks;
      logos are ours (`public/logos/prestocks/`) because both vendors serve the mark inside a
      PreStocks hexagon. Proven by `pnpm test:prestocks` plus mainnet simulation
- [x] **Cash gifts**: a `gift_items` row with the USDC mint, resolved by `findGiftAsset` the way
      `findStock` resolves xStocks — no `kind` column, no second flow. Cash left after the gift
      pays the fee first and any shortfall comes out of the locked cash, so sending the whole
      balance still works
- [x] **Gift cards** (`20260916140000_gift_cards.sql`): `/gift-cards` mints a redeem code with a
      shareable card and QR, `/redeem` opens it. `POST /api/gift-cards` and `/quote`
- [x] **Send stocks out** (`/send-stocks`): the cash-out twin for shares. Address, `@handle` or a
      Morrow user; quote, draft row, relayer-signed transfer, strict `submit`. The fee is only the
      unrecoverable part (opening a share account the destination lacks) and comes out of cash, or
      out of the shares when there is none. Both sides hear about it (`stock_sent`,
      `stock_deposited`)
- [x] **After a gift is opened**: `/gift/[id]` shows what it was worth when sent, what it's worth
      now and the change, with the transfer fee taken off twice, plus the recipient's note back to
      the giver (`gifts.thanks_note`, written once through `POST /api/gifts/[id]/thanks`, riding
      the sender's existing "they opened it" switch). This is Phase 2's gift journey and
      thank-you flow, below
- [x] **Watchlists**: named baskets with an emoji, `localStorage` per Privy user id
      (`lib/client/watchlists.ts`, read through `useSyncExternalStore`). Nothing reaches the
      server. `/watchlist` holds the tabs and editing, the trade-screen heart saves, and Home
      shows the same baskets. Max 5 lists, 16-character names
- [x] **Analytics**: PostHog, page views and unhandled errors from the browser, money events
      (`gift_sent`, `gift_claimed`, `gift_refunded`, `trade_completed`, `cashout_completed`,
      `fund_created`, `fund_contributed`, `fund_withdrawn`, plus earn and stock-send) from the
      submit routes after the transaction lands. Autocapture and session replay stay off; amounts
      only as bands, people only by Privy id. This is the Scorecard's "instrument these events"
      groundwork — the baseline still has to be read

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

- [x] **Gift journey:** shipped. `/gift/[id]` keeps the message, the value when sent, the value
      today and the change; `toGiftViews` returns nothing rather than a number it can't price
- [x] **Thank-you flow:** shipped. The recipient writes one note back through
      `POST /api/gifts/[id]/thanks`, seen only by the two of them, notified on the sender's
      existing "they opened it" switch
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
- [x] **Idle-cash Earn** shipped 2026-09-19 as `/earn`; never describe variable yield as savings
      interest or a guaranteed return
  - [x] Venue picked: **Jupiter Lend Earn**, measured 2026-09-19. USDC pays 4.45% lending + 0.38%
        rewards = **4.83%** with $469M supplied, against Kamino main market USDC at 3.79% with
        $127M and Save at 3.43% with $5M. Keyless `lite-api.jup.ag/lend/v1`, same vendor as our
        swaps, one instruction with 17 accounts. Deposit simulated clean on mainnet at 71,197
        compute units, 726 bytes.
  - [x] **Kamino rejected on cost, not taste** (measured 2026-09-19 by building a real deposit with
        `klend-sdk` v12 and a noop signer). A first deposit opens an obligation (0.01764 SOL), user
        metadata (0.00585) and a collateral account (0.00149): **0.0250 SOL, about $2.84**, none of
        it coming back unless those accounts are closed. Jupiter Lend costs one 0.00149 SOL account
        that closes itself on a full take-back. So Kamino's main market is a lower rate at 17× the
        setup cost. Only its isolated USDC market (6.41%, $7M) beats Jupiter, and that's a thin
        pool with riskier collateral — revisit with a minimum deposit and a plain warning. Its
        xStocks market is a different question and is being built: see "cash without selling".
  - [x] The screen lists Jupiter Lend, Kamino and Save with live rates and marks the one the cash
        goes to, so the claim "best rate" can be checked rather than believed. Kamino answers for
        itself; Save comes through DefiLlama.
  - [x] `submit` checks: relayer pays, the person signs, no lookup tables, and every instruction
        belongs to the lending program, the token programs or the compute budget
  - [x] **Run it once on mainnet with about $1**: deposit, part take-back, then all of it. The
        redeem-then-close pair has only been built and type-checked, never landed.
  - [x] Keep ready cash: leave enough outside Earn for trades and fees, or unwind in the same
        transaction as a buy, gift or cash out (measure the size first)
  - [ ] Fee and share-paid fee rules: cash in Earn does not count as cash today, so a gift fee and
        "send the whole balance" both ignore it. Decide whether that stays.
  - [ ] Earning and ready cash are two lines on screen rather than one balance, because the fee
        planner only knows about spendable cash. Revisit once the rule above is decided.
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
