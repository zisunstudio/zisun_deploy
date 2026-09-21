import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/legal";

/**
 * There was no robots.txt at all — the path 404'd.
 *
 * That is ambiguous to an automated reviewer: Google's OAuth app
 * verification fetches the home page and the privacy policy, and a site
 * that cannot say whether it wants to be crawled is a site whose policy
 * page may be reported "unresponsive". This says yes, explicitly, and
 * points at the sitemap. The console is disallowed because it is a private
 * tool behind a login, not because it is secret — the API enforces that.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/login", "/checkout", "/profile"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
