/**
 * A small, dependency-free server boundary for modules that handle environment
 * configuration and actor identity. These modules are intentionally imported
 * only by route handlers and server composition code.
 */
export function assertServerRuntime(moduleName: string) {
  if (typeof window !== "undefined") {
    throw new Error(`${moduleName} is server-only`);
  }
}
