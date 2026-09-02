import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  Users,
  Building2,
  Building,
  MessagesSquare,
  Upload,
  Sparkles,
  KanbanSquare,
  UserCog,
  CalendarCheck2,
  FileSignature,
  Contact2,
  Newspaper,
  Inbox,
  Wallet,
  Radar,
  Settings,
  LogOut,
  BarChart3,
  LineChart,
  Trophy,
  Megaphone,
  Camera,
  KeyRound,
  Globe,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { APP_CONFIG } from "@/lib/config";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { usePermissions, useCurrentUser, signOut } from "@/hooks/use-auth";
import type { ModuleKey } from "@/lib/permissions";

type NavLeaf = { to: string; label: string; icon: typeof LayoutGrid; module: ModuleKey };

type NavGroup = {
  key: string;
  label: string;
  icon: typeof LayoutGrid;
  /** Present when the group has its own destination (Overview, Leads, Properties...). */
  to?: string;
  /** Gates the group's own page. Pure parents (Website) omit this and are visible via their children. */
  module?: ModuleKey;
  children?: NavLeaf[];
};

const navGroups: NavGroup[] = [
  { key: "overview", to: "/overview", label: "Overview", icon: LayoutGrid, module: "overview" },
  {
    key: "leads",
    to: "/leads",
    label: "Leads",
    icon: Users,
    module: "leads",
    children: [
      { to: "/pipeline", label: "Pipeline", icon: KanbanSquare, module: "pipeline" },
      { to: "/conversations", label: "Conversations", icon: MessagesSquare, module: "conversations" },
    ],
  },
  {
    key: "properties",
    to: "/properties",
    label: "Properties",
    icon: Building2,
    module: "properties",
    children: [
      { to: "/developments", label: "Developments", icon: Building, module: "developments" },
      { to: "/viewings", label: "Viewings", icon: CalendarCheck2, module: "viewings" },
      { to: "/offers", label: "Offers", icon: FileSignature, module: "offers" },
      { to: "/property-demand", label: "Property Demand", icon: BarChart3, module: "property_demand" },
      { to: "/owners", label: "Owners", icon: Contact2, module: "owners" },
      { to: "/property-management", label: "Property Management", icon: KeyRound, module: "properties" },
      { to: "/marketing", label: "Marketing", icon: Camera, module: "marketing" },
      { to: "/marketing-intelligence", label: "Marketing Intelligence", icon: Megaphone, module: "marketing_intelligence" },
    ],
  },
  { key: "ai-insights", to: "/ai-insights", label: "AI Insights", icon: Sparkles, module: "ai_insights" },
  {
    key: "website",
    label: "Website",
    icon: Globe,
    children: [
      { to: "/journal", label: "Journal", icon: Newspaper, module: "journal" },
      { to: "/website-enquiries", label: "Website Enquiries", icon: Inbox, module: "website_enquiries" },
    ],
  },
  {
    key: "accounting",
    to: "/accounting",
    label: "Accounting",
    icon: Wallet,
    module: "accounting",
    children: [{ to: "/analytics", label: "Analytics", icon: LineChart, module: "analytics" }],
  },
  {
    key: "team",
    to: "/team",
    label: "Team",
    icon: UserCog,
    module: "team",
    children: [
      { to: "/staff-activity", label: "Staff Activity", icon: Radar, module: "staff_activity" },
      { to: "/leaderboard", label: "Leaderboard", icon: Trophy, module: "staff_activity" },
    ],
  },
  { key: "uploads", to: "/uploads", label: "Uploads", icon: Upload, module: "uploads" },
  { key: "settings", to: "/settings", label: "Settings", icon: Settings, module: "settings" },
];

export const SIDEBAR_WIDTH_COLLAPSED = 80;
export const SIDEBAR_WIDTH_EXPANDED = 248;

function isActivePath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(to + "/");
}

/** Resolves each group's own-page + permission-filtered children, dropping groups nobody can see. */
function useVisibleGroups() {
  const { can } = usePermissions();
  return navGroups
    .map((group) => {
      const ownPageVisible = !!group.module && can(group.module, "view");
      const children = (group.children ?? []).filter((c) => can(c.module, "view"));
      return { group, ownPageVisible, children };
    })
    .filter(({ ownPageVisible, children }) => ownPageVisible || children.length > 0);
}

export function AppSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const visibleGroups = useVisibleGroups();
  const { displayName, roleLabel } = useCurrentUser();
  const navigate = useNavigate();
  const initials = displayName.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "-";

  const activeGroupKey =
    visibleGroups.find(
      ({ group, ownPageVisible, children }) =>
        (ownPageVisible && group.to && isActivePath(pathname, group.to)) ||
        children.some((c) => isActivePath(pathname, c.to)),
    )?.group.key ?? null;

  const [openKey, setOpenKey] = useState<string | null>(activeGroupKey);

  // Whenever navigation lands inside a group (its own page or a child route),
  // that group becomes the one open submenu - closing whatever was open before.
  useEffect(() => {
    if (activeGroupKey) setOpenKey(activeGroupKey);
  }, [activeGroupKey]);

  function toggleGroup(key: string) {
    setOpenKey((prev) => (prev === key ? null : key));
  }

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

      <nav className={cn("mt-8 flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden scrollbar-dark", collapsed ? "items-center px-2" : "px-3")}>
        {visibleGroups.map(({ group, ownPageVisible, children }) => {
          const Icon = group.icon;
          const isOpen = openKey === group.key && children.length > 0;
          const ownActive = ownPageVisible && !!group.to && isActivePath(pathname, group.to);
          const childActive = children.some((c) => isActivePath(pathname, c.to));
          const active = ownActive || childActive;
          const hasChildren = children.length > 0;

          if (collapsed) {
            return (
              <div key={group.key} className="group relative">
                {ownPageVisible && group.to ? (
                  <Link
                    to={group.to}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg text-sm transition-colors",
                      active ? "bg-pastel-cream text-foreground" : "text-white/55 hover:bg-white/5 hover:text-white",
                    )}
                    aria-label={group.label}
                  >
                    <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.9} />
                  </Link>
                ) : (
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg text-sm",
                      active ? "bg-pastel-cream text-foreground" : "text-white/55",
                    )}
                    aria-label={group.label}
                  >
                    <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.9} />
                  </div>
                )}
                <div className="pointer-events-none absolute left-full top-0 z-40 ml-3 hidden min-w-[190px] rounded-lg border border-white/10 bg-foreground p-1.5 shadow-lg group-hover:pointer-events-auto group-hover:block">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground/60">{group.label}</p>
                  {hasChildren ? (
                    <div className="flex flex-col gap-0.5">
                      {children.map((child) => {
                        const ChildIcon = child.icon;
                        const childIsActive = isActivePath(pathname, child.to);
                        return (
                          <Link
                            key={child.to}
                            to={child.to}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                              childIsActive ? "bg-white/15 text-primary-foreground" : "text-primary-foreground/80 hover:bg-white/10",
                            )}
                          >
                            <ChildIcon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.9} />
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          }

          return (
            <div key={group.key}>
              <div
                className={cn(
                  "flex h-10 items-center rounded-lg text-sm transition-colors",
                  active ? "bg-pastel-cream text-foreground" : "text-white/55 hover:bg-white/5 hover:text-white",
                )}
              >
                {ownPageVisible && group.to ? (
                  <Link to={group.to} className="flex h-full min-w-0 flex-1 items-center gap-3 px-3" aria-label={group.label}>
                    <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.9} />
                    <span className="truncate">{group.label}</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex h-full min-w-0 flex-1 items-center gap-3 px-3 text-left"
                    aria-label={group.label}
                  >
                    <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.9} />
                    <span className="truncate">{group.label}</span>
                  </button>
                )}
                {hasChildren && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex h-full w-8 flex-shrink-0 items-center justify-center"
                    aria-label={isOpen ? `Collapse ${group.label}` : `Expand ${group.label}`}
                    aria-expanded={isOpen}
                  >
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-90")} />
                  </button>
                )}
              </div>

              {hasChildren && (
                <div
                  className="grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                >
                  <div className="min-h-0">
                    <div className="ml-[19px] mt-1 flex flex-col gap-0.5 border-l border-white/10 pl-3">
                      {children.map((child) => {
                        const ChildIcon = child.icon;
                        const childActiveOne = isActivePath(pathname, child.to);
                        return (
                          <Link
                            key={child.to}
                            to={child.to}
                            className={cn(
                              "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors",
                              childActiveOne ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white",
                            )}
                          >
                            <ChildIcon className="h-[15px] w-[15px] flex-shrink-0" strokeWidth={1.9} />
                            <span className="truncate">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
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
  const visibleGroups = useVisibleGroups();
  const items = visibleGroups
    .map(({ group, ownPageVisible, children }) => {
      if (ownPageVisible && group.to) return { to: group.to, label: group.label, icon: group.icon };
      const first = children[0];
      return first ? { to: first.to, label: group.label, icon: group.icon } : null;
    })
    .filter((x): x is { to: string; label: string; icon: typeof LayoutGrid } => !!x)
    .slice(0, 5);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-border bg-sidebar px-2 py-2 md:hidden">
      {items.map((item) => {
        const active = isActivePath(pathname, item.to);
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
