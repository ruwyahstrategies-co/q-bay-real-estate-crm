import { Bell, Search, ChevronDown } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useCurrentUser } from "@/hooks/use-auth";

const titles: Record<string, string> = {
  "/overview": "Overview",
  "/leads": "Leads",
  "/properties": "Properties",
  "/conversations": "Conversations",
  "/uploads": "Uploads",
  "/ai-insights": "AI Insights",
  "/pipeline": "Pipeline",
  "/team": "Team",
  "/ai-receptionist": "AI Receptionist",
  "/settings": "Settings",
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
  const { displayName } = useCurrentUser();
  const initials = displayName.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "—";

  return (
    <header className="flex items-center justify-between gap-4 pb-6">
      <h1 className="text-[28px] font-semibold leading-none tracking-tight text-foreground">
        {title}
      </h1>
      <div className="flex items-center gap-2">
        <button
          aria-label="Search"
          className="glass flex h-9 w-9 items-center justify-center rounded-full text-foreground transition hover:bg-white/80"
        >
          <Search className="h-[16px] w-[16px]" strokeWidth={2} />
        </button>
        <button
          aria-label="Notifications"
          className="glass flex h-9 w-9 items-center justify-center rounded-full text-foreground transition hover:bg-white/80"
        >
          <Bell className="h-[16px] w-[16px]" strokeWidth={2} />
        </button>
        <button
          className="glass flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium text-foreground transition hover:bg-white/80"
          aria-label="Account"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pastel-purple text-[11px] font-semibold text-foreground ring-1 ring-white/60">
            {initials}
          </span>
          <span className="hidden sm:inline">{displayName}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}
