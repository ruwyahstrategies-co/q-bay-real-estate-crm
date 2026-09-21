import { useMutation } from "@tanstack/react-query";
import { sb, UPLOAD_CATEGORIES } from "@/lib/db";
import { useCurrentUser } from "@/hooks/use-auth";
import { authorizeCrmUpload, putToR2, resolveR2PublicUrl } from "@/lib/r2";

export type ProfileInput = {
  fullName: string;
  phone: string;
  dateOfBirth: string | null;
  avatarUrl?: string | null;
  removeAvatar?: boolean;
};

/**
 * Self-service profile update. Goes through update_my_profile, which only touches the
 * caller's own name, phone, date of birth and avatar. Role, permissions, team, joining
 * date and active status are never writable from here.
 */
export function useUpdateMyProfile() {
  const { refreshTeamMember } = useCurrentUser();
  return useMutation({
    mutationFn: async (input: ProfileInput) => {
      const { error } = await sb.rpc("update_my_profile", {
        _full_name: input.fullName,
        _phone: input.phone,
        _date_of_birth: (input.dateOfBirth || null) as unknown as string,
        _avatar_url: (input.avatarUrl ?? null) as unknown as string,
        _remove_avatar: !!input.removeAvatar,
      });
      if (error) throw error;
    },
    onSuccess: () => refreshTeamMember(),
  });
}

/** Uploads a profile picture to the public R2 media bucket and returns its public URL. */
export async function uploadMyAvatar(file: File, teamMemberId: string): Promise<string> {
  const cat = UPLOAD_CATEGORIES.staff_avatars;
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!(cat.extensions as readonly string[]).includes(ext)) {
    throw new Error(`Use a ${cat.extensions.join(", ")} image.`);
  }
  if (file.size > cat.maxMb * 1024 * 1024) {
    throw new Error(`Profile pictures must be under ${cat.maxMb} MB.`);
  }
  const contentType = file.type || "image/jpeg";
  const auth = await authorizeCrmUpload({
    categoryKey: "staff_avatars",
    entityId: teamMemberId,
    filename: file.name,
    mimeType: contentType,
    sizeBytes: file.size,
  });
  await putToR2(auth.uploadUrl, file, contentType);
  const url = resolveR2PublicUrl(auth.objectKey);
  if (!url) throw new Error("The public media URL is not configured, so the picture cannot be shown.");
  return url;
}
