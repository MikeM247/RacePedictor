import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // E2E runs can opt into an isolated build directory without disturbing a
  // developer's active Next server or its .next lock.
  distDir: process.env.RACEPREDICTOR_NEXT_DIST_DIR || ".next",
  experimental: {
    externalDir: true,
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
