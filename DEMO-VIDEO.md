# Demo video script

For the Stocklana submission. Target **4:30**, hard ceiling 5:00.

Lead with the product, not the deck: judges watch dozens of these and decide in the first thirty
seconds. Slides are the connective tissue between demo beats, never the opening act.

Voice-over lines are in **bold**. Everything else is a stage direction. Record the voice first,
then cut the screens to it — talking while clicking sounds nervous and fills up with "uh".

---

## 0:00–0:30 · Cold open

No logo, no title card, no "hi, we're Morrow". The first frame is money moving.

Screen: one phone, **Send a gift**. A finger picks Nvidia, types $25, types an email, taps send.

> **This is twenty-five dollars of Nvidia, going to my friend's email. He has no account. He has
> never heard of us. And only he can open it.**

## 0:30–0:50 · The problem

Slide: **problem**.

> **Gift cards expire. Cash gets spent in a week. And giving someone a share means a brokerage
> account on both sides, plus identity checks. The gift people actually want to give is the one
> that's still there next year.**

## 0:50–2:50 · The demo

The longest stretch, and it should be. Two phones recorded separately, composited side by side:
left is the sender, right is the recipient.

**0:50** — Left: the gift is sent, the receipt appears.

**1:05** — Right: the Morrow email lands. Open it. The orange panel, the receipt rows, the button.

> **He gets an email. Not a wallet prompt — an email that says who sent it and what it's worth.**

**1:20** — Right: tap the button, sign in with the email code, the gift opens. The shares land.

> **One email code. No app to install, no seed phrase, no network to choose. The shares are in his
> own account now — not ours.**

**1:45** — Right: write the thank-you note. Left: the sender's notification arrives.

> **He writes back, once. The giver sees it. That's the whole loop, and it closes in under a
> minute.**

**2:05** — Left: open a fund. The locked-until badge, the contributors, the goal progress.

> **The same vault does long-term. A college fund, locked until a date nobody can move — not the
> family, not the creator, not us. Anyone with the link adds to it. It opens when she turns
> eighteen.**

**2:25** — Left: the Earn screen. The rate, the position, and the other venues listed beside it.

> **Cash that's sitting idle earns. We list Kamino and Save next to our own rate, so "best rate" is
> something you can check instead of believe.**

**2:40** — The buy list, scrolled to the pre-IPO names: OpenAI, Anthropic, Kalshi.

> **And it isn't only public companies. Pre-IPO names ride exactly the same rails.**

## 2:50–3:35 · Why Solana

Slide: **mainnet**. `0.000068 SOL` fills the screen.

> **The entire life of a family fund on mainnet — create it, fund it, refuse an early withdrawal,
> pay it out, close it — cost sixty-eight millionths of a SOL. Every lamport of rent came back.**

Cut to Solscan, the real transaction. **Hold three seconds.** This is the proof; let them read it.

Slide: **money**.

> **Rent is working capital, and it returns. The one cost that never comes back — opening a share
> account for someone new — we charge at cost, and nothing else. A five-dollar gift only makes
> sense when the rails cost this little.**

## 3:35–4:10 · What's live

Slide: **status**.

> **All of this is on mainnet today, not devnet. Gifts to brand-new emails, opened. Multi-stock
> gifts. A full fund cycle against a real stock, with every lamport of rent returned. Cash earning.
> Every screenshot in our deck is a real transaction between real accounts.**

## 4:10–4:30 · Close

Slide: **close**.

> **Morrow. Give a little ownership. It's live at app dot trymorrow dot money — sign in with your
> email and send someone five dollars of a company they love.**

Final frame, over the close slide:

> **Redeem code JUDGE-2026 at app.trymorrow.money/redeem — five dollars of stock, on us.**

Mint the codes through `/gift-cards` before recording. Ten of them costs about fifty dollars, and
it's the difference between a judge who watched the product and a judge who holds a share bought
through it.

---

## Production notes

- **Record both phones with the phone's own screen recorder** (iOS: Settings → Control Center →
  Screen Recording). Never film a screen with a camera.
- **Real money, small amounts.** One to five dollars a gift. If a transaction fails mid-take, shoot
  it again — never fake one. Solana judges can and will read the chain.
- **Composite 16:9.** Two portrait captures on a `#FFF7E9` field with a thin phone frame; the slack
  on either side carries the captions. Export the deck and cut its slides in full-screen.
- **Burn in subtitles.** Plenty of judges watch muted while skimming. No subtitles, half the
  argument is gone.
- **Speed up waiting on confirmation, but label it** `×4` in the corner. A silent speed-up is a
  small lie; a labelled one is editing.
- **No music with lyrics.** Quiet instrumental or nothing. The voice is the point.
- **Blur half of every email address and account address** before export.

## Check before export

- Every claim spoken is one the repo can back. The deck's numbers were checked on 2026-09-19;
  re-check the catalog size and the Earn rate on the day, since both move.
- The Solscan link on screen resolves to a real mainnet transaction.
- Total runtime is under 5:00 with the end card included.
