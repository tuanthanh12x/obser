import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    // Proxy API calls to the backend service inside the Docker network.
    // This keeps the browser on the same origin (no CORS) while the Next.js server
    // forwards requests to FastAPI.
    const target = process.env.API_PROXY_TARGET ?? "http://backend:8000";

    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
