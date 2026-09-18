/**
 * The icons a watchlist can wear. A short, deliberate set beats the system picker: every one of
 * these reads at 20px, and they cover the way people actually group stocks — a theme, a mood, a
 * plan. Grouped only so the grid has some order to it.
 */
export const EMOJI_GROUPS = [
  { label: 'Favourites', emojis: ['⭐️', '🔥', '🚀', '👀', '🎯', '🏆', '💡', '🌱'] },
  { label: 'Money', emojis: ['📈', '📊', '🏦', '💳', '🪙', '🧾', '🛟', '🎁'] },
  { label: 'Tech', emojis: ['🤖', '🧠', '💻', '📱', '🔋', '⚡️', '🛰️', '🧬'] },
  { label: 'Everyday', emojis: ['🛒', '☕️', '🍔', '👟', '🎮', '🎬', '🏠', '✈️'] },
  { label: 'Industry', emojis: ['🚗', '🏭', '⚔️', '💊', '🩺', '🏗️', '🌍', '⚙️'] },
] as const

export const EMOJI_CHOICES = EMOJI_GROUPS.flatMap((group) => group.emojis)
