import { useRef, useState } from "react";
import { Loader2, UploadCloud, Video, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type CloudflareVideoStatus =
  Database["public"]["Tables"]["properties"]["Row"]["cloudflare_video_status"];

/**
 * Property video uploader: requests a one-time Cloudflare Stream upload URL
 * from the cloudflare-stream-upload Edge Function (Cloudflare Account ID and
 * Stream API Token never reach the browser), then POSTs the file straight to
 * Cloudflare with upload progress. If Cloudflare Stream isn't configured on
 * the project yet, the Edge Function says so plainly and this surfaces that
 * message rather than pretending the upload worked.
 */
export function CloudflareVideoUpload({
  videoUid,
  status,
  onChange,
}: {
  videoUid: string | null;
  status: CloudflareVideoStatus | null;
  onChange: (uid: string | null, status: CloudflareVideoStatus) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    setError(null);
    setProgress(0);
    onChange(videoUid, "uploading");
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        uploadURL?: string;
        uid?: string;
        error?: string;
      }>("cloudflare-stream-upload", { body: {} });
      if (fnError || !data?.uploadURL || !data?.uid) {
        // Edge Functions return a JSON error body on non-2xx responses; the
        // supabase-js client surfaces that as a generic FunctionsHttpError,
        // so read the real message back out of the response when present.
        let message =
          data?.error ?? fnError?.message ?? "Could not get a Cloudflare Stream upload URL";
        const context = (fnError as { context?: Response })?.context;
        if (context && typeof context.json === "function") {
          try {
            const body = await context.json();
            if (body?.error) message = body.error;
          } catch {
            // ignore - fall back to the message already set above
          }
        }
        throw new Error(message);
      }
      const uploadURL = data.uploadURL;
      const uid = data.uid;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadURL);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload to Cloudflare failed (HTTP ${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error while uploading to Cloudflare"));
        const form = new FormData();
        form.append("file", file);
        xhr.send(form);
      });

      onChange(uid, "ready");
      toast.success("Video uploaded");
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      onChange(videoUid, "error");
      toast.error(message);
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="video/mp4,video/quicktime,video/webm"
      className="hidden"
      onChange={(e) => handleFiles(e.target.files)}
    />
  );

  if (videoUid && status === "ready") {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between rounded-lg border border-border bg-canvas px-3 py-2.5 text-xs">
          <span className="flex items-center gap-2 text-foreground">
            <Video className="h-3.5 w-3.5" /> Video uploaded (Cloudflare Stream:{" "}
            {videoUid.slice(0, 10)}...)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onChange(null, "none")}
              className="rounded-md border border-border px-2 py-1 text-[11px] text-destructive hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
        {fileInput}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-background px-4 py-8 text-center transition-colors ${dragging ? "border-foreground bg-muted" : "border-border"}`}
      >
        {progress !== null ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-xs font-medium text-foreground">Uploading... {progress}%</p>
          </>
        ) : (
          <>
            <UploadCloud className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} />
            <p className="text-xs font-medium text-foreground">Click or drag a video to upload</p>
            <p className="text-[11px] text-muted-foreground">
              MP4, MOV or WEBM, hosted on Cloudflare Stream
            </p>
          </>
        )}
      </div>
      {fileInput}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
