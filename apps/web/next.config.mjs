import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
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
