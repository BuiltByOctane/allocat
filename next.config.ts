import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // The Capacitor app loads the dev server over the LAN (CAP_SERVER_URL=
  // http://<mac-ip>:3000), so /_next/* requests arrive cross-origin. Whitelist
  // private-LAN ranges so Next's dev cross-origin guard doesn't block them.
  allowedDevOrigins: ["10.168.3.228", "192.168.1.20", "192.168.1.3"],
  // PostHog is proxied first-party (lib/analytics/client.ts api_host) so
  // ad-blockers don't drop it. Required by PostHog's trailing-slash endpoints.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
    const assets = host.replace("://us.i.", "://us-assets.i.").replace("://eu.i.", "://eu-assets.i.");
    return [
      { source: "/ingest/static/:path*", destination: `${assets}/static/:path*` },
      { source: "/ingest/:path*", destination: `${host}/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The app is never framed (Capacitor loads it top-level).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
  experimental: {
    // Next 15+ stopped reusing page segments from the client Router Cache on
    // forward <Link>/router nav (default staleTimes.dynamic = 0). That made
    // every navigation refetch the route's RSC payload (`?_rsc`) from the
    // server before the page could commit — the tab highlights instantly
    // (client) but the page arrives late. This app is offline-first: real data
    // comes from IndexedDB/React Query, so the RSC payload is just a near-static
    // shell and is safe to reuse. Opt page segments back into the cache so
    // prefetched/visited routes navigate instantly with no `?_rsc` round-trip.
    staleTimes: {
      dynamic: 180,
      static: 300,
    },
  },
};

export default nextConfig;
