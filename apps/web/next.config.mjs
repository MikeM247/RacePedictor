/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Required because the web app imports from the monorepo package at ../../packages/core.
    externalDir: true,
  },
  transpilePackages: ["@racepredictor/core"],
};

export default nextConfig;
