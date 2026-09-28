import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  sb,
  type FormFieldDefinition,
  type FormFieldDefinitionInsert,
  type FormFieldDefinitionUpdate,
} from "@/lib/db";

export type FieldEntityType = "lead" | "property";

export const fieldDefinitionKeys = {
  all: (entityType: FieldEntityType) => ["form_field_definitions", entityType] as const,
};

/** Custom field definitions for Leads or Properties (Settings > Form Inputs). */
export function useFieldDefinitions(entityType: FieldEntityType, opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? false;
  return useQuery({
    queryKey: [...fieldDefinitionKeys.all(entityType), { activeOnly }],
    queryFn: async (): Promise<FormFieldDefinition[]> => {
      const { data, error } = await sb
        .from("form_field_definitions")
        .select("*")
        .eq("entity_type", entityType)
        .order("display_order", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      return activeOnly ? rows.filter((r) => r.is_active) : rows;
    },
    staleTime: 30_000,
  });
}

function slugifyKey(label: string): string {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key.match(/^[a-z]/) ? key : `f_${key}`;
}

/** Turns a label into a unique, valid `key` for a new definition of this entity type. */
export function uniqueFieldKey(label: string, existing: FormFieldDefinition[]): string {
  const base = slugifyKey(label) || "field";
  const used = new Set(existing.map((f) => f.key));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function useCreateFieldDefinition(entityType: FieldEntityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<FormFieldDefinitionInsert, "entity_type">) => {
      const { data, error } = await sb
        .from("form_field_definitions")
        .insert({ ...input, entity_type: entityType })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldDefinitionKeys.all(entityType) }),
  });
}

export function useUpdateFieldDefinition(entityType: FieldEntityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: FormFieldDefinitionUpdate }) => {
      const { data, error } = await sb
        .from("form_field_definitions")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldDefinitionKeys.all(entityType) }),
  });
}

export function useReorderFieldDefinitions(entityType: FieldEntityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: { id: string; display_order: number }[]) => {
      await Promise.all(
        ordered.map(({ id, display_order }) =>
          sb.from("form_field_definitions").update({ display_order }).eq("id", id),
        ),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldDefinitionKeys.all(entityType) }),
  });
}

/** Deletes a definition. Historical values already saved under its key inside leads/properties
 * .custom_fields are left exactly as they are - deleting a definition only stops offering it
 * on forms going forward. System fields (is_system) are rejected server-side too. */
export function useDeleteFieldDefinition(entityType: FieldEntityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (def: FormFieldDefinition) => {
      if (def.is_system) {
        throw new Error("This is a system field and cannot be deleted.");
      }
      const { error } = await sb.from("form_field_definitions").delete().eq("id", def.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldDefinitionKeys.all(entityType) }),
  });
}
