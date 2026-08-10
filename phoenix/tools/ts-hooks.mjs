/**
 * Let plain `node` import the app's own TypeScript source.
 *
 * Node strips TypeScript types on its own, but it resolves imports strictly:
 * the app writes `from "./taxonomy"` the way every bundler expects, and Node
 * wants `./taxonomy.ts`. This hook adds the extension it is missing, and
 * nothing else.
 *
 * The point is that a terminal script can build the REAL scan prompt from the
 * real source, rather than a hand-copied approximation that drifts out of date
 * — which is exactly how a diagnostic tool ends up confidently measuring
 * something the app never sends.
 */
const EXTENSIONLESS = /\.[a-zA-Z0-9]+$/;

export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !EXTENSIONLESS.test(specifier)) {
    for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
      try {
        return await next(specifier + ext, context);
      } catch {
        /* try the next extension */
      }
    }
  }
  return next(specifier, context);
}
