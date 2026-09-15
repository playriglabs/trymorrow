# Morrow design system

Warm, sunlit and plain-spoken. Tokens live in `packages/ui/src/styles.css`; this file explains how to use them.

## Color

| Token         | Value                    | Use                                                                            |
| ------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `orange`      | `#F66F00`                | Primary actions, active states, progress fills. Text and icons on it are white |
| `orange-wash` | `rgb(246 111 0 / 0.12)`  | Secondary buttons, selected chips, active nav, progress tracks                 |
| `cream`       | `#FFF7E9`                | Page background                                                                |
| `surface`     | `#FFFEFB`                | Cards, inputs, sheets                                                          |
| `ink`         | `#1C1C1C`                | Primary text and icons                                                         |
| `stone`       | `#7E6246`                | Helper text and secondary labels (passes AA on cream and surface)              |
| `steel`       | `#AEACA4`                | Placeholders and disabled only, never readable text                            |
| `line`        | `#EADFCE`                | 1px borders and dividers                                                       |
| `sun`         | `#FCCC3C`                | Decoration only (illustrations, sunrise motifs)                                |
| `gain`        | `#16804A` on `gain-wash` | Price up. Only for market data                                                 |
| `loss`        | `#C23B3B` on `loss-wash` | Price down, destructive actions, warnings                                      |

White on orange is about 2.9:1, below AA for body-size text. It is a deliberate brand choice; keep labels on orange at 15px or larger and medium weight.

## Type

- **Aeonik** (`font-sans`, weight 500): headings, buttons, big numbers
- **Pilat** (`font-body`): everything else
- Numbers that line up use `tabular-nums`

## Shape

- Buttons 16px radius, cards 20px, pills and nav 32px, bottom sheets 28px
- Hit targets are at least 44px tall; primary buttons are 56px
- Cards get `border-line` plus `shadow-elevated`; don't add shadows elsewhere

## Words

- Say what people recognize: "Nvidia shares", "cash", "fee: free", "receipt"
- Never on screen: token, wallet, USDC, Solana, gas, seed phrase. The deposit screen is the one exception, because exchanges ask for the token and network
- Buttons say exactly what happens: "Claim $25 of Nvidia", "Sell for $25.57"
