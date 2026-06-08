/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// In Capacitor remote-URL mode the WebView loads the deployed app over the
// network, so App Router client navigations (`?_rsc` payload fetches) hit the
// network on every <Link> tap. Serwist's `defaultCache` serves these
// NetworkFirst — it blocks on a full round-trip to the origin before the page
// can render, which on a mobile connection reads as nav "lag" (the tab
// highlights instantly via useLinkStatus, but the page arrives late).
//
// These rules override the RSC + RSC-prefetch caches to StaleWhileRevalidate:
// serve the cached route shell instantly, revalidate in the background. Safe
// here because real data comes from IndexedDB, not the RSC payload — the shell
// is near-static. Matchers mirror @serwist/next's defaults; reusing the same
// cacheNames shares storage with the precached/runtime entries. Prepended so
// they win over the NetworkFirst entries in `defaultCache`. Full-document
// navigations ("pages") stay NetworkFirst so a cold app launch gets a fresh
// shell.
const swrPageCache: RuntimeCaching[] = [
  {
    matcher: ({ request, url: { pathname }, sameOrigin }) =>
      request.headers.get("RSC") === "1" &&
      request.headers.get("Next-Router-Prefetch") === "1" &&
      sameOrigin &&
      !pathname.startsWith("/api/"),
    handler: new StaleWhileRevalidate({
      cacheName: "pages-rsc-prefetch",
      plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })],
    }),
  },
  {
    matcher: ({ request, url: { pathname }, sameOrigin }) =>
      request.headers.get("RSC") === "1" &&
      sameOrigin &&
      !pathname.startsWith("/api/"),
    handler: new StaleWhileRevalidate({
      cacheName: "pages-rsc",
      plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...swrPageCache, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

interface PushPayload {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
  icon?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  let data: PushPayload = {};
  try {
    data = (event.data?.json() as PushPayload) ?? {};
  } catch {
    const fallback = event.data?.text();
    if (fallback) data = { body: fallback };
  }

  const title = data.title ?? "AlloCat";
  const options: NotificationOptions = {
    body: data.body ?? "",
    tag: data.tag ?? "allocat",
    badge: "/android/launchericon-192x192.png",
    icon: data.icon ?? "/android/launchericon-192x192.png",
    data: { url: data.url ?? "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data as { url?: string } | null)?.url ?? "/dashboard";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const targetPath = new URL(targetUrl, self.location.origin).pathname;
      const existing = all.find((c) => {
        try {
          return new URL(c.url).pathname.startsWith(targetPath);
        } catch {
          return false;
        }
      });
      if (existing) {
        await (existing as WindowClient).focus();
        if ("navigate" in existing) {
          await (existing as WindowClient).navigate(targetUrl).catch(() => {});
        }
        return;
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
