import { useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sb } from "@/lib/db";
import { looksLikeGoogleMapsLink, isShortenedGoogleMapsLink, parseGoogleMapsCoordinates } from "@/lib/google-maps-link";

const inputCls =
  "h-9 flex-1 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

/**
 * Paste a Google Maps share/location link and have it populate lat/lng.
 * Handles direct coordinate-bearing URLs client-side; for shortened
 * maps.app.goo.gl links it asks the resolve-maps-link edge function to
 * follow the redirect server-side (no paid Google Maps API involved).
 * Manual lat/lng entry (and the Mapbox picker) remain the source of truth -
 * this is just a fast way to fill them in.
 */
export function GoogleMapsLinkField({ onResolved }: { onResolved: (lat: number, lng: number) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleApply() {
    const link = value.trim();
    if (!link) return;
    if (!looksLikeGoogleMapsLink(link)) {
      toast.error("That doesn't look like a Google Maps link.");
      return;
    }

    const direct = parseGoogleMapsCoordinates(link);
    if (direct) {
      onResolved(direct.lat, direct.lng);
      toast.success("Location set from Google Maps link");
      setValue("");
      return;
    }

    if (!isShortenedGoogleMapsLink(link)) {
      toast.error("Couldn't find coordinates in that link. Try the full (non-shortened) Google Maps link, or set the marker manually below.");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await sb.functions.invoke("resolve-maps-link", { body: { url: link } });
      if (error) throw error;
      const resolved = (data as { resolved_url?: string })?.resolved_url;
      const coords = resolved ? parseGoogleMapsCoordinates(resolved) : null;
      if (!coords) {
        toast.error("Resolved the link but couldn't find coordinates in it. Set the marker manually below.");
        return;
      }
      onResolved(coords.lat, coords.lng);
      toast.success("Location set from Google Maps link");
      setValue("");
    } catch (err) {
      toast.error((err as Error).message || "Could not resolve that link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        className={inputCls}
        placeholder="Paste a Google Maps location link..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleApply(); } }}
      />
      <button
        type="button"
        onClick={() => void handleApply()}
        disabled={busy || !value.trim()}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-canvas px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {busy ? "Resolving..." : "Set location"}
      </button>
    </div>
  );
}
