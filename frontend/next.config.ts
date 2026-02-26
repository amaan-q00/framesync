import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 uses Turbopack by default; empty config acknowledges that (webpack is for dev watchOptions only).
  turbopack: {},
  webpack: (config, context) => {
    // Enable polling for Docker on Windows
    config.watchOptions = {
      poll: 1000,   // Check for changes every 1000ms (1 second)
      aggregateTimeout: 300,   // Wait 300ms after a change before rebuilding
    };
    return config;
  },
};

export default nextConfig;