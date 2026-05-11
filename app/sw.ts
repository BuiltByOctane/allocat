/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
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
