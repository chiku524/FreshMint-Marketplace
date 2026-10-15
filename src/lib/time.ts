/**
 * Request-time clock for Server Components and event handlers.
 * Wrapping Date.now() keeps the React Compiler purity lint focused on real
 * render-phase impurity in client components.
 */
export function requestNow(): number {
  return Date.now();
}
