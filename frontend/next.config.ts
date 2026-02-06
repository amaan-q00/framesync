import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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