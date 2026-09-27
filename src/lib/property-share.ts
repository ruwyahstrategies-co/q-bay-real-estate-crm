import { APP_CONFIG } from "@/lib/config";
import { PROPERTY_PURPOSE_LABELS, fmtMoney, type Property } from "@/lib/db";
import { propertyWebsiteLink } from "@/lib/website-link";

/** The deployment-level website address, used only when Settings does not hold one. */
export function envWebsiteUrl(): string | null {
  return (import.meta.env.VITE_PUBLIC_WEBSITE_URL as string | undefined)?.trim() || null;
}

/**
 * Public website URL of a property, or null when it cannot be built honestly: the property must
 * be published and active and the website address must be known. `siteUrl` is the address from
 * Settings (see usePublicWebsiteUrl); the environment value is the fallback.
 */
export function publicPropertyUrl(
  property: Pick<Property, "id" | "slug" | "is_published" | "status">,
  siteUrl?: string | null,
): string | null {
  const link = propertyWebsiteLink(property, siteUrl ?? envWebsiteUrl());
  return link.state === "ready" ? link.url : null;
}

/** Concise, plain-text share message built only from existing property data. */
export function buildPropertyShareMessage(
  property: Property,
  locationLabel: string | null,
  siteUrl?: string | null,
): string {
  const lines: string[] = [property.title];
  if (property.reference_code) lines.push(`Ref: ${property.reference_code}`);
  const facts = [
    PROPERTY_PURPOSE_LABELS[property.purpose] ?? property.purpose,
    locationLabel || property.location,
    property.price != null ? fmtMoney(property.price, property.currency) : null,
  ].filter(Boolean);
  if (facts.length) lines.push(facts.join(" | "));
  const url = publicPropertyUrl(property, siteUrl);
  if (url) lines.push(url);
  lines.push(APP_CONFIG.companyName);
  return lines.join("\n");
}
