import { useRouterState } from "@tanstack/react-router";
import { NotificationBell } from "@/components/notification-bell";
import { GlobalSearch } from "@/components/global-search";
import { AccountMenu } from "@/components/account-menu";

const titles: Record<string, string> = {
  "/overview": "Overview",
  "/leads": "Leads",
  "/properties": "Properties",
  "/developments": "Developments",
  "/viewings": "Viewings",
  "/offers": "Offers",
  "/owners": "Owners",
  "/conversations": "Conversations",
  "/uploads": "Uploads",
  "/ai-insights": "AI Insights",
  "/pipeline": "Pipeline",
  "/property-demand": "Property Demand",
  "/marketing-intelligence": "Marketing Intelligence",
  "/journal": "Journal",
  "/website-enquiries": "Website Enquiries",
  "/analytics": "Analytics",
  "/accounting": "Accounting",
  "/team": "Team",
  "/staff-activity": "Staff Activity",
  "/settings": "Settings",
  "/profile": "My Profile",
};

function deriveTitle(pathname: string): string {
  if (titles[pathname]) return titles[pathname];
  const base = "/" + pathname.split("/").filter(Boolean)[0];
  if (titles[base]) return titles[base];
  return "Overview";
}

export function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = deriveTitle(pathname);

  return (
    <header className="flex items-center justify-between gap-4 pb-6">
      <h1 className="text-[28px] font-semibold leading-none tracking-tight text-foreground">
        {title}
      </h1>
      <div className="flex items-center gap-2">
        <GlobalSearch />
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  );
}
