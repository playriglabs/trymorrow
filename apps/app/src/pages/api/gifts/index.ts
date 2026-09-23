import { z } from 'astro/zod'
import { MAX_GIFT_RECIPIENTS, MAX_GIFT_STOCKS } from '@/lib/gifts'
import { createGiftDrafts } from '@/lib/server/gift-drafts'
import { GIFT_COLUMNS, type GiftRow, toGiftViews } from '@/lib/server/gifts'
import { forbidden, json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { db } from '@/lib/server/supabase'
import { isOnboarded, requireUser, requireWallet } from '@/lib/server/users'

export const GET = route(async ({ request, url }) => {
  const user = await requireUser(request)
  const box = url.searchParams.get('box') === 'sent' ? 'sent' : 'received'

  const query = db
    .from('gifts')
    .select(GIFT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50)
  const { data, error } =
    box === 'sent'
      ? await query.eq('sender_id', user.id).neq('status', 'draft')
      : await query.eq('recipient_wallet', requireWallet(user)).in('status', ['pending', 'claimed'])
  if (error) throw error

  return json({ gifts: await toGiftViews(data as GiftRow[], user) })
})

const itemSchema = z.object({
  mint: z.string().min(32).max(44),
  /** Raw base units each person gets */
  amountRaw: z.string().regex(/^[1-9]\d{0,19}$/),
  usdValue: z.number().nonnegative().max(1_000_000).optional(),
})

const createSchema = z.object({
  recipients: z.array(z.string().trim().min(3).max(254)).min(1).max(MAX_GIFT_RECIPIENTS),
  items: z.array(itemSchema).min(1).max(MAX_GIFT_STOCKS),
  message: z.string().trim().max(280).optional(),
})

/** The send screen's gifts; `createGiftDrafts` holds what a gift is and what it may cost */
export const POST = route(async ({ request }) => {
  const sender = await requireUser(request)
  // Before resolveGiftRecipients, which pregenerates accounts for any email typed in
  enforceRateLimit(sender.id, 'createGifts')
  if (!isOnboarded(sender))
    throw forbidden('Finish setting up your account first.', 'not_onboarded')
  const body = await readBody(request, createSchema)
  const { gifts } = await createGiftDrafts(sender, body)
  return json({ gifts }, { status: 201 })
})
