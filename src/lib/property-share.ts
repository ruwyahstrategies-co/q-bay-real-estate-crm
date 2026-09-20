import { APP_CONFIG } from "@/lib/config";
import { PROPERTY_PURPOSE_LABELS, fmtMoney, type Property } from "@/lib/db";

/**
 * Public website URL of a published property, or null when it cannot be
 * built honestly: the property must be published and the site address must
 * be configured (VITE_PUBLIC_WEBSITE_URL). The website resolves a property by
 * its slug or id, the same way its sitemap links them.
 */
export function publicPropertyUrl(
  property: Pick<Property, "id" | "slug" | "is_published">,
): string | null {
  const base = (import.meta.env.VITE_PUBLIC_WEBSITE_URL as string | undefined)?.trim();
  if (!base || !property.is_published) return null;
  return `${base.replace(/\/+$/, "")}/properties/${property.slug || property.id}`;
}

/** Concise, plain-text share message built only from existing property data. */
export function buildPropertyShareMessage(
  property: Property,
  locationLabel: string | null,
): string {
  const lines: string[] = [property.title];
  if (property.reference_code) lines.push(`Ref: ${property.reference_code}`);
  const facts = [
    PROPERTY_PURPOSE_LABELS[property.purpose] ?? property.purpose,
    locationLabel || property.location,
    property.price != null ? fmtMoney(property.price, property.currency) : null,
  ].filter(Boolean);
  if (facts.length) lines.push(facts.join(" | "));
  const url = publicPropertyUrl(property);
  if (url) lines.push(url);
  lines.push(APP_CONFIG.companyName);
  return lines.join("\n");
}
