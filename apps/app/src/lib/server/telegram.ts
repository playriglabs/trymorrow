import { PUBLIC_APP_URL } from 'astro:env/client'
import { TELEGRAM_BOT_TOKEN } from 'astro:env/server'
import { type PushMessage, sendPush } from '@/lib/server/push'
import { db } from '@/lib/server/supabase'

/**
 * Phone notifications, Telegram first. Someone who signs in from the Mini App can be reached
 * as a bot message, which finds them even outside the webview — so when both are possible the
 * Telegram message replaces the web push: one event should still be one buzz. Entirely
 * optional: with no bot token nothing is sent here and everyone gets web push. Best effort by
 * design, like the rest of the reach-out — whatever called this already happened on-chain.
 */
const configured = Boolean(TELEGRAM_BOT_TOKEN)

type TelegramRow = { id: string; telegram_user_id: string }

/** `sendMessage` answers 403 (blocked) or 400 (no chat: they never let the bot write) */
async function deliver(chatId: string, message: PushMessage): Promise<boolean> {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      // Plain text, like the phone notification it stands in for
      text: `${message.title}\n${message.body}\n${new URL(message.url, PUBLIC_APP_URL).href}`.trim(),
    }),
  })
  return response.ok
}

/**
 * Routes every phone notification: a Telegram message for whoever the bot can reach, web push
 * for everyone else — including a Telegram send that failed, so a blocked bot can only cost us
 * the Telegram route, never the notification. The unreachable go back to web push for good, by
 * losing the link the bot couldn't use.
 */
export async function sendPhoneNotifications(messages: Map<string, PushMessage>): Promise<void> {
  if (messages.size === 0) return
  if (!configured) return sendPush(messages)

  const rows = await db
    .from('users')
    .select('id, telegram_user_id')
    .in('id', [...messages.keys()])
    .then(
      ({ data, error }) => {
        if (error) throw error
        return (data ?? []).filter((row) => row.telegram_user_id) as TelegramRow[]
      },
      // A listing that fails whole shouldn't cost everyone their phone notification
      () => [] as TelegramRow[],
    )

  const delivered = new Set<string>()
  const unreachable: string[] = []
  await Promise.all(
    rows.map(async (row) => {
      const message = messages.get(row.id)
      if (!message) return
      try {
        if (await deliver(row.telegram_user_id, message)) delivered.add(row.id)
        else unreachable.push(row.id)
      } catch (telegramError) {
        console.error('Telegram send failed', telegramError)
      }
    }),
  )
  if (unreachable.length > 0) {
    await db.from('users').update({ telegram_user_id: null }).in('id', unreachable)
  }

  const rest = new Map([...messages].filter(([userId]) => !delivered.has(userId)))
  await sendPush(rest)
}
