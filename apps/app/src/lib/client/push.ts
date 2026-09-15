import { PUBLIC_VAPID_PUBLIC_KEY } from 'astro:env/client'

/** Nothing to offer when no VAPID key is configured, or on a browser without push */
export const pushAvailable = () =>
  Boolean(PUBLIC_VAPID_PUBLIC_KEY) &&
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

/** base64url to the bytes the browser wants for applicationServerKey */
function toKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index)
  return bytes
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushAvailable()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/**
 * Asks the browser for permission and creates the subscription. Returns null when the person
 * says no, which is a normal answer and not an error.
 */
export async function subscribe(): Promise<PushSubscription | null> {
  if (!pushAvailable()) return null
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await navigator.serviceWorker.ready
  return (
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toKey(PUBLIC_VAPID_PUBLIC_KEY as string),
    }))
  )
}
