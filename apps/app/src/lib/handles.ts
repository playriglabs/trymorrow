/**
 * A handle is the whole gift link (app.trymorrow.money/maya), so it has to be short enough to say out
 * loud and type on a phone. The browser, the API and the database all check this same shape.
 */
export const MIN_HANDLE = 3
export const MAX_HANDLE = 10

export const HANDLE_PATTERN = new RegExp(`^[a-z0-9_]{${MIN_HANDLE},${MAX_HANDLE}}$`)
