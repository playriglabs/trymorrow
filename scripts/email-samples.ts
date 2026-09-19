/**
 * The samples every email tool renders: one per email we actually send, with the same copy the
 * server writes. Add one here whenever you add an email, so a preview and a test send can't drift
 * from what lands in a real inbox.
 */
import type { EmailContent } from '../apps/app/src/lib/email-template.ts'

export type EmailSample = { name: string; kind: string; content: EmailContent }

export const APP_URL = 'https://app.trymorrow.money'

export const SAMPLES: EmailSample[] = [
  {
    name: 'A gift arrived',
    kind: 'gift_received',
    content: {
      subject: 'Maya sent you $25.00 of NVDA',
      preview: 'Open it to keep the shares. It goes back to Maya in 30 days.',
      eyebrow: 'Maya sent you a gift',
      hero: '$25.00 of NVDA',
      subhero: 'Only you can open it.',
      rows: [
        { label: 'From', value: 'Maya Putri' },
        { label: 'Worth when sent', value: '$25.00' },
        { label: 'Open before', value: 'Oct 19, 2026' },
      ],
      note: { from: 'Maya', text: 'Happy birthday! Hold this one for a while.' },
      cta: { label: 'Open your gift', path: '/gift/9f1c' },
      footnote: 'Not opened in 30 days? It goes back to Maya, in full.',
    },
  },
  {
    name: 'Cash arrived',
    kind: 'cash_deposited',
    content: {
      subject: '$100.00 cash arrived',
      preview: 'It’s ready to buy stocks or send as a gift.',
      eyebrow: 'Cash arrived',
      hero: '$100.00',
      subhero: 'It’s ready to buy stocks or send as a gift.',
      rows: [
        { label: 'Added', value: '+$100.00', tone: 'gain' },
        { label: 'Cash in your account', value: '$142.50' },
      ],
      cta: { label: 'Buy a stock', path: '/buy' },
    },
  },
  {
    name: 'Shares arrived, from outside',
    kind: 'stock_deposited',
    content: {
      subject: '1.25 $TSLA shares arrived',
      preview: 'They landed in your account from an outside account.',
      eyebrow: 'Shares arrived',
      hero: '1.25 $TSLA shares',
      subhero: 'From an outside account.',
      rows: [
        { label: 'Shares added', value: '1.25' },
        { label: 'Shares you hold now', value: '4.75' },
      ],
      cta: { label: 'See your shares', path: '/holding/TSLAX' },
    },
  },
  {
    name: 'Shares arrived, from a Morrow account',
    kind: 'stock_deposited (named)',
    content: {
      subject: 'Maya Putri sent you 0.5 $NVDA shares',
      preview: 'They’re already in your account — nothing to open.',
      eyebrow: 'Maya Putri sent you shares',
      hero: '0.5 $NVDA shares',
      subhero: 'They’re already in your account.',
      rows: [
        { label: 'From', value: 'Maya Putri' },
        { label: 'Shares', value: '0.5' },
      ],
      cta: { label: 'See your shares', path: '/holding/NVDAX' },
    },
  },
  {
    name: 'Someone added to a fund',
    kind: 'fund_contribution',
    content: {
      subject: 'Rizky added $50 to Aisyah’s college fund',
      preview: 'Nvidia, Apple · locked until May 2038.',
      eyebrow: 'Someone added to the fund',
      hero: 'Rizky added $50',
      subhero: 'Aisyah’s college fund',
      rows: [
        { label: 'From', value: 'Rizky Pratama' },
        { label: 'Added', value: '$50.00' },
        { label: 'What it bought', value: '$NVDA, $AAPL' },
        { label: 'Locked until', value: 'May 2038' },
      ],
      note: { from: 'Rizky', text: 'For when she starts college. Proud of her.' },
      cta: { label: 'See the fund', path: '/fund/4a7b' },
    },
  },
]
