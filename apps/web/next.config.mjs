import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
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
