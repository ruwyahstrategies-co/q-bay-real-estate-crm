// Writes the values of a Booking Form or Reservation Form into the original template PDFs.
//
// The two supplied PDFs in /public are opened as they are and the CRM values are written into their
// empty boxes, so the logo, colours, bilingual labels, legal wording, footer and signature spaces are
// exactly the originals. Nothing in the agreement text is rewritten.
//
// Latin text is drawn as real PDF text. Anything with Arabic (or any character the standard PDF font
// cannot encode) is shaped by the browser's text engine and placed as an image, because a PDF library
// cannot join Arabic letters or order mixed right-to-left text by itself.
//
// This module is loaded on demand (it pulls in the PDF library), only when a form is generated.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  OFFER_FORM_LABELS,
  OFFER_FORM_TEMPLATES,
  formatFormDate,
  type OfferFormType,
  type OfferFormValues,
} from "./offer-forms";

// ---------------------------------------------------------------------------------------------
// Geometry (points, origin at the top left, measured from the supplied PDFs)
// ---------------------------------------------------------------------------------------------

type Box = { x0: number; y0: number; x1: number; y1: number };

const PAGE_H = 841.89;

/** The white input boxes of the Booking Form. The Reservation Form is the same layout, 1pt lower. */
const BOOKING_BOXES: Partial<Record<keyof OfferFormValues, Box>> = {
  client_name: { x0: 158.5, y0: 360.7, x1: 441.5, y1: 378.5 },
  client_mobile: { x0: 158.5, y0: 391.6, x1: 441.5, y1: 409.1 },
  client_email: { x0: 158.5, y0: 422.6, x1: 441.5, y1: 439.8 },
  client_id_number: { x0: 158.5, y0: 453.5, x1: 441.5, y1: 470.4 },
  location: { x0: 157.6, y0: 521.1, x1: 444.1, y1: 539.0 },
  tower_name: { x0: 157.6, y0: 542.1, x1: 444.1, y1: 559.6 },
  floor: { x0: 157.6, y0: 563.0, x1: 444.1, y1: 580.2 },
  unit_no: { x0: 157.6, y0: 584.0, x1: 444.1, y1: 600.9 },
  bedrooms: { x0: 156.9, y0: 604.7, x1: 443.4, y1: 621.6 },
  size: { x0: 157.6, y0: 625.1, x1: 444.0, y1: 642.0 },
  price: { x0: 156.9, y0: 645.3, x1: 443.4, y1: 662.5 },
};

const BOX_FIELDS = Object.keys(BOOKING_BOXES) as (keyof OfferFormValues)[];

function shifted(box: Box, dy: number): Box {
  return { x0: box.x0, x1: box.x1, y0: box.y0 + dy, y1: box.y1 + dy };
}

/**
 * Region of a dotted placeholder that is covered and replaced by the typed value. The cover uses the
 * template's own background there (read from the PDF), so nothing shows as a patch.
 */
const COMMISSION_GAP: Box = { x0: 398.6, y0: 683.2, x1: 425.0, y1: 697.6 };
const RESERVATION_GAP_EN: Box = { x0: 263.4, y0: 696.6, x1: 328.4, y1: 710.6 };
// Starts below the end of the beige panel (y 674.9) so the panel edge is left untouched.
const RESERVATION_GAP_AR: Box = { x0: 409.6, y0: 678.2, x1: 466.9, y1: 690.2 };

/** The underline after "Date:". Reservation Form is 2pt left of the Booking Form. */
const DATE_LINE: Record<OfferFormType, Box> = {
  booking: { x0: 467.1, y0: 162.3, x1: 563.1, y1: 178.5 },
  reservation: { x0: 465.0, y0: 162.8, x1: 561.0, y1: 179.0 },
};

// ---------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------

const INK = rgb(0.07, 0.09, 0.08);
const WHITE = rgb(1, 1, 1);
/** The beige behind the Booking Form's commission sentence, as rendered (the template layers a transparency over its fill). */
const BOOKING_BEIGE = rgb(0.827, 0.784, 0.702);

/** Characters the standard PDF font (WinAnsi) can print directly. */
function isPlainLatin(text: string): boolean {
  return /^[\u0020-\u007E\u00A0-\u00FF]*$/.test(text);
}

/**
 * Reading direction of a value: that of its first letter, as in a normal text field. A value that starts
 * with an Arabic word reads right to left, one that starts with an English word reads left to right, and
 * each keeps its own words in the right order.
 */
export function isRtlText(text: string): boolean {
  const first = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.exec(
    text,
  );
  return !!first && /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(first[0]);
}

function cleanText(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Renders shaped text to a PNG. Provided by the browser; tests that use only Latin text need none. */
export type TextImageRenderer = (
  text: string,
  opts: {
    widthPt: number;
    heightPt: number;
    sizePt: number;
    rtl: boolean;
    align: "left" | "center" | "right";
  },
) => Promise<Uint8Array>;

type DrawCtx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  renderText?: TextImageRenderer;
};

type Align = "left" | "center";

async function drawText(
  ctx: DrawCtx,
  box: Box,
  raw: string,
  opts: { size: number; minSize?: number; align?: Align; pad?: number },
) {
  const text = cleanText(raw);
  if (!text) return;
  const { page, font, doc } = ctx;
  const pad = opts.pad ?? 6;
  const align = opts.align ?? "left";
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const maxW = w - pad * 2;

  if (isPlainLatin(text)) {
    let size = opts.size;
    const minSize = opts.minSize ?? 7;
    while (size > minSize && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
    let out = text;
    if (font.widthOfTextAtSize(out, size) > maxW) {
      while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxW)
        out = out.slice(0, -1);
      out = `${out.trimEnd()}...`;
    }
    const tw = font.widthOfTextAtSize(out, size);
    const x = align === "center" ? box.x0 + (w - tw) / 2 : box.x0 + pad;
    const baselineTop = box.y0 + h / 2 + size * 0.35;
    page.drawText(out, { x, y: PAGE_H - baselineTop, size, font, color: INK });
    return;
  }

  if (!ctx.renderText) {
    throw new Error("This value needs the browser to draw it (Arabic or special characters).");
  }
  const rtl = isRtlText(text);
  const png = await ctx.renderText(text, {
    widthPt: w,
    heightPt: h,
    sizePt: opts.size,
    rtl,
    align: align === "center" ? "center" : rtl ? "right" : "left",
  });
  const img = await doc.embedPng(png);
  page.drawImage(img, { x: box.x0, y: PAGE_H - box.y1, width: w, height: h });
}

// ---------------------------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------------------------

export type BuildOptions = {
  /** Bytes of the original template PDF for this form type. */
  templateBytes: ArrayBuffer | Uint8Array;
  renderText?: TextImageRenderer;
};

/** Writes the values into the original template and returns the finished A4 PDF. */
export async function buildOfferFormPdf(
  type: OfferFormType,
  values: OfferFormValues,
  opts: BuildOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(opts.templateBytes);
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ctx: DrawCtx = { doc, page, font, renderText: opts.renderText };
  const dy = type === "reservation" ? 1 : 0;

  for (const key of BOX_FIELDS) {
    const box = BOOKING_BOXES[key];
    if (!box) continue;
    await drawText(ctx, shifted(box, dy), values[key], { size: 11 });
  }

  await drawText(ctx, DATE_LINE[type], formatFormDate(values.form_date), {
    size: 10.5,
    align: "left",
    pad: 4,
  });

  if (type === "booking") {
    const pct = values.commission_percent.replace(/%/g, "").trim();
    if (pct) {
      page.drawRectangle({
        x: COMMISSION_GAP.x0,
        y: PAGE_H - COMMISSION_GAP.y1,
        width: COMMISSION_GAP.x1 - COMMISSION_GAP.x0,
        height: COMMISSION_GAP.y1 - COMMISSION_GAP.y0,
        color: BOOKING_BEIGE,
      });
      await drawText(ctx, COMMISSION_GAP, pct, { size: 12, align: "center", pad: 1, minSize: 8 });
    }
  } else {
    const amount = values.reservation_amount.trim();
    if (amount) {
      for (const [gap, size] of [
        [RESERVATION_GAP_EN, 11],
        [RESERVATION_GAP_AR, 11],
      ] as const) {
        page.drawRectangle({
          x: gap.x0,
          y: PAGE_H - gap.y1,
          width: gap.x1 - gap.x0,
          height: gap.y1 - gap.y0,
          color: WHITE,
        });
        await drawText(ctx, gap, amount, { size, align: "center", pad: 1, minSize: 7 });
      }
    }
  }

  doc.setTitle(`${OFFER_FORM_LABELS[type]} - ${values.client_name || "Q Bay Real Estate"}`);
  doc.setProducer("Q Bay Real Estate CRM");
  doc.setCreator("Q Bay Real Estate CRM");
  return doc.save();
}

// ---------------------------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------------------------

export async function fetchOfferFormTemplate(type: OfferFormType): Promise<ArrayBuffer> {
  const res = await fetch(encodeURI(OFFER_FORM_TEMPLATES[type]));
  if (!res.ok)
    throw new Error(`Could not load the ${OFFER_FORM_LABELS[type]} template (HTTP ${res.status}).`);
  return res.arrayBuffer();
}

const CANVAS_SCALE = 4;
const ARABIC_STACK =
  '"Noto Naskh Arabic","Noto Sans Arabic","Segoe UI","Geeza Pro","Tahoma","Arial",sans-serif';

/** Draws shaped text on a canvas so Arabic joins and orders correctly, and returns it as a PNG. */
export const renderTextWithCanvas: TextImageRenderer = async (
  text,
  { widthPt, heightPt, sizePt, rtl, align },
) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(widthPt * CANVAS_SCALE);
  canvas.height = Math.ceil(heightPt * CANVAS_SCALE);
  const g = canvas.getContext("2d");
  if (!g) throw new Error("The browser could not draw this text.");

  const pad = 6 * CANVAS_SCALE;
  const maxW = canvas.width - pad * 2;
  let size = sizePt * CANVAS_SCALE;
  const minSize = 7 * CANVAS_SCALE;
  g.direction = rtl ? "rtl" : "ltr";
  g.textBaseline = "alphabetic";
  g.fillStyle = "#121510";
  const setFont = () => {
    g.font = `${size}px ${ARABIC_STACK}`;
  };
  setFont();
  while (size > minSize && g.measureText(text).width > maxW) {
    size -= CANVAS_SCALE / 2;
    setFont();
  }
  const tw = g.measureText(text).width;
  let x: number;
  if (align === "center") x = (canvas.width - tw) / 2;
  else if (align === "right") x = canvas.width - pad - tw;
  else x = pad;
  // "left" is absolute (unlike "start"), so x is the left edge of the shaped text in both directions.
  g.textAlign = "left";
  g.fillText(text, x, canvas.height / 2 + size * 0.35);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The browser could not export this text.");
  return new Uint8Array(await blob.arrayBuffer());
};

export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
