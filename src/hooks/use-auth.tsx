import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isMissingSchemaError, type StaffTeamMember } from "@/lib/db-extensions";
import {
  can as canCheck,
  defaultPermissionsForRole,
  fullAccessPermissions,
  mergePermissions,
  type ActionKey,
  type ModuleKey,
  type PermissionSet,
} from "@/lib/permissions";

type AuthState = {
  loading: boolean;
  session: Session | null;
  authUser: User | null;
  /** The linked team_members row for this login, if one could be resolved. */
  teamMember: StaffTeamMember | null;
  /** True if we couldn't find a team_members row and are treating this login as a bootstrap admin. */
  isBootstrapAdmin: boolean;
  permissions: PermissionSet;
  displayName: string;
  roleLabel: string;
};

const AuthContext = createContext<AuthState | null>(null);

async function resolveTeamMember(user: User): Promise<StaffTeamMember | null> {
  // Preferred: a real backend link (team_members.user_id -> auth.users.id).
  // Falls back to matching by email so staff login works today, before that
  // column exists. See BACKEND_REQUIREMENTS.md.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- team_members.user_id is transitional, see db-extensions.ts
    const { data, error } = await (supabase as any)
      .from("team_members")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!error && data) return data as StaffTeamMember;
    if (error && !isMissingSchemaError(error)) throw error;
  } catch {
    /* fall through to email match */
  }

  if (!user.email) return null;
  try {
    const { data, error } = await supabase
      .from("team_members")
      .select("*")
      .ilike("email", user.email)
      .maybeSingle();
    if (error) return null;
    return (data as StaffTeamMember) ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [teamMember, setTeamMember] = useState<StaffTeamMember | null>(null);
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setTeamMember(null);
        setResolvedFor(null);
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
    resolveTeamMember(user).then((member) => {
      if (!active) return;
      setTeamMember(member);
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
  const isBootstrapAdmin = !!authUser && !teamMember;

  let permissions: PermissionSet;
  if (!authUser || !teamMember) {
    // No team_members row is linked to this login yet. Rather than locking
    // the account out (only an admin can create Supabase Auth logins in the
    // first place), treat it as a full-access bootstrap administrator.
    permissions = authUser ? fullAccessPermissions() : {};
  } else if (teamMember.is_active === false) {
    permissions = {};
  } else {
    const base = defaultPermissionsForRole(teamMember.role);
    permissions = teamMember.permissions ? mergePermissions(base, teamMember.permissions) : base;
  }

  const displayName = teamMember?.full_name ?? authUser?.email ?? "Guest";
  const roleLabel = isBootstrapAdmin ? "Administrator" : (teamMember?.role ?? "—");

  const value: AuthState = {
    loading,
    session,
    authUser,
    teamMember,
    isBootstrapAdmin,
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
