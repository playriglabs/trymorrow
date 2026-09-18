/**
 * Copies text to the clipboard, reporting whether it worked.
 *
 * `navigator.clipboard` only exists in a secure context, so on the dev server reached by its
 * LAN address (a phone testing the real thing) it's undefined and an unguarded call throws
 * before the button can react. The textarea fallback still works there.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission refused or the page lost focus; the fallback below may still land
  }
  return copyViaTextarea(text)
}

function copyViaTextarea(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  // Off-screen rather than hidden: Safari won't select from a display:none field
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)

  const selection = document.getSelection()
  const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }

  textarea.remove()
  // Put the user's own selection back the way they left it
  if (selection && previous) {
    selection.removeAllRanges()
    selection.addRange(previous)
  }
  return copied
}
