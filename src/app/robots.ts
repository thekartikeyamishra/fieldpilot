import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Public marketing and policy pages are indexable; the application is not.
 *
 * Without this, a signed-in page that leaks a URL can end up in search results,
 * and preview deployments compete with production for the same content.
 * Preview deployments are closed to crawlers entirely.
 */
export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : env.NODE_ENV === "production";
  const base = env.APP_URL.replace(/\/$/, "");

  if (!isProduction) return { rules: [{ userAgent: "*", disallow: "/" }] };

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/about", "/contact", "/terms", "/privacy", "/refunds"],
        disallow: ["/api/", "/dashboard", "/job", "/assets", "/work", "/usage", "/import"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
