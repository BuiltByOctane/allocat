import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/budget",
          "/net-worth",
          "/debt",
          "/goals",
          "/profile",
          "/activity",
          "/onboarding",
          "/share-target",
          "/~offline",
        ],
      },
    ],
    sitemap: "https://allocat.xyz/sitemap.xml",
    host: "https://allocat.xyz",
  };
}
