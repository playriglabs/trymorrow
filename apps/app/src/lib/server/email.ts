import { PUBLIC_APP_URL } from 'astro:env/client'
import { EMAIL_FROM, RESEND_API_KEY } from 'astro:env/server'
import { type CreateBatchEmailOptions, Resend } from 'resend'
import { type EmailContent, renderEmail, renderEmailText } from '@/lib/email-template'
import { db } from '@/lib/server/supabase'

/**
 * Email for the things that happened while someone was away. Entirely optional: with no Resend key
 * nothing is sent and notifications just live in the feed. Sending is best effort — whatever this
 * announces has already landed on-chain, so a bounced address can't be allowed to fail a request.
 */
const configured = Boolean(RESEND_API_KEY)
const resend = configured ? new Resend(RESEND_API_KEY) : undefined

const FROM = EMAIL_FROM ?? 'Morrow <notification@send.trymorrow.money>'
const REPLY_TO = 'help@trymorrow.money'

/**
 * One email each. Addresses come from the profile rather than the caller, so nothing here can be
 * talked into mailing an address a person never signed in with.
 */
export async function sendEmails(messages: Map<string, EmailContent>): Promise<void> {
  if (!resend || messages.size === 0) return

  const { data, error } = await db
    .from('users')
    .select('id, email')
    .in('id', [...messages.keys()])
    .not('email', 'is', null)
  if (error) throw error

  const payloads: CreateBatchEmailOptions[] = []
  for (const row of (data ?? []) as { id: string; email: string }[]) {
    const content = messages.get(row.id)
    if (!content) continue
    payloads.push({
      from: FROM,
      to: [row.email],
      replyTo: REPLY_TO,
      subject: content.subject,
      html: renderEmail(content, PUBLIC_APP_URL),
      text: renderEmailText(content, PUBLIC_APP_URL),
    })
  }
  if (payloads.length === 0) return

  try {
    // Resend takes up to 100 in one call, and a single email through the batch endpoint is fine
    const sent = await resend.batch.send(payloads)
    if (sent.error) console.error('Email failed', sent.error)
  } catch (sendError) {
    console.error('Email failed', sendError)
  }
}

/**
 * One email to an address that has no account yet. Everything else goes through `notify()`, which
 * keys on a user id and reads the address off their profile — but a gift to a new email is sent
 * before its recipient exists, and they're the one person who can't find out any other way.
 * There are no notification settings to respect, because there's nobody to hold them.
 */
export async function sendEmailTo(to: string, content: EmailContent): Promise<void> {
  if (!resend) return
  try {
    const sent = await resend.emails.send({
      from: FROM,
      to: [to],
      replyTo: REPLY_TO,
      subject: content.subject,
      html: renderEmail(content, PUBLIC_APP_URL),
      text: renderEmailText(content, PUBLIC_APP_URL),
    })
    if (sent.error) console.error('Email failed', sent.error)
  } catch (sendError) {
    console.error('Email failed', sendError)
  }
}

export const emailConfigured = configured
