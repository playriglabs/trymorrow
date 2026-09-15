import { registerHooks } from 'node:module'

/**
 * The SDK imports its own files without extensions, the way bundlers expect. Node needs them, so
 * relative imports fall back to the `.ts` file when the exact path isn't there.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      try {
        return nextResolve(specifier, context)
      } catch {
        return nextResolve(`${specifier}.ts`, context)
      }
    }
    return nextResolve(specifier, context)
  },
})
