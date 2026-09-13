import { useEffect, useRef, useState } from "react";
import { X, FileText, Image as ImageIcon, ExternalLink, Play, Pause, Mic } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { SelectField, SearchableSelectField } from "./select-field";
import {
  sb,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtSize,
  SUBMISSION_PURPOSES,
  SUBMISSION_PURPOSE_LABELS,
  type PropertySubmission,
  type Upload,
} from "@/lib/db";
import {
  useUpdateSubmission,
  useReviewSubmission,
  useConvertSubmission,
  useSubmissionUploads,
} from "@/hooks/use-submissions";
import { getR2SignedReadUrl } from "@/lib/r2";
import { useDevelopments } from "@/hooks/use-developments";
import { useAreas } from "@/hooks/use-locations";
import { useCurrentUser } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

const FURNISHING_OPTIONS = [
  { value: "FF", label: "Fully furnished" },
  { value: "SF", label: "Semi furnished" },
  { value: "UF", label: "Unfurnished" },
];

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const STATUS_TONE: Record<string, string> = {
  new: "bg-pastel-blue",
  approved: "bg-pastel-green",
  rejected: "bg-destructive/15 text-destructive",
  converted: "bg-muted",
};

type FileRef = { path: string; filename: string; mime_type?: string; size?: number };

function isImage(f: FileRef) {
  return (f.mime_type ?? "").startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(f.filename);
}

function FileList({ files }: { files: FileRef[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        files.map(async (f) => {
          const { data } = await sb.storage.from("submission-media").createSignedUrl(f.path, 3600);
          return [f.path, data?.signedUrl ?? ""] as const;
        }),
      );
      if (!cancelled) setUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [files]);

  if (files.length === 0) return <p className="text-xs text-muted-foreground">None uploaded.</p>;

  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <a
          key={f.path}
          href={urls[f.path] || undefined}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-muted"
        >
          {isImage(f) ? (
            <ImageIcon className="h-3.5 w-3.5" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
          <span className="max-w-[160px] truncate">{f.filename}</span>
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </a>
      ))}
    </div>
  );
}

function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Secure, staff-only voice note playback - the signed URL is fetched from r2-signed-read on demand, never a permanent public URL. */
function VoiceNotePlayer({ upload }: { upload: Upload }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  async function ensureUrl(): Promise<string | null> {
    if (url) return url;
    setLoading(true);
    setError(null);
    try {
      const signedUrl = await getR2SignedReadUrl(upload.id);
      setUrl(signedUrl);
      return signedUrl;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function togglePlay() {
    const signedUrl = await ensureUrl();
    if (!signedUrl || !audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      await audioRef.current.play();
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-canvas px-3 py-2.5">
      <button
        type="button"
        onClick={togglePlay}
        disabled={loading}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background hover:opacity-90 disabled:opacity-50"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full bg-foreground transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Mic className="h-3 w-3" />
          <span>Voice note</span>
          {upload.duration_seconds ? <span>- {fmtDuration(upload.duration_seconds)}</span> : null}
          {upload.file_size ? <span>- {fmtSize(upload.file_size)}</span> : null}
          {error && <span className="text-destructive">- {error}</span>}
          {loading && <span>- loading...</span>}
        </div>
      </div>
      {url && (
        <audio
          ref={audioRef}
          src={url}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.duration > 0) setProgress(el.currentTime / el.duration);
          }}
          className="hidden"
        />
      )}
    </div>
  );
}

/** Owner-submitted photos stored in R2 (private until a staff member promotes them on conversion). */
function R2PhotoList({ uploads }: { uploads: Upload[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        uploads.map(async (u) => {
          try {
            const signedUrl = await getR2SignedReadUrl(u.id);
            return [u.id, signedUrl] as const;
          } catch {
            return [u.id, ""] as const;
          }
        }),
      );
      if (!cancelled) setUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [uploads]);

  if (uploads.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {uploads.map((u) => (
        <a
          key={u.id}
          href={urls[u.id] || undefined}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-muted"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          <span className="max-w-[160px] truncate">{u.filename}</span>
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </a>
      ))}
    </div>
  );
}

/**
 * Full Sale Listing Form detail for one submission, wherever it's opened from
 * (the Listing Submissions tab, or an Owner's profile). Staff can see every
 * field the owner submitted, review it, edit it before converting, and turn
 * it into a real Property without leaving this panel.
 */
export function SubmissionDetailDrawer({
  submission,
  open,
  onOpenChange,
  canReview,
}: {
  submission: PropertySubmission | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canReview: boolean;
}) {
  const { teamMember } = useCurrentUser();
  const update = useUpdateSubmission();
  const review = useReviewSubmission();
  const convert = useConvertSubmission();
  const { data: developments = [] } = useDevelopments({ publishedOnly: false });
  const { data: areas = [] } = useAreas();
  const { data: r2Uploads = [] } = useSubmissionUploads(submission?.id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<PropertySubmission>>({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (submission) {
      setForm(submission);
      setNotes(submission.review_notes ?? "");
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset the form only when the open submission changes, not on every field edit
  }, [submission?.id]);

  if (!submission) return null;
  const media = (submission.media as unknown as FileRef[] | null) ?? [];
  const documents = (submission.documents as unknown as FileRef[] | null) ?? [];
  const voiceNote = r2Uploads.find((u) => u.category === "voice_note");
  const r2Photos = r2Uploads.filter((u) => u.category === "submission_photo");

  async function saveEdits() {
    try {
      await update.mutateAsync({
        id: submission!.id,
        patch: {
          full_name: form.full_name,
          phone: form.phone,
          email: form.email,
          owner_id_number: form.owner_id_number,
          property_type: form.property_type,
          purpose: form.purpose,
          area_id: form.area_id,
          custom_area: form.custom_area,
          location: form.location,
          available_from: form.available_from,
          tower_name: form.tower_name,
          floor_number: form.floor_number,
          unit_number: form.unit_number,
          bedrooms: form.bedrooms,
          bathrooms: form.bathrooms,
          size: form.size,
          parking_spaces: form.parking_spaces,
          furnishing_status: form.furnishing_status,
          price: form.price,
          description: form.description,
          development_id: form.development_id,
        },
      });
      toast.success("Submission updated");
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel="Submission detail">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h3 className="text-base font-semibold">Listing submission</h3>
          <p className="text-xs text-muted-foreground">
            Submitted {fmtDateTime(submission.created_at)} - source:{" "}
            {submission.source ?? "website"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide",
              STATUS_TONE[submission.status] ?? "bg-muted",
            )}
          >
            {submission.status.replace(/_/g, " ")}
          </span>
          <button
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {submission.owner_id && (
          <Link
            to="/owners/$ownerId"
            params={{ ownerId: submission.owner_id }}
            className="text-xs font-medium text-foreground underline underline-offset-2"
          >
            View owner profile
          </Link>
        )}

        {editing ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Owner name">
              <input
                className={inputCls}
                value={form.full_name ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
              />
            </Field>
            <Field label="Mobile">
              <input
                className={inputCls}
                value={form.phone ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </Field>
            <Field label="Email">
              <input
                className={inputCls}
                value={form.email ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </Field>
            <Field label="ID number">
              <input
                className={inputCls}
                value={form.owner_id_number ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, owner_id_number: e.target.value }))}
              />
            </Field>
            <Field label="Property type">
              <input
                className={inputCls}
                value={form.property_type ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, property_type: e.target.value }))}
              />
            </Field>
            <Field label="Purpose">
              <SelectField
                value={form.purpose ?? null}
                onChange={(v) => setForm((p) => ({ ...p, purpose: v }))}
                options={SUBMISSION_PURPOSES.map((s) => ({
                  value: s,
                  label: SUBMISSION_PURPOSE_LABELS[s],
                }))}
                placeholder="Not specified"
              />
            </Field>
            <Field label="Area">
              <SearchableSelectField
                value={form.area_id ?? null}
                onChange={(v) =>
                  setForm((p) => ({ ...p, area_id: v, custom_area: v ? null : p.custom_area }))
                }
                options={areas
                  .filter((a) => a.is_active)
                  .map((a) => ({ value: a.id, label: a.name }))}
                placeholder="Select a canonical area"
                emptyLabel="No canonical area"
                searchPlaceholder="Search areas..."
              />
            </Field>
            <Field label="Custom area (if not in the list above)">
              <input
                className={inputCls}
                value={form.custom_area ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    custom_area: e.target.value || null,
                    area_id: e.target.value ? null : p.area_id,
                  }))
                }
                placeholder="e.g. a neighbourhood not yet in Areas"
              />
            </Field>
            <Field label="Location">
              <input
                className={inputCls}
                value={form.location ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
              />
            </Field>
            <Field label="Available from">
              <input
                type="date"
                className={inputCls}
                value={form.available_from ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, available_from: e.target.value || null }))}
              />
            </Field>
            <Field label="Development">
              <SearchableSelectField
                value={form.development_id ?? null}
                onChange={(v) => setForm((p) => ({ ...p, development_id: v }))}
                options={developments.map((d) => ({ value: d.id, label: d.name }))}
                placeholder="None"
                emptyLabel="None"
                searchPlaceholder="Search developments..."
              />
            </Field>
            <Field label="Tower">
              <input
                className={inputCls}
                value={form.tower_name ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, tower_name: e.target.value }))}
              />
            </Field>
            <Field label="Floor">
              <input
                className={inputCls}
                value={form.floor_number ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, floor_number: e.target.value }))}
              />
            </Field>
            <Field label="Unit number">
              <input
                className={inputCls}
                value={form.unit_number ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, unit_number: e.target.value }))}
              />
            </Field>
            <Field label="Bedrooms">
              <input
                type="number"
                className={inputCls}
                value={form.bedrooms ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    bedrooms: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </Field>
            <Field label="Bathrooms">
              <input
                type="number"
                className={inputCls}
                value={form.bathrooms ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    bathrooms: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </Field>
            <Field label="Size (m²)">
              <input
                type="number"
                className={inputCls}
                value={form.size ?? ""}
                onChange={(e) =>
                  setForm((p) => ({ ...p, size: e.target.value ? Number(e.target.value) : null }))
                }
              />
            </Field>
            <Field label="Parking spaces">
              <input
                type="number"
                className={inputCls}
                value={form.parking_spaces ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    parking_spaces: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </Field>
            <Field label="Furnishing">
              <SelectField
                value={form.furnishing_status ?? null}
                onChange={(v) => setForm((p) => ({ ...p, furnishing_status: v }))}
                options={FURNISHING_OPTIONS}
                emptyLabel="Not specified"
              />
            </Field>
            <Field label="Price">
              <input
                type="number"
                className={inputCls}
                value={form.price ?? ""}
                onChange={(e) =>
                  setForm((p) => ({ ...p, price: e.target.value ? Number(e.target.value) : null }))
                }
              />
            </Field>
            <Field label="Notes" full>
              <textarea
                className={cn(inputCls, "h-24 py-2")}
                value={form.description ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </Field>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setForm(submission);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={saveEdits} disabled={update.isPending}>
                {update.isPending ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              <Info label="Owner" value={submission.full_name} />
              <Info label="Mobile" value={submission.phone} />
              <Info label="Email" value={submission.email} />
              <Info label="ID number" value={submission.owner_id_number} />
              <Info
                label="Purpose"
                value={
                  submission.purpose
                    ? (SUBMISSION_PURPOSE_LABELS[submission.purpose] ?? submission.purpose)
                    : null
                }
              />
              <Info label="Property type" value={submission.property_type} />
              <Info
                label="Area"
                value={
                  submission.area_id
                    ? (areas.find((a) => a.id === submission.area_id)?.name ?? "Canonical area")
                    : submission.custom_area
                      ? `${submission.custom_area} (custom)`
                      : null
                }
              />
              <Info label="Location" value={submission.location} />
              <Info
                label="Available from"
                value={submission.available_from ? fmtDate(submission.available_from) : null}
              />
              <Info label="Tower" value={submission.tower_name} />
              <Info label="Floor" value={submission.floor_number} />
              <Info label="Unit" value={submission.unit_number} />
              <Info label="Bedrooms" value={submission.bedrooms} />
              <Info label="Bathrooms" value={submission.bathrooms} />
              <Info label="Size" value={submission.size ? `${submission.size} m²` : null} />
              <Info label="Parking" value={submission.parking_spaces} />
              <Info label="Furnishing" value={submission.furnishing_status} />
              <Info label="Price" value={fmtMoney(submission.price, submission.currency)} />
            </section>

            {submission.description && (
              <section>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Description
                </h4>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {submission.description}
                </p>
              </section>
            )}

            {voiceNote && (
              <section>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Voice note
                </h4>
                <VoiceNotePlayer upload={voiceNote} />
              </section>
            )}

            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Photos
              </h4>
              {media.filter(isImage).length === 0 && r2Photos.length === 0 ? (
                <p className="text-xs text-muted-foreground">None uploaded.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {media.filter(isImage).length > 0 && <FileList files={media.filter(isImage)} />}
                  {r2Photos.length > 0 && <R2PhotoList uploads={r2Photos} />}
                </div>
              )}
            </section>
            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Documents
              </h4>
              <FileList files={[...media.filter((f) => !isImage(f)), ...documents]} />
            </section>

            {submission.review_notes && (
              <section>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Review notes
                </h4>
                <p className="text-sm text-muted-foreground">{submission.review_notes}</p>
              </section>
            )}

            {canReview && (
              <div className="border-t border-border pt-4">
                <textarea
                  className={cn(inputCls, "mb-2 h-16 w-full py-2")}
                  placeholder="Review notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    Edit fields
                  </Button>
                  {submission.status !== "rejected" && submission.status !== "converted" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await review.mutateAsync({
                            id: submission.id,
                            status: "rejected",
                            review_notes: notes || undefined,
                            reviewed_by: teamMember?.id ?? "",
                          });
                          toast.success("Submission rejected");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      Reject
                    </Button>
                  )}
                  {submission.status !== "approved" && submission.status !== "converted" && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await review.mutateAsync({
                            id: submission.id,
                            status: "approved",
                            review_notes: notes || undefined,
                            reviewed_by: teamMember?.id ?? "",
                          });
                          toast.success("Submission approved");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      Approve
                    </Button>
                  )}
                  {submission.status === "approved" && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await convert.mutateAsync(submission);
                          toast.success("Converted to a property");
                          onOpenChange(false);
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      Convert to Property
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DrawerShell>
  );
}

function Info({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string | number | null | undefined;
  capitalize?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 font-medium", capitalize && "capitalize")}>{value ?? "-"}</dd>
    </div>
  );
}
