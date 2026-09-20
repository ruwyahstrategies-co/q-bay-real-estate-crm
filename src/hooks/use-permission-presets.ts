import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type PermissionPreset } from "@/lib/db";
import { sanitizePermissions, type PermissionSet } from "@/lib/permissions";
import { useCurrentUser } from "@/hooks/use-auth";

export const permissionPresetKeys = {
  all: ["permission_presets"] as const,
};

/** A saved preset with its permissions narrowed to the known PermissionSet shape. */
export type SavedPermissionPreset = Omit<PermissionPreset, "permissions"> & {
  permissions: PermissionSet;
};

export function usePermissionPresets() {
  return useQuery({
    queryKey: permissionPresetKeys.all,
    queryFn: async (): Promise<SavedPermissionPreset[]> => {
      const { data, error } = await sb
        .from("permission_presets")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, permissions: sanitizePermissions(p.permissions) }));
    },
  });
}

/** Turns the unique-name violation into a message a person can act on. */
function presetErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "A saved preset with this name already exists. Choose a different name.";
  return error.message;
}

export function useCreatePermissionPreset() {
  const qc = useQueryClient();
  const { teamMember } = useCurrentUser();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string | null;
      permissions: PermissionSet;
    }): Promise<SavedPermissionPreset> => {
      const { data, error } = await sb
        .from("permission_presets")
        .insert({
          name: input.name.trim(),
          description: input.description?.trim() || null,
          permissions: sanitizePermissions(input.permissions),
          created_by: teamMember?.id ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(presetErrorMessage(error));
      return { ...data, permissions: sanitizePermissions(data.permissions) };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: permissionPresetKeys.all }),
  });
}

export function useDeletePermissionPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("permission_presets").delete().eq("id", id);
      if (error) throw new Error(presetErrorMessage(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: permissionPresetKeys.all }),
  });
}
