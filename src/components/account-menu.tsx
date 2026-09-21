import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { signOut, useCurrentUser, usePermissions } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

/** Header account control: opens a menu with profile, account details, settings and sign out. */
export function AccountMenu() {
  const navigate = useNavigate();
  const { displayName, roleLabel, teamMember, authUser } = useCurrentUser();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initials =
    displayName
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "-";
  const email = authUser?.email ?? teamMember?.email ?? "";
  const role = roleLabel.replace(/_/g, " ");
  const canSettings = can("settings", "view") || can("settings", "manage");

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const avatar = teamMember?.avatar_url ? (
    <img
      src={teamMember.avatar_url}
      alt=""
      className="h-7 w-7 rounded-full object-cover ring-1 ring-white/60"
    />
  ) : (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-qbay-soft text-[11px] font-semibold text-qbay ring-1 ring-white/60">
      {initials}
    </span>
  );

  const itemCls =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus:bg-muted focus:outline-none";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="glass flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium text-foreground transition hover:bg-white/80"
      >
        {avatar}
        <span className="hidden sm:inline">{displayName}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-[min(92vw,280px)] overflow-hidden rounded-2xl border border-border bg-canvas p-1.5 shadow-2xl"
        >
          <div className="flex items-center gap-3 px-3 py-3">
            <span className="flex-shrink-0 [&>*]:h-10 [&>*]:w-10">{avatar}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
              <p className="mt-0.5 text-[11px] capitalize text-qbay">{role}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-border" />
          <Link to="/profile" role="menuitem" className={itemCls} onClick={() => setOpen(false)}>
            <UserRound className="h-4 w-4 text-muted-foreground" /> My profile
          </Link>
          {canSettings && (
            <Link to="/settings" role="menuitem" className={itemCls} onClick={() => setOpen(false)}>
              <Settings className="h-4 w-4 text-muted-foreground" /> Settings
            </Link>
          )}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            className={cn(itemCls, "text-destructive")}
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
