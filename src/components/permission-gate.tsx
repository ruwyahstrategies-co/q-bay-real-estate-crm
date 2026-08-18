import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { usePermissions } from "@/hooks/use-auth";
import type { ActionKey, ModuleKey } from "@/lib/permissions";
import { EmptyState } from "./empty-state";

/**
 * Gates rendering on a permission check. With no `fallback`, renders nothing
 * when denied - use this to hide buttons/actions. Pass `page` for full-page
 * gating with a proper "Access Denied" state instead of a blank screen.
 */
export function PermissionGate({
  module,
  action = "view",
  children,
  fallback,
  page,
}: {
  module: ModuleKey;
  action?: ActionKey | string;
  children: ReactNode;
  fallback?: ReactNode;
  page?: boolean;
}) {
  const { can } = usePermissions();
  if (can(module, action)) return <>{children}</>;
  if (page) return fallback ?? <AccessDenied />;
  return <>{fallback ?? null}</>;
}

export function AccessDenied() {
  return (
    <EmptyState
      icon={<ShieldAlert className="h-4 w-4" />}
      title="Access denied"
      description="You don't have permission to view this page. Ask an administrator to grant access."
    />
  );
}
