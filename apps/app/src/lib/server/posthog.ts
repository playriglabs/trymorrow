import { PUBLIC_POSTHOG_HOST, PUBLIC_POSTHOG_PROJECT_TOKEN } from 'astro:env/client'
import { PostHog } from 'posthog-node'
import { analyticsEnabled } from '@/lib/analytics'

let client: PostHog | null | undefined

// Off means a silent no-op, never an error: these calls sit after money has already moved
function posthog(): PostHog | null {
  if (client !== undefined) return client
  client =
    analyticsEnabled && PUBLIC_POSTHOG_PROJECT_TOKEN && PUBLIC_POSTHOG_HOST
      ? new PostHog(PUBLIC_POSTHOG_PROJECT_TOKEN, {
          host: PUBLIC_POSTHOG_HOST,
          // A serverless function can freeze right after responding, so send each event at once
          flushAt: 1,
          flushInterval: 0,
          requestTimeout: 3000,
        })
      : null
  return client
}

/** Rough size of an amount, so analytics can tell small from large without exact balances. */
export function usdBand(usd: number | null): string {
  if (usd == null) return 'unknown'
  if (usd < 10) return 'under_10'
  if (usd < 50) return '10_50'
  if (usd < 250) return '50_250'
  if (usd < 1000) return '250_1000'
  return '1000_plus'
}

/**
 * Records something that really happened, from the route that did it, so ad blockers can't drop
 * it. People are known only by their Privy id: no email, handle, address or exact amount.
 */
export async function captureServerEvent({
  request,
  distinctId,
  event,
  properties,
}: {
  request: Request
  distinctId: string
  event: string
  properties?: Record<string, boolean | number | string | undefined>
}): Promise<void> {
  try {
    const analytics = posthog()
    if (!analytics) return
    analytics.capture({
      distinctId,
      event,
      properties: {
        ...properties,
        // Ties the event to the browser session that asked for it
        $session_id: request.headers.get('X-PostHog-Session-Id') ?? undefined,
      },
    })
    await analytics.flush()
  } catch (error) {
    console.error('PostHog capture failed', error)
  }
}
