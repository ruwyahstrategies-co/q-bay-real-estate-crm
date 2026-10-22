// A property's photos: which ones count, which one is the hero, and in what order they appear.
//
// The same rules feed the Media section, the list thumbnails and the PDF, so a property can never show one
// hero in the gallery and another in the document.

export type MediaUpload = {
  id: string;
  filename: string;
  storage_provider?: string | null;
  storage_bucket: string;
  storage_path: string;
  public_url?: string | null;
  mime_type?: string | null;
};

export type MediaRow = {
  id: string;
  is_hero: boolean;
  display_order: number;
  media_type?: string | null;
  created_at?: string | null;
  uploads: MediaUpload | null;
};

/** Why a file cannot be added as a property photo, or null when it can. Checked before anything is sent. */
export function imageProblem(
  file: { name: string; size: number },
  rules: { extensions: readonly string[]; maxMb: number },
): string | null {
  const i = file.name.lastIndexOf(".");
  const ext = i >= 0 ? file.name.slice(i + 1).toLowerCase() : "";
  const allowed = rules.extensions.join(", ").toUpperCase();
  if (!rules.extensions.includes(ext)) {
    return ext
      ? `".${ext}" images are not supported. Use ${allowed}.`
      : `This file has no extension. Use one of: ${allowed}.`;
  }
  if (file.size === 0) return "The file is empty.";
  if (file.size > rules.maxMb * 1024 * 1024) return `The file is larger than ${rules.maxMb} MB.`;
  return null;
}

/** The photos of a property in gallery order. Videos and rows whose file is gone are left out. */
export function galleryRows<T extends MediaRow>(rows: T[]): T[] {
  return rows
    .filter((r) => r.uploads && (!r.media_type || r.media_type === "image"))
    .sort(
      (a, b) =>
        a.display_order - b.display_order ||
        (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
        a.id.localeCompare(b.id),
    );
}

/**
 * The hero: the photo marked as hero; otherwise the photo whose address matches the hero address saved on the
 * property (older records); otherwise the first photo. Null when there are no photos.
 */
export function heroOf<T extends MediaRow>(rows: T[], heroImageUrl?: string | null): T | null {
  const list = galleryRows(rows);
  if (list.length === 0) return null;
  return (
    list.find((r) => r.is_hero) ??
    (heroImageUrl ? list.find((r) => r.uploads?.public_url === heroImageUrl) : undefined) ??
    list[0]
  );
}

/** Photos for a document: the hero first, then the rest in gallery order. */
export function orderedForDocument<T extends MediaRow>(rows: T[], heroImageUrl?: string | null): T[] {
  const list = galleryRows(rows);
  const hero = heroOf(list, heroImageUrl);
  if (!hero) return [];
  return [hero, ...list.filter((r) => r.id !== hero.id)];
}

/** The photos that go into a document, capped so a very large gallery cannot make an unusably big file. */
export function photosForDocument<T extends MediaRow>(
  rows: T[],
  heroImageUrl: string | null | undefined,
  cap: number,
): { included: T[]; omitted: number } {
  const ordered = orderedForDocument(rows, heroImageUrl);
  return { included: ordered.slice(0, cap), omitted: Math.max(0, ordered.length - cap) };
}

/** The gallery's row ids after moving the photo at `index` one step left (-1) or right (+1); null if it cannot move. */
export function idsAfterMove(rows: MediaRow[], index: number, direction: -1 | 1): string[] | null {
  const target = index + direction;
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return null;
  const ids = rows.map((r) => r.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids;
}
