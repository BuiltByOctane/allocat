import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: "https://allocat.app",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: "https://allocat.app/auth/login",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://allocat.app/auth/signup",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
