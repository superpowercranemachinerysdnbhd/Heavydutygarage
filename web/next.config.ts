import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Job photos are uploaded through server actions.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default nextConfig;
