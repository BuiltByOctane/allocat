"use client";

import { Suspense } from "react";
import WhatsNewPage from "@/components/whats-new/WhatsNewPage";

export default function Page() {
  // WhatsNewPage reads `?e=` via useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <WhatsNewPage />
    </Suspense>
  );
}
