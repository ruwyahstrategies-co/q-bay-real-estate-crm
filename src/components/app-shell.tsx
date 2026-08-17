import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AppSidebar, MobileBottomNav } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { BrandMark } from "./brand-mark";
import { useCurrentUser } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "qbay:sidebar-collapsed";

function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const { loading, authUser } = useCurrentUser();
  const navigate = useNavigate();

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    if (!loading && !authUser) {
      navigate({ to: "/login" });
    }
  }, [loading, authUser, navigate]);

  if (loading || !authUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar">
        <div className="flex flex-col items-center gap-3 text-white/60">
          <BrandMark className="h-8 w-8 animate-pulse text-white" />
          <p className="text-xs">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sidebar">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <MobileBottomNav />
      <main
        className={cn(
          "min-h-screen bg-canvas transition-[margin] duration-200 ease-out md:rounded-l-[28px]",
          collapsed ? "md:ml-[80px]" : "md:ml-[248px]",
        )}
      >
        <div className="mx-auto max-w-[1600px] px-5 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">
          <AppHeader />
          {children}
        </div>
      </main>
    </div>
  );
}
