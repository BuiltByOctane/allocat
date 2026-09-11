import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (build output)
     * - api (route handlers authenticate themselves — see skipsAuth)
     * - the service worker, manifest and other static top-level assets
     * - image files
     *
     * Everything matched here pays a Supabase Auth round trip, so the list is
     * worth keeping tight.
     */
    "/((?!_next/static|_next/image|api/|favicon.ico|sw.js|swe-worker-.*|workbox-.*|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt|woff2?)$).*)",
  ],
};
