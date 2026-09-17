import { PUBLIC_APP_URL, PUBLIC_POSTHOG_HOST, PUBLIC_POSTHOG_PROJECT_TOKEN } from 'astro:env/client'

export const appHostname = new URL(PUBLIC_APP_URL).hostname

/**
 * Analytics only count real people: a production build, pointed at a real domain, with keys.
 * `astro dev` and anything whose app URL is localhost send nothing, even with keys in `.env`.
 */
export const analyticsEnabled =
  import.meta.env.PROD &&
  appHostname !== 'localhost' &&
  appHostname !== '127.0.0.1' &&
  Boolean(PUBLIC_POSTHOG_PROJECT_TOKEN && PUBLIC_POSTHOG_HOST)
