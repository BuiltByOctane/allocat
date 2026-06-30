import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // The Capacitor app loads the dev server over the LAN (CAP_SERVER_URL=
  // http://<mac-ip>:3000), so /_next/* requests arrive cross-origin. Whitelist
  // private-LAN ranges so Next's dev cross-origin guard doesn't block them.
  allowedDevOrigins: ["10.168.3.228", "192.168.1.20"],
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
