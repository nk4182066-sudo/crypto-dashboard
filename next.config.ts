import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Turbopack's persistent filesystem cache fails to open its database on this
  // OneDrive-backed filesystem, hanging/crashing builds. Disable it.
  experimental: {
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
