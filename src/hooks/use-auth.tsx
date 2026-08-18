import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { StaffTeamMember } from "@/lib/db-extensions";
import { can as canCheck, type ActionKey, type ModuleKey, type PermissionSet } from "@/lib/permissions";

/**
 * - "loading": initial Supabase session lookup in flight.
 * - "unauthenticated": no session - render <Navigate to="/login" />.
 * - "resolving": session present, staff row lookup in flight. Permissions
 *   must be treated as NONE during this state - never briefly show admin
 *   nav/actions while we don't yet know who this is.
 * - "unprovisioned": authenticated, but no team_members row is linked to
 *   this login. This is a real state a real user can land in (e.g. their
 *   Supabase Auth account exists but an admin hasn't created their staff
 *   record yet, or it was unlinked) - show a clear message, not a crash.
 * - "inactive": linked staff row exists but is_active = false.
 * - "authorized": linked, active staff row resolved - `permissions` reflects
 *   exactly what's stored in team_members.permissions (the same value RLS
 *   reads via current_team_permissions()), no client-side role fallback.
 */
export type AuthStatus = "loading" | "unauthenticated" | "resolving" | "unprovisioned" | "inactive" | "authorized";

type AuthState = {
  status: AuthStatus;
  /** True while status is "loading" or "resolving" - session/profile not yet settled. */
  loading: boolean;
  session: Session | null;
  authUser: User | null;
  /** The linked team_members row for this login, once resolved. */
  teamMember: StaffTeamMember | null;
  permissions: PermissionSet;
  displayName: string;
  roleLabel: string;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Strictly resolves the caller's staff row by team_members.user_id = auth.uid().
 * No email-based fallback - an Auth email happening to match a CRM row is not
 * sufficient to authorize someone. If a controlled recovery/migration path is
 * ever needed, it should be an explicit, separately-audited mechanism, not
 * part of normal runtime authorization.
 */
async function resolveTeamMember(user: User): Promise<StaffTeamMember | null> {
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as StaffTeamMember) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [teamMember, setTeamMember] = useState<StaffTeamMember | null>(null);
  const [profileState, setProfileState] = useState<"idle" | "resolving" | "resolved" | "error">("idle");
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionLoading(false);
      if (!next) {
        setTeamMember(null);
        setResolvedFor(null);
        setProfileState("idle");
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const user = session?.user;
    if (!user) return;
    if (resolvedFor === user.id) return;
    let active = true;
    setProfileState("resolving");
    resolveTeamMember(user)
      .then((member) => {
        if (!active) return;
        setTeamMember(member);
        setResolvedFor(user.id);
        setProfileState("resolved");
      })
      .catch(() => {
        if (!active) return;
        setProfileState("error");
        setResolvedFor(user.id);
      });
    return () => {
      active = false;
    };
    // Only re-resolve when the user id actually changes, not on every new
    // `session` object reference (e.g. token refreshes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, resolvedFor]);

  const authUser = session?.user ?? null;

  let status: AuthStatus;
  if (sessionLoading) status = "loading";
  else if (!authUser) status = "unauthenticated";
  else if (profileState === "idle" || profileState === "resolving") status = "resolving";
  else if (profileState === "error" || !teamMember) status = "unprovisioned";
  else if (teamMember.is_active === false) status = "inactive";
  else status = "authorized";

  // Stored permissions are authoritative - this must match exactly what
  // public.current_team_permissions() returns in the database, since that's
  // what RLS actually enforces. No role-preset fallback merge here: role
  // presets are a UI convenience for populating permissions when a staff
  // member is created/edited, never a runtime authorization source.
  const permissions: PermissionSet = status === "authorized" ? (teamMember!.permissions ?? {}) : {};

  const displayName = teamMember?.full_name ?? authUser?.email ?? "Guest";
  const roleLabel = teamMember?.role ?? "-";

  const value: AuthState = {
    status,
    loading: status === "loading" || status === "resolving",
    session,
    authUser,
    teamMember,
    permissions,
    displayName,
    roleLabel,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useCurrentUser(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useCurrentUser must be used within AuthProvider");
  return ctx;
}

export function usePermissions() {
  const { permissions } = useCurrentUser();
  return {
    permissions,
    can: (module: ModuleKey, action: ActionKey | string) => canCheck(permissions, module, action),
  };
}

export async function signOut() {
  await supabase.auth.signOut();
}
