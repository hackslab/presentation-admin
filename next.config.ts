import type { NextConfig } from "next";

const REQUEST_BODY_LIMIT = "8mb";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: REQUEST_BODY_LIMIT,
  },
  async rewrites() {
    const apiBase = process.env.API_BASE_URL ?? "http://localhost:3000";

    return [
      {
        source: "/backend/:path*",
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
