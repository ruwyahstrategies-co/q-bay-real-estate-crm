import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert, UserX, LogOut } from "lucide-react";
import { AppSidebar, MobileBottomNav } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { BrandMark } from "./brand-mark";
import { Button } from "./ui-primitives";
import { useCurrentUser, signOut } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "qbay:sidebar-collapsed";

function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
}

function AccountStatusScreen({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  const navigate = useNavigate();
  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-canvas p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground">
          {icon}
        </div>
        <h1 className="mt-4 text-base font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <Button variant="outline" size="sm" className="mt-5 w-full" onClick={handleSignOut}>
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const { status } = useCurrentUser();
  const navigate = useNavigate();

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    if (status === "unauthenticated") {
      navigate({ to: "/login" });
    }
  }, [status, navigate]);

  if (status === "loading" || status === "resolving" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar">
        <div className="flex flex-col items-center gap-3 text-white/60">
          <BrandMark className="h-8 w-8 animate-pulse text-white" />
          <p className="text-xs">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (status === "unprovisioned") {
    return (
      <AccountStatusScreen
        icon={<ShieldAlert className="h-5 w-5" />}
        title="Account not provisioned"
        description="Your login works, but no staff profile is linked to it yet. Ask an administrator to create or link your Q-Bay staff account from Team."
      />
    );
  }

  if (status === "inactive") {
    return (
      <AccountStatusScreen
        icon={<UserX className="h-5 w-5" />}
        title="Account disabled"
        description="Your staff account has been deactivated. Contact an administrator if you believe this is a mistake."
      />
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
