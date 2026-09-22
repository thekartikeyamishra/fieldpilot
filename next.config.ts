import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * One canonical host, taken from APP_URL.
   *
   * Serving the same pages on several hosts splits SEO and, worse, breaks the
   * session: a cookie set on fieldpilot.me is not sent to www.fieldpilot.me or
   * to the .vercel.app alias. A user who signs in on one and lands on another is
   * silently signed out — and after a Square checkout that is exactly what
   * happens if the redirect URL and the sign-in host differ.
   *
   * www always redirects to the apex. The .vercel.app alias redirects ONLY when
   * CANONICAL_REDIRECT=true — deliberately opt-in, because turning it on while
   * the custom domain is still broken would take down the one URL that works.
   * Preview deployments are never redirected; they need their own URLs.
   */
  async redirects() {
    const appUrl = process.env.APP_URL ?? "";
    let apex = "";
    try {
      apex = new URL(appUrl).host;
    } catch {
      return [];
    }
    if (!apex || apex.startsWith("localhost")) return [];

    const rules: Array<{ source: string; has: Array<{ type: "host"; value: string }>; destination: string; permanent: boolean }> = [];

    if (!apex.startsWith("www.")) {
      rules.push({
        source: "/:path*",
        has: [{ type: "host", value: `www.${apex}` }],
        destination: `https://${apex}/:path*`,
        permanent: true,
      });
    }

    if (process.env.CANONICAL_REDIRECT === "true" && process.env.VERCEL_ENV === "production") {
      rules.push({
        source: "/:path*",
        has: [{ type: "host", value: "(?<alias>.+)\\.vercel\\.app" }],
        destination: `https://${apex}/:path*`,
        // Temporary on purpose: if the custom domain breaks, removing the flag
        // restores the alias without browsers having cached a permanent redirect.
        permanent: false,
      });
    }

    return rules;
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
