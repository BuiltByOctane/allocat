import BottomNav from "@/components/BottomNav";
import SidebarNav from "@/components/SidebarNav";
import { SyncProvider } from "@/lib/providers/SyncProvider";
import { SyncStatusBadge } from "@/components/ui/SyncStatusBadge";
import { InstallPrompt } from "@/components/ui/InstallPrompt";
import { BadgeUpdater } from "@/components/pwa/BadgeUpdater";
import { PushPermissionPrompt } from "@/components/pwa/PushPermissionPrompt";
import { SmsBridge } from "@/components/pwa/SmsBridge";
import { NativeSetup } from "@/components/pwa/NativeSetup";
import { TourProvider } from "@/lib/tour/TourContext";
import { CurrencyProvider } from "@/lib/providers/CurrencyProvider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TourProvider>
    <SyncProvider>
    <CurrencyProvider>
      <div className="relative flex flex-col min-h-[100dvh] w-full max-w-[480px] mx-auto md:max-w-full md:flex-row bg-background overflow-x-hidden md:overflow-x-visible">
        {/* Sync status indicator — top-right, only visible when offline or syncing */}
        <div className="fixed top-3 right-4 z-50">
          <SyncStatusBadge />
        </div>
        <SidebarNav />
        <main className="flex-1 overflow-y-auto pb-28 md:pb-0 no-scrollbar md:h-screen w-full relative">
          <div className="md:max-w-5xl md:mx-auto w-full pb-10">
            {children}
          </div>
        </main>
        <InstallPrompt />
        <PushPermissionPrompt />
        <SmsBridge />
        <NativeSetup />
        <BadgeUpdater />
        <BottomNav />
      </div>
    </CurrencyProvider>
    </SyncProvider>
    </TourProvider>
  );
}
