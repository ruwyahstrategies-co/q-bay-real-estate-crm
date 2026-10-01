// Public website links for properties. Kept free of the database client so the rules can be
// tested on their own.
//
// A link is only ever built from a real website address plus a property that is actually on the
// website (published and active). Nothing here guesses a domain: the address comes from the
// admin-managed Settings value, with VITE_PUBLIC_WEBSITE_URL as the deployment fallback.

export const UNPUBLISHED_MESSAGE = "Publish this property to the Q-Bay website first.";
export const ARCHIVED_MESSAGE = "This property is archived, so it is not on the Q-Bay website.";
export const NO_SITE_MESSAGE =
  "The public website address is not set up yet. Ask an administrator to add it in Settings.";

/**
 * Turns whatever an admin typed into a clean site origin, or null when it is not a usable
 * address. Only https is accepted (plain http only for localhost), and any path, query or
 * credentials are dropped so the result is always just "https://host".
 */
export function normalizeWebsiteUrl(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) return null;
  if (!isLocal && !url.hostname.includes(".")) return null;
  return url.origin;
}

export type PropertyWebsiteLink =
  | { state: "ready"; url: string }
  | { state: "unpublished"; message: string }
  | { state: "no_site"; message: string };

type LinkableProperty = {
  id: string;
  slug: string | null;
  is_published: boolean;
  status: string;
};

/** The website is where public_properties() shows a property: published and active. */
export function propertyWebsiteLink(
  property: LinkableProperty,
  siteUrl: string | null | undefined,
): PropertyWebsiteLink {
  if (property.status !== "active") return { state: "unpublished", message: ARCHIVED_MESSAGE };
  if (!property.is_published) return { state: "unpublished", message: UNPUBLISHED_MESSAGE };
  const base = normalizeWebsiteUrl(siteUrl);
  if (!base) return { state: "no_site", message: NO_SITE_MESSAGE };
  // The website resolves a property by its slug or id, the same way its sitemap links them.
  return {
    state: "ready",
    url: `${base}/properties/${encodeURIComponent(property.slug || property.id)}`,
  };
}

export const DEVELOPMENT_UNPUBLISHED_MESSAGE = "Publish this development to the Q-Bay website first.";

export type DevelopmentWebsiteLink =
  | { state: "ready"; url: string }
  | { state: "unpublished"; message: string }
  | { state: "no_site"; message: string };

type LinkableDevelopment = {
  id: string;
  slug: string | null;
  is_published: boolean;
};

/** The website is where public_developments() shows a development: published only. */
export function developmentWebsiteLink(
  development: LinkableDevelopment,
  siteUrl: string | null | undefined,
): DevelopmentWebsiteLink {
  if (!development.is_published) {
    return { state: "unpublished", message: DEVELOPMENT_UNPUBLISHED_MESSAGE };
  }
  const base = normalizeWebsiteUrl(siteUrl);
  if (!base) return { state: "no_site", message: NO_SITE_MESSAGE };
  // The website resolves a development by its slug or id, same as /developments/$id there.
  return {
    state: "ready",
    url: `${base}/developments/${encodeURIComponent(development.slug || development.id)}`,
  };
}
