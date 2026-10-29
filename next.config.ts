import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep portable-compiler builds from spawning a WASM instance per host core.
  experimental: { cpus: 2, proxyClientMaxBodySize: "26mb" },
  distDir: process.env.DMS_BUILD_DIR || ".next",
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    ] }];
  },
};

export default nextConfig;
