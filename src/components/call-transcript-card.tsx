import { useMemo, useState } from "react";
import { Mic, Loader2, FileAudio, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "@/components/ui-primitives";
import { UploadDropzone } from "@/components/upload-dropzone";
import { useUploads } from "@/hooks/use-uploads";
import { useInteractions } from "@/hooks/use-interactions";
import { useTranscribeCall } from "@/hooks/use-transcription";
import { fmtDateTime, fmtSize, type Lead } from "@/lib/db";

export function CallTranscriptCard({ lead }: { lead: Lead }) {
  const { data: uploads = [] } = useUploads({ leadId: lead.id, category: "call_recordings" });
  const { data: interactions = [] } = useInteractions({ leadId: lead.id });
  const transcribe = useTranscribeCall();
  const [expanded, setExpanded] = useState<string | null>(null);

  const transcripts = useMemo(
    () => interactions.filter((i) => (i as any).transcript),
    [interactions],
  );

  const handleTranscribe = async (uploadId: string) => {
    try {
      const r = await transcribe.mutateAsync({ upload_id: uploadId, lead_id: lead.id });
      if (r?.ok) {
        toast.success("Transcribed and analysed");
      } else if (r?.error) {
        toast.error(r.error);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Mic className="h-4 w-4" /> Call recordings & transcripts
        </h4>
        <span className="text-[10px] text-muted-foreground">{transcripts.length} transcribed</span>
      </div>

      <div className="mt-3">
        <UploadDropzone
          title="Upload a call recording"
          description="MP3, WAV or M4A up to 150 MB. The system transcribes and extracts requirements, objections, property mentions and next actions."
          categoryKey="call_recordings"
          leadId={lead.id}
        />
      </div>

      {uploads.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Recent recordings</p>
          <ul className="mt-1 space-y-1.5">
            {uploads.slice(0, 8).map((u) => {
              const linked = transcripts.find((i) => (i as any).upload_id === u.id);
              const isProcessing = u.processing_status === "processing"
                || (transcribe.isPending && transcribe.variables?.upload_id === u.id);
              return (
                <li key={u.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium flex items-center gap-1.5">
                      <FileAudio className="h-3.5 w-3.5 shrink-0" /> {u.filename}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {fmtDateTime(u.created_at)} · {fmtSize(u.file_size)} · {u.processing_status}
                      {u.processing_error && <span className="text-rose-600"> · {u.processing_error}</span>}
                    </p>
                  </div>
                  {linked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-pastel-green px-2 py-0.5 text-[10px]">
                      <CheckCircle2 className="h-3 w-3" /> Transcribed
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => handleTranscribe(u.id)} disabled={isProcessing}>
                      {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
                      Transcribe
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {transcripts.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Transcripts</p>
          <ul className="mt-1 space-y-2">
            {transcripts.map((i) => {
              const meta = (i as any).metadata || {};
              const ext = meta?.extraction || null;
              const open = expanded === i.id;
              return (
                <li key={i.id} className="rounded-md border border-border p-2 text-xs">
                  <button
                    onClick={() => setExpanded(open ? null : i.id)}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{i.subject ?? "Call"}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground">{fmtDateTime(i.interaction_date)}</span>
                      {meta?.extraction_error && (
                        <span className="ml-2 inline-flex items-center gap-1 text-amber-600"><AlertCircle className="h-3 w-3" />extraction failed</span>
                      )}
                    </span>
                    {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {open && (
                    <div className="mt-2 space-y-2 border-t border-border pt-2">
                      {ext && (
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          <ChipList label="Requirements" items={ext.requirements} />
                          <ChipList label="Objections" items={ext.objections} />
                          <ChipList label="Next actions" items={ext.next_actions} />
                          <ChipList label="Properties mentioned" items={(ext.property_mentions || []).map((m: any) => m.label).filter(Boolean)} />
                        </div>
                      )}
                      {ext?.summary && (
                        <p className="text-foreground/85"><span className="font-medium">Summary: </span>{ext.summary}</p>
                      )}
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Original transcript (evidence)</p>
                        <p className="mt-1 whitespace-pre-wrap text-[11px] text-foreground/80 max-h-64 overflow-y-auto">
                          {(i as any).transcript}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

function ChipList({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-[11px] text-muted-foreground">-</p>
    </div>
  );
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="mt-0.5 list-disc pl-4 text-[11px]">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}
