/** Crockford base32: every unambiguous glyph, so a hand-copied code still reads back */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 16

/** Pasted dashes, spaces and lowercase are all noise; what reaches the wire is 16 clean symbols */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replaceAll(/[^A-Z0-9]/g, '')
}

export function formatCode(code: string): string {
  return code.replace(/(.{4})/g, '$1-').replace(/-$/, '')
}

export function generateCode(): string {
  const values = crypto.getRandomValues(new Uint32Array(CODE_LENGTH))
  // 32 divides 2^32 evenly, so the modulo is bias-free
  return Array.from(values, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('')
}
