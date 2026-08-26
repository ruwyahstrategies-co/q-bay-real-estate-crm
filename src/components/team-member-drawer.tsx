import { useEffect, useState } from "react";
import { X, Dices, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { cn } from "@/lib/utils";
import {
  useCreateTeamMember,
  useUpdateTeamMember,
  useCreateStaffUser,
  useResetStaffPassword,
  useSetStaffActive,
} from "@/hooks/use-team";
import { useTeams } from "@/hooks/use-teams";
import type { StaffTeamMember } from "@/lib/db-extensions";
import {
  MODULES,
  MODULE_LABELS,
  ACTION_LABELS,
  ROLE_PRESETS,
  type ModuleKey,
  type PermissionSet,
  type RolePresetKey,
  defaultPermissionsForRole,
  isRolePresetKey,
} from "@/lib/permissions";

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function roleFor(member?: StaffTeamMember | null): RolePresetKey {
  return isRolePresetKey(member?.role) ? (member!.role as RolePresetKey) : "sales_agent";
}

export function TeamMemberDrawer({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member?: StaffTeamMember | null;
}) {
  const create = useCreateTeamMember();
  const update = useUpdateTeamMember();
  const createStaffUser = useCreateStaffUser();
  const resetPassword = useResetStaffPassword();
  const setActive = useSetStaffActive();
  const isEdit = !!member?.id;
  const hasLogin = !!member?.user_id;

  const [full_name, setFullName] = useState(member?.full_name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [rolePreset, setRolePreset] = useState<RolePresetKey>(() => roleFor(member));
  const [permissions, setPermissions] = useState<PermissionSet>(
    () => member?.permissions ?? defaultPermissionsForRole(member?.role ?? roleFor(member)),
  );
  const [isActive, setIsActive] = useState(member?.is_active ?? true);
  const [notes, setNotes] = useState(member?.notes ?? "");
  const [teamId, setTeamId] = useState<string>((member as any)?.team_id ?? "");
  const { data: teams = [] } = useTeams();

  const [createLogin, setCreateLogin] = useState(!isEdit);
  const [tempPassword, setTempPassword] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetValue, setResetValue] = useState("");

  // The drawer shell stays mounted through its close animation, so reset
  // every field explicitly whenever a different record (or a fresh "add")
  // opens, instead of relying on unmount-on-close to do it implicitly.
  useEffect(() => {
    if (!open) return;
    const role = roleFor(member);
    setFullName(member?.full_name ?? "");
    setEmail(member?.email ?? "");
    setPhone(member?.phone ?? "");
    setRolePreset(role);
    setPermissions(member?.permissions ?? defaultPermissionsForRole(member?.role ?? role));
    setIsActive(member?.is_active ?? true);
    setNotes(member?.notes ?? "");
    setTeamId((member as any)?.team_id ?? "");
    setCreateLogin(!member?.id);
    setTempPassword("");
    setResetOpen(false);
    setResetValue("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member?.id]);

  function applyRolePreset(key: RolePresetKey) {
    setRolePreset(key);
    setPermissions(ROLE_PRESETS[key].permissions());
  }

  function toggleAction(module: ModuleKey, action: string) {
    setPermissions((prev) => {
      const current = new Set(prev[module] ?? []);
      if (current.has(action)) current.delete(action);
      else current.add(action);
      return { ...prev, [module]: Array.from(current) };
    });
  }

  const pending = create.isPending || update.isPending || createStaffUser.isPending || setActive.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const name = full_name.trim();
    if (!name) return toast.error("Full name is required");
    if ((createLogin || (isEdit && !hasLogin && createLogin)) && !email.trim()) {
      return toast.error("Email is required to create a login");
    }

    try {
      if (!isEdit && createLogin) {
        if (!tempPassword || tempPassword.length < 8) {
          toast.error("Temporary password must be at least 8 characters");
          return;
        }
        const res = await createStaffUser.mutateAsync({
          full_name: name,
          email: email.trim(),
          phone: phone || null,
          role: rolePreset,
          team_id: teamId || null,
          permissions,
          temporary_password: tempPassword,
          is_active: isActive,
        });
        if (res.warning) toast.warning(res.warning);
        toast.success("Staff member created with login access");
        onOpenChange(false);
        return;
      }

      const payload = {
        full_name: name,
        email: email || null,
        phone: phone || null,
        role: rolePreset,
        team_id: teamId || null,
        permissions,
        is_active: isActive,
        notes: notes || null,
      };

      if (isEdit && member) {
        await update.mutateAsync({ id: member.id, patch: payload });
        if (hasLogin && isActive !== member.is_active) {
          await setActive.mutateAsync({ team_member_id: member.id, is_active: isActive });
        }
        if (!hasLogin && createLogin) {
          if (!tempPassword || tempPassword.length < 8) {
            toast.error("Set a temporary password to create this member's login");
            return;
          }
          const res = await createStaffUser.mutateAsync({
            full_name: name,
            email: email.trim(),
            phone: phone || null,
            role: rolePreset,
            permissions,
            temporary_password: tempPassword,
            is_active: isActive,
          });
          if (res.warning) toast.warning(res.warning);
        }
        toast.success("Team member updated");
      } else {
        await create.mutateAsync(payload as never);
        toast.success("Team member added");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleResetPassword() {
    if (!member) return;
    if (!resetValue || resetValue.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    try {
      await resetPassword.mutateAsync({ team_member_id: member.id, new_password: resetValue });
      toast.success("Password reset");
      setResetOpen(false);
      setResetValue("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} widthClassName="max-w-lg" ariaLabel={isEdit ? "Edit team member" : "Add team member"}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{isEdit ? "Edit Team Member" : "Add Team Member"}</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <form className="flex-1 overflow-y-auto p-5" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Full name *" full>
            <input className={inputCls} value={full_name} onChange={(e) => setFullName(e.target.value)} required />
          </Field>
          <Field label="Login email">
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@qbayrealestate.com" />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Job title / role preset">
            <select className={inputCls} value={rolePreset} onChange={(e) => applyRolePreset(e.target.value as RolePresetKey)}>
              {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>{preset.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={isActive ? "yes" : "no"} onChange={(e) => setIsActive(e.target.value === "yes")}>
              <option value="yes">Active</option>
              <option value="no">Inactive</option>
            </select>
          </Field>
          <Field label="Team">
            <select className={inputCls} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">No team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">{ROLE_PRESETS[rolePreset].description}</p>

        {/* Permissions grid */}
        <div className="mt-5">
          <h4 className="text-sm font-semibold">Permissions</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            The role preset sets sensible defaults - enable or disable individual modules and actions below.
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <tbody>
                {(Object.keys(MODULES) as ModuleKey[]).map((module) => (
                  <tr key={module} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{MODULE_LABELS[module]}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-3">
                        {MODULES[module].map((action) => (
                          <label key={action} className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={(permissions[module] ?? []).includes(action)}
                              onChange={() => toggleAction(module, action)}
                            />
                            <span>{ACTION_LABELS[action] ?? action}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Login credentials */}
        <div className="mt-5 rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            <h4 className="text-sm font-semibold">Login access</h4>
          </div>

          {isEdit && hasLogin && (
            <div className="mt-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-foreground" /> This member has an active login.
              </p>
              {!resetOpen ? (
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => { setResetOpen(true); setResetValue(generatePassword()); }}>
                  Reset password
                </Button>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <input className={inputCls} value={resetValue} onChange={(e) => setResetValue(e.target.value)} placeholder="New temporary password" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setResetValue(generatePassword())} aria-label="Generate password">
                    <Dices className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="sm" disabled={resetPassword.isPending} onClick={handleResetPassword}>
                    {resetPassword.isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setResetOpen(false)}>Cancel</Button>
                </div>
              )}
            </div>
          )}

          {(!isEdit || !hasLogin) && (
            <div className="mt-3">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} />
                {isEdit ? "Create a login for this member now" : "Create login now (recommended)"}
              </label>
              {createLogin && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className={inputCls}
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    placeholder="Temporary password (min 8 chars)"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setTempPassword(generatePassword())} aria-label="Generate password">
                    <Dices className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              {!createLogin && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A contact-only record will be saved. You can create login access later from this drawer.
                </p>
              )}
            </div>
          )}
        </div>

        <Field label="Notes" full>
          <textarea className={cn(inputCls, "mt-4 h-20 py-2")} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </DrawerShell>
  );
}
