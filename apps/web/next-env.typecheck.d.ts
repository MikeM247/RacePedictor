/// <reference types="next" />
/// <reference types="next/image-types/global" />

// Stable CI/typecheck entrypoint. Next rewrites next-env.d.ts to reference the
// active development or production cache, which may be changing concurrently.
