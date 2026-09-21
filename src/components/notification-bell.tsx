import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import {
  requestBrowserNotificationPermission,
  showBrowserNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useStaffNotificationRealtime,
  useStaffNotifications,
} from "@/hooks/use-staff-notifications";
import { fmtDateTime } from "@/lib/db";

function permissionLabel(permission: NotificationPermission | "unsupported") {
  if (permission === "granted") return "Browser notifications enabled";
  if (permission === "denied") return "Browser notifications blocked";
  if (permission === "unsupported") return "Browser notifications unsupported";
  return "Enable browser notifications";
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: notifications = [], isLoading } = useStaffNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  useStaffNotificationRealtime();

  const unread = notifications.filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  async function enableBrowserNotifications() {
    try {
      const next = await requestBrowserNotificationPermission();
      setPermission(next);
      if (next === "granted") {
        toast.success("Browser notifications enabled");
        await showBrowserNotification({
          id: "browser-notifications-enabled",
          title: "Q-Bay notifications enabled",
          body: "New CRM assignments and alerts can now appear as browser notifications.",
          href: "/overview",
        });
      } else if (next === "denied") {
        toast.error("Notifications are blocked in this browser. Allow them from the site permissions.");
      } else if (next === "unsupported") {
        toast.error("This browser does not support notifications.");
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function openNotification(id: string, href: string | null) {
    try {
      await markRead.mutateAsync(id);
    } catch {
      // Navigation is still useful even if marking read fails.
    }
    setOpen(false);
    if (href) navigate({ to: href as never });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="glass relative flex h-9 w-9 items-center justify-center rounded-full text-foreground transition hover:bg-white/80"
      >
        {unread > 0 ? (
          <BellRing className="h-[16px] w-[16px]" strokeWidth={2} />
        ) : (
          <Bell className="h-[16px] w-[16px]" strokeWidth={2} />
        )}
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[9px] font-semibold leading-4 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-border bg-canvas shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-[11px] text-muted-foreground">
                {unread ? `${unread} unread` : "You're all caught up"}
              </p>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="border-b border-border p-3">
            <button
              type="button"
              disabled={permission === "denied" || permission === "unsupported"}
              onClick={enableBrowserNotifications}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{permissionLabel(permission)}</span>
              <span
                className={
                  permission === "granted"
                    ? "rounded-full bg-pastel-green px-2 py-0.5 text-[10px]"
                    : "rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                }
              >
                {permission === "granted" ? "On" : "Off"}
              </span>
            </button>
            {permission === "denied" && (
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Browser permission is blocked. Use the lock/site-settings icon beside the address bar to allow notifications.
              </p>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-xs text-muted-foreground">Loading notifications...</p>
            ) : notifications.length === 0 ? (
              <p className="p-5 text-center text-xs text-muted-foreground">No notifications yet.</p>
            ) : (
              notifications.slice(0, 30).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openNotification(n.id, n.href)}
                  className="block w-full border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/60"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-border" : "bg-qbay"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-foreground">{n.title}</span>
                      {n.body && (
                        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {fmtDateTime(n.created_at)}
                      </span>
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
