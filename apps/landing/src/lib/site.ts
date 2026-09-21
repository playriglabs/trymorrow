// Landing is served at trymorrow.money; the app lives on app.trymorrow.money.
// Override in production with PUBLIC_SITE_URL
export const siteUrl = import.meta.env.PUBLIC_SITE_URL ?? 'https://trymorrow.money'

// The Mini App is opened through the bot, which is also what sends phone notifications
export const telegramUrl = 'https://t.me/morrowapp_bot'
export const appUrl = 'https://app.trymorrow.money'
