import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  Users,
  Building2,
  MessagesSquare,
  Upload,
  Sparkles,
  KanbanSquare,
  UserCog,
  PhoneCall,
  Settings,
  LogOut,
  BarChart3,
  Megaphone,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { APP_CONFIG } from "@/lib/config";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { usePermissions, useCurrentUser, signOut } from "@/hooks/use-auth";
import type { ModuleKey } from "@/lib/permissions";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  module: ModuleKey;
};

const navItems: NavItem[] = [
  { to: "/overview", label: "Overview", icon: LayoutGrid, module: "overview" },
  { to: "/leads", label: "Leads", icon: Users, module: "leads" },
  { to: "/properties", label: "Properties", icon: Building2, module: "properties" },
  { to: "/conversations", label: "Conversations", icon: MessagesSquare, module: "conversations" },
  { to: "/uploads", label: "Uploads", icon: Upload, module: "uploads" },
  { to: "/ai-insights", label: "AI Insights", icon: Sparkles, module: "ai_insights" },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare, module: "pipeline" },
  { to: "/property-demand", label: "Property Demand", icon: BarChart3, module: "property_demand" },
  { to: "/marketing-intelligence", label: "Marketing Intelligence", icon: Megaphone, module: "marketing_intelligence" },
  { to: "/team", label: "Team", icon: UserCog, module: "team" },
  { to: "/ai-receptionist", label: "AI Receptionist", icon: PhoneCall, module: "ai_receptionist" },
  { to: "/settings", label: "Settings", icon: Settings, module: "settings" },
];

export const SIDEBAR_WIDTH_COLLAPSED = 80;
export const SIDEBAR_WIDTH_EXPANDED = 248;

function useVisibleNavItems() {
  const { can } = usePermissions();
  return navItems.filter((item) => can(item.module, "view"));
}

export function AppSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = useVisibleNavItems();
  const { displayName, roleLabel } = useCurrentUser();
  const navigate = useNavigate();
  const initials = displayName.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "—";

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 hidden h-screen flex-col bg-sidebar py-5 transition-[width] duration-200 ease-out md:flex",
      )}
      style={{ width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
    >
      <div className={cn("flex items-center gap-2.5", collapsed ? "justify-center px-0" : "px-5")}>
        <Link to="/overview" className="flex h-11 w-11 flex-shrink-0 items-center justify-center" aria-label={APP_CONFIG.productName}>
          <BrandMark className="h-8 w-8 text-white" />
        </Link>
        {!collapsed && (
          <div className="min-w-0 overflow-hidden">
            <p className="truncate text-sm font-semibold leading-tight text-white">{APP_CONFIG.companyName}</p>
            <p className="truncate text-[11px] leading-tight text-white/45">{APP_CONFIG.productDescriptor}</p>
          </div>
        )}
      </div>

      <nav className={cn("mt-8 flex flex-1 flex-col gap-1 overflow-y-auto scrollbar-dark", collapsed ? "items-center px-2" : "px-3")}>
        {items.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group relative flex h-10 items-center rounded-lg text-sm transition-colors",
                collapsed ? "w-10 justify-center" : "w-full gap-3 px-3",
                active ? "bg-pastel-cream text-foreground" : "text-white/55 hover:bg-white/5 hover:text-white",
              )}
              aria-label={item.label}
            >
              <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.9} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {collapsed && (
                <span className="pointer-events-none absolute left-full ml-3 z-40 hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-primary-foreground group-hover:block">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className={cn("mt-2 flex flex-col gap-2 border-t border-white/10 pt-3", collapsed ? "items-center px-2" : "px-3")}>
        <button
          onClick={onToggle}
          className={cn(
            "flex h-9 items-center rounded-lg text-white/50 transition-colors hover:bg-white/5 hover:text-white",
            collapsed ? "w-9 justify-center" : "w-full gap-2 px-3 text-xs",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>

        <div className={cn("flex items-center gap-2.5 rounded-lg py-1.5", collapsed ? "justify-center" : "px-1")}>
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-pastel-purple text-[11px] font-semibold text-foreground">
            {initials}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-xs font-medium text-white">{displayName}</p>
              <p className="truncate text-[10px] capitalize text-white/45">{roleLabel.replace(/_/g, " ")}</p>
            </div>
          )}
        </div>

        <button
          onClick={handleSignOut}
          className={cn(
            "flex h-9 items-center rounded-lg text-white/55 transition-colors hover:bg-white/5 hover:text-white",
            collapsed ? "w-9 justify-center" : "w-full gap-2 px-3 text-xs",
          )}
          aria-label="Sign out"
        >
          <LogOut className="h-[16px] w-[16px]" strokeWidth={1.9} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = useVisibleNavItems().slice(0, 5);
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-border bg-sidebar px-2 py-2 md:hidden">
      {items.map((item) => {
        const active =
          pathname === item.to || pathname.startsWith(item.to + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-[10px]",
              active ? "text-white" : "text-white/55",
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.9} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
