import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  brochurePhotoNote,
  downloadPropertyPdf,
  sharePropertyPdf,
  type BrochureResult,
} from "@/lib/property-pdf-images";
import type { AdvisorContact } from "@/lib/property-pdf";

type Agent = { full_name: string; email?: string | null; phone?: string | null } | null | undefined;

const advisorOf = (agent: Agent): AdvisorContact =>
  agent ? { full_name: agent.full_name, email: agent.email, phone: agent.phone } : null;

/**
 * Download and Share for the property brochure. Used by the Properties list and the property page so both build
 * the same document and report the same things. Tracks which property is being built so its buttons can show it.
 */
export function usePropertyBrochure() {
  const [busyId, setBusyId] = useState<string | null>(null);

  const report = (r: Pick<BrochureResult, "included" | "failed" | "omitted">, done: string) => {
    const note = brochurePhotoNote(r);
    if (note) toast.warning(`${done} ${note}`);
    else toast.success(done);
  };

  const run = useCallback(
    async (propertyId: string, work: () => Promise<void>) => {
      if (busyId) return;
      setBusyId(propertyId);
      try {
        await work();
      } catch (e) {
        toast.error(`Could not build the PDF. ${(e as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [busyId],
  );

  const download = (propertyId: string, agent: Agent) =>
    run(propertyId, async () => {
      const r = await downloadPropertyPdf(propertyId, advisorOf(agent));
      report(r, "PDF downloaded.");
    });

  const share = (propertyId: string, agent: Agent) =>
    run(propertyId, async () => {
      const r = await sharePropertyPdf(propertyId, advisorOf(agent));
      if (r.outcome === "cancelled") return;
      report(
        r,
        r.outcome === "shared" ? "PDF shared." : "PDF downloaded. Share it from your downloads.",
      );
    });

  return { busyId, download, share };
}
