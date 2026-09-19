import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";
import { useCurrentUser } from "@/hooks/use-auth";

export type StaffNotification = {
  id: string;
  user_id: string;
  team_member_id: string | null;
  title: string;
  body: string | null;
  href: string | null;
  kind: string;
  read_at: string | null;
  created_at: string;
};

const keys = {
  all: ["staff-notifications"] as const,
};

const db = sb as any;

export function useStaffNotifications() {
  const { authUser } = useCurrentUser();
  return useQuery({
    queryKey: keys.all,
    enabled: !!authUser?.id,
    queryFn: async (): Promise<StaffNotification[]> => {
      const { data, error } = await db
        .from("staff_notifications")
        .select("*")
        .eq("user_id", authUser!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as StaffNotification[];
    },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("staff_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const { authUser } = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!authUser?.id) return;
      const { error } = await db
        .from("staff_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", authUser.id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

async function ensureNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/notification-sw.js");
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  await ensureNotificationServiceWorker();
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

export async function showBrowserNotification(notification: Pick<StaffNotification, "title" | "body" | "href" | "id">) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const registration = await ensureNotificationServiceWorker();
  if (registration) {
    await registration.showNotification(notification.title, {
      body: notification.body ?? undefined,
      icon: "/favicon.png",
      badge: "/favicon.png",
      tag: `qbay-${notification.id}`,
      data: { url: notification.href ?? "/overview" },
    });
    return;
  }

  const n = new Notification(notification.title, {
    body: notification.body ?? undefined,
    icon: "/favicon.png",
    tag: `qbay-${notification.id}`,
  });
  n.onclick = () => {
    window.focus();
    if (notification.href) window.location.assign(notification.href);
  };
}

export function useStaffNotificationRealtime() {
  const { authUser } = useCurrentUser();
  const qc = useQueryClient();

  useEffect(() => {
    if (!authUser?.id) return;

    const channel = sb
      .channel(`staff-notifications:${authUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "staff_notifications",
          filter: `user_id=eq.${authUser.id}`,
        },
        (payload) => {
          const notification = payload.new as StaffNotification;
          qc.invalidateQueries({ queryKey: keys.all });
          void showBrowserNotification(notification);
        },
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [authUser?.id, qc]);
}
