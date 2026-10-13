import { NotificationBell } from "@/components/notification-bell";
import { GlobalSearch } from "@/components/global-search";
import { AccountMenu } from "@/components/account-menu";

/**
 * Command bar. Search, notifications and the account menu are the real controls; the page title
 * lives in each page's own header so it is never shown twice.
 */
export function AppHeader() {
  return (
    <header className="sticky top-3 z-20 mb-5 flex items-center gap-2 rounded-2xl border border-border bg-canvas/95 px-2.5 py-2 shadow-raised backdrop-blur supports-[backdrop-filter]:bg-canvas/85 md:gap-3">
      <GlobalSearch />
      <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  );
}
