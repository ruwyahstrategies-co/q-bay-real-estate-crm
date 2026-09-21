// Server-side mirror of src/lib/db.ts UPLOAD_CATEGORIES, describing only
// what R2 needs (entity type / visibility scope / key subpath / size and
// mime limits) for each CRM upload category. Kept in sync manually with the
// frontend category keys - Deno edge functions and the Vite app do not
// share a module graph.

export type R2CategoryRule = {
  entityType: string;
  scope: "public" | "private";
  subpath: string;
  maxMb: number;
  mimePrefixes: string[];
};

export const R2_CATEGORY_MAP: Record<string, R2CategoryRule> = {
  lead_imports: { entityType: "leads", scope: "private", subpath: "imports", maxMb: 200, mimePrefixes: ["text/", "application/"] },
  whatsapp_exports: { entityType: "leads", scope: "private", subpath: "exports", maxMb: 200, mimePrefixes: ["text/", "application/"] },
  property_documents: { entityType: "properties", scope: "private", subpath: "documents", maxMb: 200, mimePrefixes: ["application/", "text/"] },
  property_media: { entityType: "properties", scope: "public", subpath: "images", maxMb: 200, mimePrefixes: ["image/"] },
  call_recordings: { entityType: "calls", scope: "private", subpath: "audio", maxMb: 200, mimePrefixes: ["audio/"] },
  brochures: { entityType: "properties", scope: "private", subpath: "brochures", maxMb: 200, mimePrefixes: ["application/", "image/"] },
  general_documents: { entityType: "general", scope: "private", subpath: "documents", maxMb: 200, mimePrefixes: ["application/", "text/"] },
  development_media: { entityType: "developments", scope: "public", subpath: "images", maxMb: 200, mimePrefixes: ["image/"] },
  development_documents: { entityType: "developments", scope: "private", subpath: "documents", maxMb: 200, mimePrefixes: ["application/"] },
  owner_documents: { entityType: "owners", scope: "private", subpath: "documents", maxMb: 200, mimePrefixes: ["application/"] },
  tenant_documents: { entityType: "tenancies", scope: "private", subpath: "documents", maxMb: 200, mimePrefixes: ["application/", "image/"] },
  blog_images: { entityType: "journal", scope: "public", subpath: "images", maxMb: 200, mimePrefixes: ["image/"] },
  offer_attachments: { entityType: "offers", scope: "private", subpath: "attachments", maxMb: 200, mimePrefixes: ["application/", "image/"] },
  // Staff profile pictures. Public so they render in lists and on the website agent card.
  // Any active staff member may upload, but only into their own team-member folder (see r2-upload).
  staff_avatars: { entityType: "staff", scope: "public", subpath: "avatars", maxMb: 10, mimePrefixes: ["image/"] },
};
