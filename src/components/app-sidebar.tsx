import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  Users,
  Building2,
  Building,
  MessagesSquare,
  MessageCircle,
  Upload,
  Sparkles,
  KanbanSquare,
  UserCog,
  CalendarCheck2,
  CalendarDays,
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
  ClipboardList,
  KeyRound,
  Globe,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { APP_CONFIG } from "@/lib/config";
import { cn } from "@/lib/utils";
import qbayLogo from "@/assets/qbay-logo.png";
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
  { key: "calendar", to: "/calendar", label: "Calendar", icon: CalendarDays, module: "overview" },
  {
    key: "leads",
    to: "/leads",
    label: "Leads",
    icon: Users,
    module: "leads",
    children: [
      { to: "/pipeline", label: "Pipeline", icon: KanbanSquare, module: "pipeline" },
      { to: "/conversations", label: "Conversations", icon: MessagesSquare, module: "conversations" },
      { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle, module: "conversations" },
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
  { key: "requests", to: "/requests", label: "Requests", icon: ClipboardList, module: "requests" },
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

export const SIDEBAR_WIDTH_COLLAPSED = 76;
export const SIDEBAR_WIDTH_EXPANDED = 236;

/** Active = lighter tone of the sidebar green plus an accent bar; idle = quiet, lifts on hover. */
const ITEM_ACTIVE = "bg-white/[0.13] text-white";
const ITEM_IDLE = "text-white/60 hover:bg-white/[0.07] hover:text-white";

function isActivePath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(to + "/");
}

/**
 * Resolves each group's own-page + permission-filtered children, dropping groups nobody can see.
 *
 * A group with its own page (Accounting, Team, Leads...) is shown only to people who can open that page.
 * Someone who can open a sub-page but not the parent (for example Analytics without Accounting) sees that
 * sub-page on its own, never under a heading they have not been given. Pure parents with no page of their
 * own (Website) stay visible through their children.
 */
function useVisibleGroups() {
  const { can } = usePermissions();
  return navGroups.flatMap((group) => {
    const ownPageVisible = !!group.module && can(group.module, "view");
    const children = (group.children ?? []).filter((c) => can(c.module, "view"));
    if (ownPageVisible || (!group.module && children.length > 0)) {
      return [{ group, ownPageVisible, children }];
    }
    return children.map((child) => ({
      group: {
        key: `${group.key}:${child.to}`,
        to: child.to,
        label: child.label,
        icon: child.icon,
        module: child.module,
      } as NavGroup,
      ownPageVisible: true,
      children: [] as NavLeaf[],
    }));
  });
}

/**
 * One icon in the collapsed rail. The label / sub-pages flyout is rendered through a portal at a
 * fixed position taken from the icon, because the nav scrolls and clips its children. It opens on
 * hover or keyboard focus, closes after a short grace period (so the pointer can cross from the
 * icon to the flyout), and closes on Escape.
 */
function CollapsedItem({
  group,
  ownPageVisible,
  children,
  pathname,
  active,
}: {
  group: NavGroup;
  ownPageVisible: boolean;
  children: NavLeaf[];
  pathname: string;
  active: boolean;
}) {
  const Icon = group.icon;
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const open = () => {
    clearTimeout(timer.current);
    setRect(ref.current?.getBoundingClientRect() ?? null);
  };
  const scheduleClose = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRect(null), 140);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const iconCls = cn(
    "flex h-10 w-10 items-center justify-center rounded-xl text-sm transition-colors",
    active ? ITEM_ACTIVE : ITEM_IDLE,
  );

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocus={open}
      onBlur={scheduleClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") setRect(null);
      }}
    >
      {active && (
        <span aria-hidden className="absolute -left-2 bottom-2 top-2 w-[3px] rounded-r-full bg-qbay-soft" />
      )}
      {ownPageVisible && group.to ? (
        <Link to={group.to} className={iconCls} aria-label={group.label}>
          <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.9} />
        </Link>
      ) : (
        <button type="button" className={iconCls} aria-label={group.label} aria-haspopup="menu" aria-expanded={!!rect}>
          <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.9} />
        </button>
      )}
      {rect &&
        createPortal(
          <div
            style={{ position: "fixed", left: rect.right, top: rect.top }}
            className="z-50 pl-3"
            onMouseEnter={open}
            onMouseLeave={scheduleClose}
            onFocus={open}
            onBlur={scheduleClose}
          >
            <div
              role="menu"
              aria-label={group.label}
              className="min-w-[190px] rounded-xl border border-white/10 bg-sidebar p-1.5 shadow-pop"
            >
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground/60">
                {group.label}
              </p>
              {children.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {children.map((child) => {
                    const ChildIcon = child.icon;
                    const childIsActive = isActivePath(pathname, child.to);
                    return (
                      <Link
                        key={child.to}
                        to={child.to}
                        role="menuitem"
                        onClick={() => setRect(null)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
                          childIsActive
                            ? "bg-white/15 text-primary-foreground"
                            : "text-primary-foreground/80 hover:bg-white/10",
                        )}
                      >
                        <ChildIcon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.9} />
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
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
        "fixed left-0 top-0 z-30 hidden h-screen flex-col bg-sidebar py-4 transition-[width] duration-200 ease-out md:flex",
      )}
      style={{ width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
    >
      <div className={cn("flex items-center", collapsed ? "justify-center px-0" : "px-5")}>
        <Link
          to="/overview"
          className={cn(
            "flex flex-shrink-0 items-center overflow-hidden",
            collapsed ? "h-11 w-11 justify-center" : "h-12 w-full justify-start",
          )}
          aria-label={APP_CONFIG.productName}
        >
          {/* The real Q-Bay logo. Collapsed, only its Q glyph (left edge of the same image) shows. */}
          <img
            src={qbayLogo}
            alt="Q-Bay Real Estate"
            className={cn(
              "h-11 w-auto max-w-none select-none",
              collapsed && "h-10 w-[29px] object-cover object-left",
            )}
            draggable={false}
          />
        </Link>
      </div>

      <nav className={cn("mt-6 flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden scrollbar-dark", collapsed ? "items-center px-2" : "px-3")}>
        {visibleGroups.map(({ group, ownPageVisible, children }) => {
          const Icon = group.icon;
          const isOpen = openKey === group.key && children.length > 0;
          const ownActive = ownPageVisible && !!group.to && isActivePath(pathname, group.to);
          const childActive = children.some((c) => isActivePath(pathname, c.to));
          const active = ownActive || childActive;
          const hasChildren = children.length > 0;

          if (collapsed) {
            return (
              <CollapsedItem
                key={group.key}
                group={group}
                ownPageVisible={ownPageVisible}
                children={children}
                pathname={pathname}
                active={active}
              />
            );
          }

          return (
            <div key={group.key}>
              <div
                className={cn(
                  "relative flex h-9 items-center rounded-lg text-sm transition-colors",
                  active ? ITEM_ACTIVE : ITEM_IDLE,
                )}
              >
                {active && (
                  <span aria-hidden className="absolute -left-3 bottom-2 top-2 w-[3px] rounded-r-full bg-qbay-soft" />
                )}
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
                              "flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] transition-colors",
                              childActiveOne ? "bg-white/[0.12] text-white" : "text-white/55 hover:bg-white/[0.07] hover:text-white",
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
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-qbay-soft text-[11px] font-semibold text-qbay">
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
    .slice(0, 6);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-white/10 bg-sidebar px-2 py-2 md:hidden">
      {items.map((item) => {
        const active = isActivePath(pathname, item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px]",
              active ? "bg-white/[0.12] text-white" : "text-white/60",
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
