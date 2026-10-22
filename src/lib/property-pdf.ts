// The Q-Bay property brochure as a PDF.
//
// One builder makes the document for both Download and Share, so they can never differ. The layout is a
// plain top-to-bottom flow with explicit page-break rules: nothing is positioned from a guess, every block
// asks for the room it needs first, and a heading is never left alone at the bottom of a page.
//
//   Page 1   Q-Bay band, the hero photo (large), purpose, title, reference and location, price, key facts.
//   Then     About this property, Amenities, Specifications (flowing onto more pages as needed).
//   Last     Photos: every remaining photo in a two column grid, cropped to one shape so rows line up.
//   Every page  Advisor contact and page numbers at the foot.
//
// Photos arrive already loaded (see property-pdf-images.ts), so this file draws only and can be tested without
// a browser.

import jsPDF from "jspdf";
import type { Property } from "./db";
import { APP_CONFIG } from "./config";
import { metricMoney } from "./metric-format";

export type PdfImage = { dataUrl: string; width: number; height: number };

export type AdvisorContact = {
  full_name: string;
  email?: string | null;
  phone?: string | null;
} | null;

export type PropertyPdfInput = {
  property: Property;
  /** Name of the development the property belongs to, when it has one. */
  developmentName?: string | null;
  hero: PdfImage | null;
  /** The remaining photos, in gallery order (the hero is not repeated here). */
  gallery: PdfImage[];
  /** Photos that exist but are not included, so the document can say so honestly. */
  omittedPhotos?: number;
  logo?: PdfImage | null;
  advisor?: AdvisorContact;
  /** The title drawn as an image, for titles the built-in font cannot show (Arabic). */
  titleImage?: PdfImage | null;
  generatedOn?: Date;
};

// Brand colours from the CRM design tokens (velvet green scale).
const GREEN_900: [number, number, number] = [11, 43, 38];
const GREEN_600: [number, number, number] = [35, 83, 71];
const GREEN_300: [number, number, number] = [142, 182, 155];
const INK: [number, number, number] = [20, 24, 22];
const MUTED: [number, number, number] = [104, 112, 108];
const LINE: [number, number, number] = [222, 228, 224];
const PANEL: [number, number, number] = [243, 246, 244];

const PAGE_W = 595.28;
const PAGE_H = 841.89;
export const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 58;
const BODY_BOTTOM = PAGE_H - FOOTER_H;
const RUNNING_HEADER_H = 34;
const HERO_ASPECT = 1.6;
const GALLERY_ASPECT = 4 / 3;
const GALLERY_GAP = 10;
const GALLERY_CELL_W = (CONTENT_W - GALLERY_GAP) / 2;

/** Text the built-in PDF font can draw. Other characters (Arabic, emoji) are dropped rather than printed as noise. */
export function pdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u2018\u2019\u201a]/g, "'")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, "")
    .replace(/[^\n\x20-\x7e\u00a1-\u00ff]/g, "")
    .replace(/[ \t]+/g, " ");
}

export function hasArabic(text: string): boolean {
  return /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/.test(text);
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const PURPOSE_BADGE: Record<string, string> = {
  sale: "FOR SALE",
  rent: "FOR RENT",
  commercial: "COMMERCIAL",
  off_plan: "OFF-PLAN",
  off_plan_resale: "OFF-PLAN RESALE",
};

/** The facts shown in the key-facts grid and the specifications table. Empty ones are left out. */
export function propertyFacts(property: Property, developmentName?: string | null) {
  const size = (v: number | null | undefined, unit: string | null | undefined) =>
    v ? `${Number(v).toLocaleString("en-US")} ${unit ?? ""}`.trim() : null;
  const key: [string, string | null][] = [
    ["Bedrooms", property.bedrooms != null ? String(property.bedrooms) : null],
    ["Bathrooms", property.bathrooms != null ? String(property.bathrooms) : null],
    ["Size", size(property.size, property.size_unit)],
    ["Built-up area", size(property.built_up_area, property.built_up_area_unit)],
    ["Type", property.property_type],
    ["Furnishing", property.furnishing_status ? furnishingLabel(property.furnishing_status) : null],
  ];
  const specs: [string, string | null][] = [
    ["Reference", property.reference_code],
    [
      "Listing",
      PURPOSE_BADGE[property.purpose ?? ""]
        ? titleCase((property.purpose ?? "").replace("_", " "))
        : null,
    ],
    ["Availability", property.availability ? titleCase(property.availability) : null],
    ["Property type", property.property_type],
    ["Furnishing", property.furnishing_status ? furnishingLabel(property.furnishing_status) : null],
    ["Size", size(property.size, property.size_unit)],
    ["Built-up area", size(property.built_up_area, property.built_up_area_unit)],
    ["Bedrooms", property.bedrooms != null ? String(property.bedrooms) : null],
    ["Bathrooms", property.bathrooms != null ? String(property.bathrooms) : null],
    ["Parking spaces", property.parking_spaces != null ? String(property.parking_spaces) : null],
    ["Available from", property.available_from ?? null],
    ["Completion", property.completion_status ?? null],
    ["Development", developmentName ?? null],
    ["Developer", property.developer ?? null],
  ];
  return {
    key: key.filter(([, v]) => v) as [string, string][],
    specs: specs.filter(([, v]) => v) as [string, string][],
  };
}

function furnishingLabel(code: string): string {
  return { FF: "Fully furnished", SF: "Semi furnished", UF: "Unfurnished" }[code] ?? code;
}

/** Lays the brochure out and returns the finished document. */
export function buildPropertyPdfDoc(input: PropertyPdfInput): jsPDF {
  const { property } = input;
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const title = pdfText(property.title).trim() || "Property";
  let y = 0;

  // ---- drawing helpers -------------------------------------------------------------------------------------

  const setText = (rgb: [number, number, number], size: number, bold = false) => {
    doc.setTextColor(...rgb);
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
  };

  /** Draws a photo into a box, cropped to fill it (centred), so every cell is the same shape. */
  const coverImage = (img: PdfImage, x: number, top: number, w: number, h: number) => {
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    doc.saveGraphicsState();
    // A null style leaves the path open for clip(); the default style strokes it and leaves nothing to clip to.
    doc.rect(x, top, w, h, null as unknown as string);
    doc.clip();
    doc.discardPath();
    doc.addImage(
      img.dataUrl,
      "JPEG",
      x + (w - dw) / 2,
      top + (h - dh) / 2,
      dw,
      dh,
      undefined,
      "FAST",
    );
    doc.restoreGraphicsState();
  };

  const runningHeader = () => {
    setText(MUTED, 8, true);
    doc.text(APP_CONFIG.companyName.toUpperCase(), MARGIN, 24);
    setText(MUTED, 8);
    const ref = property.reference_code ? `  |  ${property.reference_code}` : "";
    const shortTitle = doc.splitTextToSize(`${title}${ref}`, CONTENT_W - 140)[0] ?? "";
    doc.text(shortTitle, PAGE_W - MARGIN, 24, { align: "right" });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, RUNNING_HEADER_H - 4, PAGE_W - MARGIN, RUNNING_HEADER_H - 4);
  };

  const newPage = () => {
    doc.addPage();
    runningHeader();
    y = RUNNING_HEADER_H + 14;
  };

  /** Makes sure `h` points fit on this page, starting a new page when they do not. */
  const ensure = (h: number) => {
    if (y + h > BODY_BOTTOM) newPage();
  };

  const heading = (text: string) => {
    setText(GREEN_900, 12, true);
    doc.text(text, MARGIN, y + 10);
    doc.setDrawColor(...GREEN_300);
    doc.setLineWidth(1);
    doc.line(MARGIN, y + 16, MARGIN + 28, y + 16);
    y += 28;
  };

  // ---- page 1 -----------------------------------------------------------------------------------------------

  doc.setFillColor(...GREEN_900);
  doc.rect(0, 0, PAGE_W, 66, "F");
  if (input.logo) {
    doc.addImage(
      input.logo.dataUrl,
      "PNG",
      MARGIN,
      11,
      44,
      44 * (input.logo.height / input.logo.width),
      undefined,
      "FAST",
    );
  }
  setText([255, 255, 255], 17, true);
  doc.text(APP_CONFIG.companyName, MARGIN + (input.logo ? 56 : 0), 36);
  setText(GREEN_300, 9);
  doc.text("PROPERTY BROCHURE", MARGIN + (input.logo ? 56 : 0), 50);
  y = 66 + 18;

  // Hero photo: the large area at the top of the page.
  const heroH = CONTENT_W / HERO_ASPECT;
  if (input.hero) {
    coverImage(input.hero, MARGIN, y, CONTENT_W, heroH);
    y += heroH + 16;
  } else {
    // No photo yet: a compact, honest placeholder instead of a large empty block.
    doc.setFillColor(...PANEL);
    doc.roundedRect(MARGIN, y, CONTENT_W, 96, 4, 4, "F");
    setText(MUTED, 10);
    doc.text("Photos for this property are not available yet.", PAGE_W / 2, y + 52, {
      align: "center",
    });
    y += 96 + 16;
  }

  // Purpose and status line.
  const purposeText = PURPOSE_BADGE[property.purpose ?? ""] ?? "";
  const status =
    property.availability && property.availability !== "available"
      ? titleCase(property.availability).toUpperCase()
      : "";
  const badge = [purposeText, status].filter(Boolean).join("  |  ");
  if (badge) {
    setText(GREEN_600, 8.5, true);
    doc.text(badge, MARGIN, y + 8);
    y += 18;
  }

  // Title.
  if (input.titleImage) {
    const w = Math.min(CONTENT_W, input.titleImage.width);
    const h = w * (input.titleImage.height / input.titleImage.width);
    doc.addImage(input.titleImage.dataUrl, "PNG", MARGIN, y, w, h, undefined, "FAST");
    y += h + 6;
  } else {
    setText(INK, 20, true);
    const lines: string[] = doc.splitTextToSize(title, CONTENT_W).slice(0, 3);
    doc.text(lines, MARGIN, y + 16, { lineHeightFactor: 1.15 });
    y += lines.length * 23 + 4;
  }

  // Reference and location.
  const where = pdfText(property.location).trim();
  const refLine = [property.reference_code ? `Ref ${property.reference_code}` : "", where]
    .filter(Boolean)
    .join("  |  ");
  if (refLine) {
    setText(MUTED, 10);
    const lines: string[] = doc.splitTextToSize(refLine, CONTENT_W).slice(0, 2);
    doc.text(lines, MARGIN, y + 8);
    y += lines.length * 13 + 8;
  }

  // Price.
  const price = metricMoney(property.price, property.currency).exact;
  if (property.price != null) {
    setText(GREEN_600, 24, true);
    doc.text(price, MARGIN, y + 20);
    y += 34;
  } else {
    setText(MUTED, 12);
    doc.text("Price on request", MARGIN, y + 14);
    y += 28;
  }

  // Key facts: boxes in rows of three, only for values the property has.
  const facts = propertyFacts(property, input.developmentName);
  if (facts.key.length > 0) {
    const cols = 3;
    const gap = 8;
    const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
    const cellH = 40;
    const rows = Math.ceil(facts.key.length / cols);
    ensure(rows * (cellH + gap));
    facts.key.forEach(([label, value], i) => {
      const cx = MARGIN + (i % cols) * (cellW + gap);
      const cy = y + Math.floor(i / cols) * (cellH + gap);
      doc.setFillColor(...PANEL);
      doc.roundedRect(cx, cy, cellW, cellH, 3, 3, "F");
      setText(MUTED, 7.5);
      doc.text(label.toUpperCase(), cx + 10, cy + 14);
      setText(INK, 11.5, true);
      doc.text(doc.splitTextToSize(pdfText(value), cellW - 20)[0] ?? "", cx + 10, cy + 31);
    });
    y += rows * (cellH + gap) + 8;
  }

  // ---- body -------------------------------------------------------------------------------------------------

  const description = pdfText(property.description).trim();
  if (description) {
    ensure(28 + 14 * 3);
    heading("About this property");
    setText(INK, 10);
    for (const paragraph of description.split(/\n{1,}/)) {
      const text = paragraph.trim();
      if (!text) {
        y += 6;
        continue;
      }
      for (const line of doc.splitTextToSize(text, CONTENT_W) as string[]) {
        ensure(14);
        doc.text(line, MARGIN, y + 10);
        y += 14;
      }
      y += 5;
    }
    y += 8;
  }

  const amenities = (property.amenities ?? []).map((a) => pdfText(a).trim()).filter(Boolean);
  if (amenities.length > 0) {
    ensure(28 + 20);
    heading("Amenities");
    const cols = 3;
    const colW = CONTENT_W / cols;
    const rows = Math.ceil(amenities.length / cols);
    for (let r = 0; r < rows; r++) {
      ensure(20);
      for (let c = 0; c < cols; c++) {
        const label = amenities[r * cols + c];
        if (!label) continue;
        const x = MARGIN + c * colW;
        // A small tick drawn as lines, since the built-in font has no tick character.
        doc.setDrawColor(...GREEN_600);
        doc.setLineWidth(1.2);
        doc.line(x, y + 8, x + 3, y + 11);
        doc.line(x + 3, y + 11, x + 9, y + 3);
        setText(INK, 9.5);
        doc.text(doc.splitTextToSize(label, colW - 20)[0] ?? "", x + 15, y + 10);
      }
      y += 20;
    }
    y += 10;
  }

  if (facts.specs.length > 0) {
    ensure(28 + 24);
    heading("Specifications");
    const colW = CONTENT_W / 2;
    const rows = Math.ceil(facts.specs.length / 2);
    // Fill column by column so related facts read down the page.
    for (let r = 0; r < rows; r++) {
      ensure(22);
      for (let c = 0; c < 2; c++) {
        const item = facts.specs[c * rows + r];
        if (!item) continue;
        const x = MARGIN + c * colW;
        setText(MUTED, 8.5);
        doc.text(item[0], x, y + 10);
        setText(INK, 9.5, true);
        doc.text(doc.splitTextToSize(pdfText(item[1]), colW - 110)[0] ?? "", x + 100, y + 10);
      }
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, y + 16, PAGE_W - MARGIN, y + 16);
      y += 22;
    }
    y += 10;
  }

  // ---- photos -----------------------------------------------------------------------------------------------

  if (input.gallery.length > 0) {
    const cellH = GALLERY_CELL_W / GALLERY_ASPECT;
    // Start the gallery where its heading and first row fit together.
    ensure(28 + cellH);
    heading("Photos");
    for (let i = 0; i < input.gallery.length; i += 2) {
      ensure(cellH + GALLERY_GAP);
      const pair = input.gallery.slice(i, i + 2);
      pair.forEach((img, j) => {
        coverImage(img, MARGIN + j * (GALLERY_CELL_W + GALLERY_GAP), y, GALLERY_CELL_W, cellH);
      });
      y += cellH + GALLERY_GAP;
    }
    if (input.omittedPhotos && input.omittedPhotos > 0) {
      ensure(18);
      setText(MUTED, 8.5);
      doc.text(
        `${input.omittedPhotos} more ${input.omittedPhotos === 1 ? "photo is" : "photos are"} available on request.`,
        MARGIN,
        y + 10,
      );
    }
  }

  // ---- footer on every page ---------------------------------------------------------------------------------

  const total = doc.getNumberOfPages();
  const generated = (input.generatedOn ?? new Date()).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const advisorName = pdfText(input.advisor?.full_name).trim() || APP_CONFIG.companyName;
  const contact = [input.advisor?.phone, input.advisor?.email]
    .map(pdfText)
    .filter(Boolean)
    .join("  |  ");
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...GREEN_300);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, PAGE_H - 46, PAGE_W - MARGIN, PAGE_H - 46);
    setText(INK, 9.5, true);
    doc.text(advisorName, MARGIN, PAGE_H - 30);
    setText(MUTED, 8.5);
    doc.text(contact, MARGIN, PAGE_H - 17);
    doc.text(`${generated}   |   Page ${p} of ${total}`, PAGE_W - MARGIN, PAGE_H - 17, {
      align: "right",
    });
  }
  doc.setPage(total);
  return doc;
}

export function buildPropertyPdf(input: PropertyPdfInput): Blob {
  return buildPropertyPdfDoc(input).output("blob");
}

export function propertyPdfFilename(property: Pick<Property, "reference_code" | "title">): string {
  const base = (property.reference_code || property.title || "property")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "property"}.pdf`;
}
