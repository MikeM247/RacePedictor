import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the framework's floating badge from covering the navigation in E2E.
  devIndicators: process.env.RACEPREDICTOR_NEXT_DIST_DIR?.startsWith(".next-e2e-") ? false : undefined,
  // E2E runs can opt into an isolated build directory without disturbing a
  // developer's active Next server or its .next lock.
  distDir: process.env.RACEPREDICTOR_NEXT_DIST_DIR || ".next",
  experimental: {
    externalDir: true,
    // Keep production type checks on the in-process compiler API. The managed
    // workspace suppresses stdout from detached child processes, which breaks
    // Next's `tsc --showConfig` JSON handshake when the CLI path is enabled.
    useTypeScriptCli: false,
  },
  typescript: {
    tsconfigPath:
      process.env.NODE_ENV === "production"
        ? "tsconfig.typecheck.json"
        : "tsconfig.json",
  },
  webpack: (config) => {
    config.resolve.modules = [
      ...(config.resolve.modules ?? []),
      path.resolve("./node_modules"),
    ];

    return config;
  },
};

export default nextConfig;
