import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * One canonical host. Serving the same pages on both the apex and www splits
   * SEO between two hosts and, more practically, breaks the session cookie: a
   * cookie set on fieldpilot.me is not sent to www.fieldpilot.me, so a user who
   * signs in on one and lands on the other is silently signed out.
   */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.fieldpilot.me" }],
        destination: "https://fieldpilot.me/:path*",
        permanent: true,
      },
    ];
  },
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
