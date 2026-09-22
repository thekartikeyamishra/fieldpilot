import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.APP_URL.replace(/\/$/, "");
  const pages = ["", "/pricing", "/about", "/contact", "/terms", "/privacy", "/refunds", "/login", "/signup"];
  return pages.map((p) => ({ url: `${base}${p}`, changeFrequency: p === "" ? "weekly" : "monthly", priority: p === "" ? 1 : 0.5 }));
}
