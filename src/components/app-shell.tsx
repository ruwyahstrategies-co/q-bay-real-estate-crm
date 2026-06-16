import type { ReactNode } from "react";
import { AppSidebar, MobileBottomNav } from "./app-sidebar";
import { AppHeader } from "./app-header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-sidebar">
      <AppSidebar />
      <MobileBottomNav />
      <main className="min-h-screen bg-canvas md:ml-[80px] md:rounded-l-[28px]">
        <div className="mx-auto max-w-[1600px] px-5 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">
          <AppHeader />
          {children}
        </div>
      </main>
    </div>
  );
}
