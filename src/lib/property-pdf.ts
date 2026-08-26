// Property PDF / share-sheet generation - no paid PDF service. Opens a
// print-ready window; the user saves it as a PDF via the browser's native
// print dialog (Ctrl/Cmd+P -> Save as PDF), which works everywhere with zero
// added dependencies or server cost.

import type { Property } from "./db";
import { fmtMoney } from "./db";
import { APP_CONFIG } from "./config";

export function openPropertyPdf(property: Property, heroImageUrl?: string | null) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!win) return;

  const amenities = (property.amenities ?? []).map((a) => `<li>${escapeHtml(a)}</li>`).join("");

  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(property.title)} - ${escapeHtml(APP_CONFIG.companyName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #171717; margin: 0; padding: 32px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .ref { color: #727272; font-size: 12px; margin-bottom: 20px; }
  .hero { width: 100%; max-height: 360px; object-fit: cover; border-radius: 12px; margin-bottom: 20px; background: #f3f3f3; }
  .price { font-size: 28px; font-weight: 700; margin: 12px 0; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }
  .stat { border: 1px solid #e9e9e5; border-radius: 10px; padding: 10px 14px; }
  .stat .label { font-size: 10px; text-transform: uppercase; color: #727272; }
  .stat .value { font-size: 16px; font-weight: 600; }
  .desc { margin-top: 20px; line-height: 1.6; font-size: 14px; }
  ul { columns: 2; padding-left: 18px; font-size: 13px; }
  .footer { margin-top: 40px; font-size: 11px; color: #727272; border-top: 1px solid #e9e9e5; padding-top: 12px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  ${heroImageUrl ? `<img class="hero" src="${escapeHtml(heroImageUrl)}" alt="" />` : ""}
  <h1>${escapeHtml(property.title)}</h1>
  <p class="ref">${property.reference_code ? escapeHtml(property.reference_code) + " - " : ""}${escapeHtml(property.location ?? "")}</p>
  <p class="price">${escapeHtml(fmtMoney(property.price, property.currency))}</p>
  <div class="grid">
    <div class="stat"><div class="label">Type</div><div class="value">${escapeHtml(property.property_type ?? "-")}</div></div>
    <div class="stat"><div class="label">Bedrooms</div><div class="value">${property.bedrooms ?? "-"}</div></div>
    <div class="stat"><div class="label">Bathrooms</div><div class="value">${property.bathrooms ?? "-"}</div></div>
    <div class="stat"><div class="label">Size</div><div class="value">${property.size ? `${property.size} ${property.size_unit ?? ""}` : "-"}</div></div>
    <div class="stat"><div class="label">Availability</div><div class="value">${escapeHtml(property.availability ?? "-")}</div></div>
    <div class="stat"><div class="label">Developer</div><div class="value">${escapeHtml(property.developer ?? "-")}</div></div>
  </div>
  ${property.description ? `<p class="desc">${escapeHtml(property.description)}</p>` : ""}
  ${amenities ? `<h3>Amenities</h3><ul>${amenities}</ul>` : ""}
  <div class="footer">${escapeHtml(APP_CONFIG.companyName)} - generated ${new Date().toLocaleDateString()}</div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
