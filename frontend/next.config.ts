import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    // Proxy API calls to the backend service.
    // This keeps the browser on the same origin (no CORS) while the Next.js server
    // forwards requests to FastAPI.
    //
    // Auto-detect target:
    // - If API_PROXY_TARGET is set, use it (e.g., http://backend:8000 in Docker, http://localhost:8000 locally)
    // - Otherwise, default to localhost for local dev, backend:8000 for Docker
    const target =
      process.env.API_PROXY_TARGET ??
      (process.env.NODE_ENV === "production" ? "http://backend:8000" : "http://localhost:8000");

    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
