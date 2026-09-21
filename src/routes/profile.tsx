import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { useCurrentUser } from "@/hooks/use-auth";
import { useTeams } from "@/hooks/use-teams";
import { uploadMyAvatar, useUpdateMyProfile } from "@/hooks/use-profile";
import { fmtDate, fmtDateTime } from "@/lib/db";
import { normalizePhone, phoneError } from "@/lib/phone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "My Profile" }] }),
  component: ProfilePage,
});

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function ProfilePage() {
  const { teamMember, authUser, roleLabel, displayName } = useCurrentUser();
  const { data: teams = [] } = useTeams();
  const update = useUpdateMyProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");

  useEffect(() => {
    setFullName(teamMember?.full_name ?? "");
    setPhone(teamMember?.phone ?? "");
    setDob(teamMember?.date_of_birth ?? "");
  }, [teamMember?.id, teamMember?.full_name, teamMember?.phone, teamMember?.date_of_birth]);

  if (!teamMember) {
    return (
      <AppShell>
        <PageHeader eyebrow="Account" title="My Profile" description="No staff profile is linked to this login." />
      </AppShell>
    );
  }

  const teamName = teams.find((t) => t.id === teamMember.team_id)?.name ?? "No team";
  const initials =
    displayName
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "-";
  const dirty =
    fullName.trim() !== (teamMember.full_name ?? "") ||
    normalizePhone(phone) !== normalizePhone(teamMember.phone) ||
    (dob || "") !== (teamMember.date_of_birth ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return toast.error("Full name is required");
    if (normalizePhone(phone)) {
      const err = phoneError(phone);
      if (err) return toast.error(err);
    }
    try {
      await update.mutateAsync({
        fullName: fullName.trim(),
        phone: normalizePhone(phone),
        dateOfBirth: dob || null,
      });
      toast.success("Profile updated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onPickAvatar(file: File | undefined) {
    if (!file || !teamMember) return;
    setUploading(true);
    try {
      const url = await uploadMyAvatar(file, teamMember.id);
      await update.mutateAsync({
        fullName: teamMember.full_name,
        phone: teamMember.phone ?? "",
        dateOfBirth: teamMember.date_of_birth ?? null,
        avatarUrl: url,
      });
      toast.success("Profile picture updated");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAvatar() {
    if (!teamMember) return;
    try {
      await update.mutateAsync({
        fullName: teamMember.full_name,
        phone: teamMember.phone ?? "",
        dateOfBirth: teamMember.date_of_birth ?? null,
        removeAvatar: true,
      });
      toast.success("Profile picture removed");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Account"
        title="My Profile"
        description="Your details as your colleagues see them. Role and permissions are managed by an administrator."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex flex-col items-center text-center">
          <div className="relative">
            {teamMember.avatar_url ? (
              <img
                src={teamMember.avatar_url}
                alt={`${displayName} profile`}
                className="h-28 w-28 rounded-full object-cover ring-2 ring-qbay/30"
              />
            ) : (
              <span className="flex h-28 w-28 items-center justify-center rounded-full bg-qbay-soft text-3xl font-semibold text-qbay ring-2 ring-qbay/20">
                {initials}
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-canvas/70">
                <Loader2 className="h-5 w-5 animate-spin" />
              </span>
            )}
          </div>
          <p className="mt-3 text-base font-semibold">{displayName}</p>
          <p className="text-xs capitalize text-muted-foreground">{roleLabel.replace(/_/g, " ")}</p>
          <div className="mt-4 flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => onPickAvatar(e.target.files?.[0])}
            />
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Camera className="h-3.5 w-3.5" /> {teamMember.avatar_url ? "Change photo" : "Add photo"}
            </Button>
            {teamMember.avatar_url && (
              <Button variant="ghost" size="sm" disabled={uploading} onClick={removeAvatar} aria-label="Remove photo">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            JPG, PNG or WebP, up to 10 MB. Profile pictures are visible to your colleagues.
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full name *">
              <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </Field>
            <Field label="Email" hint="Your login email. Ask an administrator to change it.">
              <input className={inputCls} value={authUser?.email ?? teamMember.email ?? ""} disabled readOnly />
            </Field>
            <Field label="Phone">
              <input
                className={inputCls}
                type="tel"
                placeholder="+974..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field label="Date of birth">
              <input className={inputCls} type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </Field>
            <Field label="Role">
              <input className={cn(inputCls, "capitalize")} value={roleLabel.replace(/_/g, " ")} disabled readOnly />
            </Field>
            <Field label="Team">
              <input className={inputCls} value={teamName} disabled readOnly />
            </Field>
            <Field label="Joining date">
              <input
                className={inputCls}
                value={teamMember.joining_date ? fmtDate(teamMember.joining_date) : "Not recorded"}
                disabled
                readOnly
              />
            </Field>
            <Field label="Account status">
              <input
                className={inputCls}
                value={teamMember.is_active === false ? "Inactive" : "Active"}
                disabled
                readOnly
              />
            </Field>
            <Field label="Last sign in">
              <input
                className={inputCls}
                value={authUser?.last_sign_in_at ? fmtDateTime(authUser.last_sign_in_at) : "-"}
                disabled
                readOnly
              />
            </Field>
            <Field label="Staff code">
              <input className={inputCls} value={teamMember.code ?? "-"} disabled readOnly />
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!dirty || update.isPending}
                onClick={() => {
                  setFullName(teamMember.full_name ?? "");
                  setPhone(teamMember.phone ?? "");
                  setDob(teamMember.date_of_birth ?? "");
                }}
              >
                Reset
              </Button>
              <Button type="submit" size="sm" disabled={!dirty || update.isPending}>
                {update.isPending ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
