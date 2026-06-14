import BottomDock from "@/components/BottomDock";
import SidebarNav from "@/components/SidebarNav";
import { SyncProvider } from "@/lib/providers/SyncProvider";
import { QuickActionProvider } from "@/lib/providers/QuickActionProvider";
import { SyncStatusBadge } from "@/components/ui/SyncStatusBadge";
import { InstallPrompt } from "@/components/ui/InstallPrompt";
import { BadgeUpdater } from "@/components/pwa/BadgeUpdater";
import { PushPermissionPrompt } from "@/components/pwa/PushPermissionPrompt";
import { SmsBridge } from "@/components/pwa/SmsBridge";
import { AdaptyBridge } from "@/components/pwa/AdaptyBridge";
import { NativeSetup } from "@/components/pwa/NativeSetup";
import { TourPrompt } from "@/components/tour/TourPrompt";
import { TourProvider } from "@/lib/tour/TourContext";
import { CurrencyProvider } from "@/lib/providers/CurrencyProvider";
import { EntitlementProvider } from "@/lib/providers/EntitlementProvider";
import { PaywallProvider } from "@/lib/providers/PaywallProvider";
import { TrialWelcomeModal } from "@/components/subscription/TrialWelcomeModal";
import { PullToRefresh } from "@/components/PullToRefresh";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TourProvider>
    <SyncProvider>
    <CurrencyProvider>
    <EntitlementProvider>
    <PaywallProvider>
    <QuickActionProvider>
      <div
        className="relative flex flex-col min-h-[100dvh] w-full max-w-[480px] mx-auto md:max-w-full md:flex-row bg-background overflow-x-hidden md:overflow-x-visible"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* Sync status indicator — top-right, only visible when offline or syncing */}
        <div
          className="fixed right-4 z-50"
          style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        >
          <SyncStatusBadge />
        </div>
        <SidebarNav />
        {/* Mobile scrolls at the document level (not an inner overflow container)
            so the fixed glass dock's backdrop-filter can actually sample the
            page content behind it. Desktop keeps its own h-screen scroller. */}
        <main className="flex-1 pb-28 md:pb-0 no-scrollbar md:h-screen md:overflow-y-auto w-full relative">
          <PullToRefresh>
            <div className="md:max-w-5xl md:mx-auto w-full pb-10">
              {children}
            </div>
          </PullToRefresh>
        </main>
        <InstallPrompt />
        <SmsBridge />
        <AdaptyBridge />
        <TourPrompt />
        <NativeSetup />
        <BadgeUpdater />
        <TrialWelcomeModal />
        <BottomDock />
      </div>
    </QuickActionProvider>
    </PaywallProvider>
    </EntitlementProvider>
    </CurrencyProvider>
    </SyncProvider>
    </TourProvider>
  );
}
