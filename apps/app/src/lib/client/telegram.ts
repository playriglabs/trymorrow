/** Set once per load by the detection script in the layout, before any island hydrates */
declare global {
  interface Window {
    __morrowTelegram?: boolean
  }
}

/** True when the app is running inside a Telegram Mini App webview */
export const inTelegram = () => typeof window !== 'undefined' && window.__morrowTelegram === true
