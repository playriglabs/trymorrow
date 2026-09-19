/**
 * Sends one of every email to a real inbox, so they can be judged where people read them rather
 * than in a browser. Nothing in the app calls this; it reads `RESEND_API_KEY` from the app's env.
 *
 *   pnpm send:emails you@example.com            every email
 *   pnpm send:emails you@example.com gift_received
 *
 * Until the sending domain is verified in Resend, the only address that works is the one on the
 * Resend account, and the sender has to be onboarding@resend.dev. Pass it with EMAIL_FROM.
 */
import { renderEmail, renderEmailText } from '../apps/app/src/lib/email-template.ts'
import { APP_URL, SAMPLES } from './email-samples.ts'

const [to, only] = process.argv.slice(2)
const key = process.env.RESEND_API_KEY
const from = process.env.EMAIL_FROM ?? 'Morrow <notification@send.trymorrow.money>'

if (!to?.includes('@')) {
  console.error('Usage: pnpm send:emails <address> [kind]')
  process.exit(1)
}
if (!key) {
  console.error('RESEND_API_KEY is not set in apps/app/.env')
  process.exit(1)
}

const chosen = only ? SAMPLES.filter((sample) => sample.kind.startsWith(only)) : SAMPLES
if (chosen.length === 0) {
  console.error(`No email called "${only}". Try: ${SAMPLES.map((s) => s.kind).join(', ')}`)
  process.exit(1)
}

console.log(`Sending ${chosen.length} to ${to} as ${from.replace(/.*</, '').replace('>', '')}`)

for (const { name, content } of chosen) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: content.subject,
      html: renderEmail(content, APP_URL),
      text: renderEmailText(content, APP_URL),
      // Gmail folds repeat sends of the same subject into one thread, which hides every run but
      // the first. A unique reference per send keeps them apart without touching the subject.
      headers: { 'X-Entity-Ref-ID': crypto.randomUUID() },
    }),
  })
  const body = (await response.json()) as { id?: string; message?: string }
  console.log(response.ok ? `  ok   ${name} (${body.id})` : `  fail ${name}: ${body.message}`)
}
