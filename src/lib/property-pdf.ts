// Property PDF / share-sheet generation - no paid PDF service. openPropertyPdf
// opens a print-ready window (Ctrl/Cmd+P -> Save as PDF) for the "Download
// PDF" action. sharePropertyPdf below generates a real PDF Blob with jsPDF -
// the only way to hand a file to the Web Share API - for the Share action.

import jsPDF from "jspdf";
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
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type AdvisorContact = { full_name: string; email?: string | null; phone?: string | null } | null;

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const BRAND_GREEN: [number, number, number] = [10, 70, 35];
const MUTED: [number, number, number] = [114, 114, 114];

/** Builds the real Q-Bay branded Property PDF as a Blob, from the current live Property record. */
export async function generatePropertyPdfBlob(
  property: Property,
  heroImageUrl?: string | null,
  advisor?: AdvisorContact,
): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 0;

  doc.setFillColor(...BRAND_GREEN);
  doc.rect(0, 0, pageWidth, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(APP_CONFIG.companyName, margin, 40);
  y = 90;

  if (heroImageUrl) {
    const dataUrl = await toDataUrl(heroImageUrl);
    if (dataUrl) {
      try {
        const imgWidth = pageWidth - margin * 2;
        const imgHeight = imgWidth * 0.55;
        doc.addImage(dataUrl, "JPEG", margin, y, imgWidth, imgHeight, undefined, "FAST");
        y += imgHeight + 20;
      } catch {
        // Corrupt/unsupported image data - continue without it rather than fail the whole PDF.
      }
    }
  }

  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(property.title, margin, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  const refLine = [property.reference_code, property.location].filter(Boolean).join("  ·  ");
  if (refLine) {
    doc.text(refLine, margin, y);
    y += 22;
  }

  doc.setTextColor(...BRAND_GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(fmtMoney(property.price, property.currency), margin, y);
  y += 28;

  const specs: [string, string][] = [
    ["Type", property.property_type ?? "-"],
    ["Bedrooms", property.bedrooms != null ? String(property.bedrooms) : "-"],
    ["Bathrooms", property.bathrooms != null ? String(property.bathrooms) : "-"],
    ["Size", property.size ? `${property.size} ${property.size_unit ?? ""}` : "-"],
    ["Availability", property.availability ?? "-"],
    ["Developer", property.developer ?? "-"],
  ];
  doc.setFontSize(9);
  const colWidth = (pageWidth - margin * 2) / 3;
  specs.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = margin + col * colWidth;
    const rowY = y + row * 34;
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.text(label.toUpperCase(), x, rowY);
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.text(value, x, rowY + 13);
  });
  y += Math.ceil(specs.length / 3) * 34 + 16;

  if (property.description) {
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(property.description, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 13 + 16;
  }

  if (property.amenities?.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Amenities & highlights", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const amenityText = property.amenities.join("   ·   ");
    const lines = doc.splitTextToSize(amenityText, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 12 + 16;
  }

  // Advisor / contact block, pinned near the bottom of the page.
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - 70;
  doc.setDrawColor(230, 230, 225);
  doc.line(margin, footerY, pageWidth - margin, footerY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text(advisor?.full_name ?? APP_CONFIG.companyName, margin, footerY + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const contactLine =
    [advisor?.phone, advisor?.email].filter(Boolean).join("  ·  ") || APP_CONFIG.companyName;
  doc.text(contactLine, margin, footerY + 32);
  doc.text(`Generated ${new Date().toLocaleDateString()}`, pageWidth - margin, footerY + 32, {
    align: "right",
  });

  return doc.output("blob");
}

/**
 * Shares the live Property PDF via the Web Share API when a file share
 * target is supported, otherwise falls back to a direct download - never a
 * plain URL, since the PDF itself is what was requested.
 */
export async function sharePropertyPdf(
  property: Property,
  heroImageUrl?: string | null,
  advisor?: AdvisorContact,
): Promise<"shared" | "downloaded"> {
  const blob = await generatePropertyPdfBlob(property, heroImageUrl, advisor);
  const filename = `${(property.reference_code || property.title).replace(/[^a-zA-Z0-9-_]+/g, "-")}.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });

  if (
    typeof navigator !== "undefined" &&
    navigator.share &&
    navigator.canShare?.({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: property.title,
      text: `${property.title} - ${APP_CONFIG.companyName}`,
    });
    return "shared";
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return "downloaded";
}
