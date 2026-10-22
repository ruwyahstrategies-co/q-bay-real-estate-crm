import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Mail,
  MessageCircle,
  NotebookPen,
  Paperclip,
  Phone,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { cn } from "@/lib/utils";
import { fromQatarInputValue, toQatarInputValue } from "@/lib/qatar-time";
import {
  FOLLOW_UP_CHOICES,
  MAX_ATTACHMENTS,
  QUICK_KINDS,
  attachmentProblem,
  followUpDueAt,
  isImageName,
  quickKindConfig,
  type QuickKind,
} from "@/lib/activity";
import { useCreateInteraction } from "@/hooks/use-interactions";
import { useUploadFile } from "@/hooks/use-uploads";
import { useCreateTask } from "@/hooks/use-tasks";
import { useCurrentUser } from "@/hooks/use-auth";

const KIND_ICONS: Record<QuickKind, typeof Phone> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: Users,
  note: NotebookPen,
};

const inputCls =
  "rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/20";

type Draft = { id: string; file: File; preview: string | null };

/**
 * Record one contact with a lead in a few taps: a call, WhatsApp, email, meeting or note. Each press of Save
 * is its own entry in the lead's activity, stamped by the database with who did it and the stage the lead was
 * in, even when there are several in the same stage. Screenshots and files are saved as evidence linked to
 * that exact entry.
 */
export function QuickActivityDrawer({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: { id: string; full_name: string };
}) {
  const create = useCreateInteraction();
  const upload = useUploadFile();
  const createTask = useCreateTask();
  const { teamMember } = useCurrentUser();
  const [kind, setKind] = useState<QuickKind>("call");
  const [direction, setDirection] = useState<"outbound" | "inbound">("outbound");
  const [outcome, setOutcome] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [when, setWhen] = useState("");
  const [minutes, setMinutes] = useState("");
  const [followUp, setFollowUp] = useState("none");
  const [files, setFiles] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const filesRef = useRef<Draft[]>([]);
  filesRef.current = files;
  const inputRef = useRef<HTMLInputElement>(null);

  const cfg = quickKindConfig(kind);

  function reset() {
    setKind("call");
    setDirection("outbound");
    setOutcome(null);
    setSubject("");
    setContent("");
    setWhen(toQatarInputValue(new Date()));
    setMinutes("");
    setFollowUp("none");
    setFiles((cur) => {
      cur.forEach((d) => d.preview && URL.revokeObjectURL(d.preview));
      return [];
    });
  }

  useEffect(() => {
    if (open) reset();
  }, [open]);
  useEffect(
    () => () => filesRef.current.forEach((d) => d.preview && URL.revokeObjectURL(d.preview)),
    [],
  );

  function addFiles(list: File[]) {
    const accepted: Draft[] = [];
    for (const f of list) {
      const problem = attachmentProblem(f.name, f.size);
      if (problem) {
        toast.error(problem);
        continue;
      }
      if (files.length + accepted.length >= MAX_ATTACHMENTS) {
        toast.error(`You can attach up to ${MAX_ATTACHMENTS} files to one entry.`);
        break;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file: f,
        preview: isImageName(f.name) ? URL.createObjectURL(f) : null,
      });
    }
    if (accepted.length) setFiles((cur) => [...cur, ...accepted]);
  }

  // A pasted screenshot becomes an attachment.
  function onPaste(e: React.ClipboardEvent) {
    const pasted = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (pasted.length === 0) return;
    e.preventDefault();
    addFiles(
      pasted.map((f, i) => {
        const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
        return f.name && f.name !== "image.png"
          ? f
          : new File([f], `screenshot-${Date.now()}-${i + 1}.${ext}`, { type: f.type });
      }),
    );
  }

  async function save() {
    if (saving) return;
    if (kind === "note" && !content.trim()) {
      toast.error("Write the note first.");
      return;
    }
    if (kind !== "note" && !outcome && !content.trim() && files.length === 0) {
      toast.error("Choose the outcome or add a short note.");
      return;
    }
    const at = fromQatarInputValue(when) ?? new Date().toISOString();
    if (new Date(at).getTime() > Date.now() + 5 * 60_000) {
      toast.error("The time of the contact cannot be in the future.");
      return;
    }
    setSaving(true);
    try {
      const entry = await create.mutateAsync({
        lead_id: lead.id,
        interaction_type: cfg.interactionType,
        direction: cfg.hasDirection ? direction : "internal",
        subject: subject.trim() || null,
        content: content.trim() || null,
        interaction_date: at,
        duration_seconds:
          kind === "call" && minutes.trim()
            ? Math.max(0, Math.round(Number(minutes) * 60)) || null
            : null,
        outcome,
      });

      const failed: string[] = [];
      for (const d of files) {
        try {
          await upload.mutateAsync({
            file: d.file,
            categoryKey: "conversation_attachments",
            leadId: lead.id,
            interactionId: entry.id,
            metadata: { kind: "conversation_attachment" },
          });
        } catch (e) {
          failed.push(`${d.file.name} (${(e as Error).message})`);
        }
      }

      const choice = FOLLOW_UP_CHOICES.find((c) => c.value === followUp);
      if (choice?.days) {
        try {
          await createTask.mutateAsync({
            title: `Follow up: ${lead.full_name}`,
            lead_id: lead.id,
            assigned_to: teamMember?.id ?? null,
            due_at: followUpDueAt(choice.days, Date.now()),
            priority: "medium",
            status: "pending",
            source: "quick_activity",
            source_ref: entry.id,
          });
        } catch (e) {
          toast.error(
            `The ${cfg.label.toLowerCase()} was saved, but the follow-up task was not: ${(e as Error).message}`,
          );
        }
      }

      if (failed.length > 0) {
        toast.error(
          `${cfg.label} saved, but ${failed.length} attachment${failed.length === 1 ? " was" : "s were"} not uploaded: ${failed.join("; ")}`,
          { duration: 12000 },
        );
      } else {
        toast.success(
          `${cfg.label} recorded${files.length ? ` with ${files.length} attachment${files.length === 1 ? "" : "s"}` : ""}.`,
        );
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DrawerShell
      open={open}
      onOpenChange={(v) => !saving && onOpenChange(v)}
      ariaLabel="Quick activity"
      widthClassName="max-w-lg"
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
        <div>
          <h3 className="text-base font-semibold">Quick activity</h3>
          <p className="text-xs text-muted-foreground">{lead.full_name}</p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={saving}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5" onPaste={onPaste}>
        <div role="radiogroup" aria-label="Type of contact" className="grid grid-cols-5 gap-1.5">
          {QUICK_KINDS.map((k) => {
            const Icon = KIND_ICONS[k.kind];
            const active = kind === k.kind;
            return (
              <button
                key={k.kind}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setKind(k.kind);
                  setOutcome(null);
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[11px] font-medium transition-colors",
                  active
                    ? "border-qbay bg-qbay-tint text-qbay"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                {k.label}
              </button>
            );
          })}
        </div>

        {cfg.hasDirection && (
          <div className="flex gap-1.5" role="radiogroup" aria-label="Direction">
            {(["outbound", "inbound"] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={direction === d}
                onClick={() => setDirection(d)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  direction === d
                    ? "border-qbay bg-qbay-tint text-qbay"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {d === "outbound" ? "I contacted the lead" : "The lead contacted me"}
              </button>
            ))}
          </div>
        )}

        {cfg.outcomes.length > 0 && (
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Outcome
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {cfg.outcomes.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={outcome === o.value}
                  onClick={() => setOutcome(outcome === o.value ? null : o.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    outcome === o.value
                      ? "border-qbay bg-qbay-tint text-qbay"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {kind === "note" ? "Note *" : "What happened?"}
          </span>
          <textarea
            className={cn(inputCls, "h-24 py-2")}
            value={content}
            maxLength={4000}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              kind === "note"
                ? "Write a note about this lead..."
                : "Short summary of the conversation"
            }
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              When
            </span>
            <input
              type="datetime-local"
              className={cn(inputCls, "h-9")}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </label>
          {kind === "call" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Duration (minutes)
              </span>
              <input
                inputMode="decimal"
                className={cn(inputCls, "h-9")}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Subject (optional)
              </span>
              <input
                className={cn(inputCls, "h-9")}
                value={subject}
                maxLength={200}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Evidence (screenshots, images, files)
            </span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted"
            >
              <Paperclip className="h-3 w-3" /> Add files
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.txt"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            You can also paste a screenshot straight into this panel.
          </p>
          {files.length > 0 && (
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {files.map((d) => (
                <li
                  key={d.id}
                  className="relative flex items-center gap-2 rounded-lg border border-border bg-canvas p-1.5 text-xs"
                >
                  {d.preview ? (
                    <img
                      src={d.preview}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                      <Paperclip className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{d.file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${d.file.name}`}
                    onClick={() => {
                      if (d.preview) URL.revokeObjectURL(d.preview);
                      setFiles((cur) => cur.filter((x) => x.id !== d.id));
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Follow-up task
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {FOLLOW_UP_CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={followUp === c.value}
                onClick={() => setFollowUp(c.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  followUp === c.value
                    ? "border-qbay bg-qbay-tint text-qbay"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border bg-canvas px-5 py-3">
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save {cfg.label.toLowerCase()}
        </Button>
      </div>
    </DrawerShell>
  );
}
