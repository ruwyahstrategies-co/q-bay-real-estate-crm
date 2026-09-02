import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type LeadNote, type LeadNoteVersion } from "@/lib/db";

export const leadNoteKeys = {
  byLead: (leadId: string) => ["lead_notes", "lead", leadId] as const,
  versions: (noteId: string) => ["lead_note_versions", noteId] as const,
};

export function useLeadNotes(leadId: string | undefined) {
  return useQuery({
    queryKey: leadId ? leadNoteKeys.byLead(leadId) : ["lead_notes", "none"],
    enabled: !!leadId,
    queryFn: async (): Promise<(LeadNote & { team_members: { full_name: string } | null })[]> => {
      const { data, error } = await sb
        .from("lead_notes")
        .select("*, team_members(full_name)")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as (LeadNote & { team_members: { full_name: string } | null })[];
    },
  });
}

export function useLeadNoteVersions(noteId: string | undefined) {
  return useQuery({
    queryKey: noteId ? leadNoteKeys.versions(noteId) : ["lead_note_versions", "none"],
    enabled: !!noteId,
    queryFn: async (): Promise<(LeadNoteVersion & { team_members: { full_name: string } | null })[]> => {
      const { data, error } = await sb
        .from("lead_note_versions")
        .select("*, team_members(full_name)")
        .eq("lead_note_id", noteId!)
        .order("edited_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as (LeadNoteVersion & { team_members: { full_name: string } | null })[];
    },
  });
}

export function useCreateLeadNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, content, authorId }: { leadId: string; content: string; authorId: string | null }) => {
      const { data, error } = await sb.from("lead_notes").insert({ lead_id: leadId, content, author_id: authorId }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: leadNoteKeys.byLead(vars.leadId) }),
  });
}

export function useUpdateLeadNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content, leadId }: { id: string; content: string; leadId: string }) => {
      const { data, error } = await sb.from("lead_notes").update({ content }).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: leadNoteKeys.byLead(vars.leadId) });
      qc.invalidateQueries({ queryKey: leadNoteKeys.versions(vars.id) });
    },
  });
}

export function useDeleteLeadNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; leadId: string }) => {
      const { error } = await sb.from("lead_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: leadNoteKeys.byLead(vars.leadId) }),
  });
}
