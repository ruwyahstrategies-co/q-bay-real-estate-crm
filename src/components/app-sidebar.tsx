import { Link, useRouterState } from "@tanstack/react-router";
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
} from "lucide-react";
import { APP_CONFIG } from "@/lib/config";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
};

const navItems: NavItem[] = [
  { to: "/overview", label: "Overview", icon: LayoutGrid },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/properties", label: "Properties", icon: Building2 },
  { to: "/conversations", label: "Conversations", icon: MessagesSquare },
  { to: "/uploads", label: "Uploads", icon: Upload },
  { to: "/ai-insights", label: "AI Insights", icon: Sparkles },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/property-demand", label: "Property Demand", icon: BarChart3 },
  { to: "/marketing-intelligence", label: "Marketing Intelligence", icon: Megaphone },
  { to: "/team", label: "Team", icon: UserCog },
  { to: "/ai-receptionist", label: "AI Receptionist", icon: PhoneCall },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[80px] flex-col items-center bg-sidebar py-5 md:flex">
      <Link
        to="/overview"
        className="flex h-11 w-11 items-center justify-center"
        aria-label={APP_CONFIG.productName}
      >
        <BrandMark className="h-8 w-8 text-white" />
      </Link>

      <nav className="mt-8 flex flex-1 flex-col items-center gap-1.5">
        {navItems.map((item) => {
          const active =
            pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                active
                  ? "bg-pastel-cream text-foreground"
                  : "text-white/55 hover:bg-white/5 hover:text-white",
              )}
              aria-label={item.label}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
              <span className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-primary-foreground group-hover:block">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <button
        className="flex h-10 w-10 items-center justify-center rounded-lg text-white/55 hover:bg-white/5 hover:text-white"
        aria-label="Sign out"
        disabled
      >
        <LogOut className="h-[18px] w-[18px]" strokeWidth={1.9} />
      </button>
    </aside>
  );
}

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = navItems.slice(0, 5);
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
