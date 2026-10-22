import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { buildOfferFormPdf, isRtlText } from "../offer-forms-pdf";
import {
  EMPTY_OFFER_FORM_VALUES,
  finalizeOfferFormValues,
  formatFormDate,
  normalizeMoneyText,
  offerFormFilename,
  prefillOfferForm,
  validateOfferForm,
  type OfferFormValues,
} from "../offer-forms";

const PUBLIC = join(process.cwd(), "public");
const template = (name: string) => readFileSync(join(PUBLIC, name));

// 1x1 transparent PNG, standing in for the browser's shaped-text image.
const PIXEL_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHbqS0QAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

const sample: OfferFormValues = {
  ...EMPTY_OFFER_FORM_VALUES,
  form_date: "2026-10-22",
  client_name: "Mohammed Al Thani",
  client_mobile: "+974 5555 1234",
  client_email: "m@example.com",
  client_id_number: "29850012345",
  location: "Lusail, Marina District",
  tower_name: "Marina Twin Tower",
  floor: "14",
  unit_no: "1407",
  bedrooms: "2",
  size: "118 sqm",
  price: "QAR 1,250,000",
  commission_percent: "2.5",
  reservation_amount: "QAR 25,000",
};

describe("prefillOfferForm", () => {
  const base = {
    offer: { amount: 1250000, currency: "QAR", offer_date: "2026-10-20" },
    lead: { full_name: " Sara Ali ", phone: "+974 5000 0000", email: "sara@example.com" },
    property: {
      location: null,
      tower_name: null,
      floor_number: "9",
      unit_number: "906",
      bedrooms: 0,
      size: 70,
      size_unit: "sqm",
      built_up_area: null,
      built_up_area_unit: null,
      price: 1300000,
      currency: "QAR",
    },
    development: { name: "Pearl Tower" },
    areaName: "The Pearl",
    placeName: "Porto Arabia",
    today: "2026-10-22",
  };

  it("fills client, property, price and location from CRM records", () => {
    const v = prefillOfferForm(base);
    assert.equal(v.client_name, "Sara Ali");
    assert.equal(v.client_mobile, "+974 5000 0000");
    assert.equal(v.client_email, "sara@example.com");
    assert.equal(v.location, "Porto Arabia, The Pearl");
    assert.equal(v.tower_name, "Pearl Tower");
    assert.equal(v.floor, "9");
    assert.equal(v.unit_no, "906");
    assert.equal(v.bedrooms, "Studio");
    assert.equal(v.size, "70 sqm");
    assert.equal(v.price, "QAR 1,250,000");
    assert.equal(v.form_date, "2026-10-22");
  });

  it("leaves what the CRM does not hold for staff to enter", () => {
    const v = prefillOfferForm(base);
    assert.equal(v.client_id_number, "");
    assert.equal(v.commission_percent, "");
    assert.equal(v.reservation_amount, "");
  });

  it("falls back to the property's own price when the offer has no amount", () => {
    const v = prefillOfferForm({ ...base, offer: { amount: null, currency: null } });
    assert.equal(v.price, "QAR 1,300,000");
  });

  it("prefers the property's own location text and its own tower name", () => {
    const v = prefillOfferForm({
      ...base,
      property: {
        ...base.property,
        location: "West Bay",
        tower_name: "Burj Alfardan",
        built_up_area: 95,
        built_up_area_unit: "sqm",
      },
    });
    assert.equal(v.location, "West Bay");
    assert.equal(v.tower_name, "Burj Alfardan");
    assert.equal(v.size, "95 sqm");
  });

  it("works for an offer with no property and no lead details", () => {
    const v = prefillOfferForm({
      offer: { amount: 500000, currency: "QAR" },
      lead: null,
      property: null,
      development: null,
      today: "2026-10-22",
    });
    assert.equal(v.client_name, "");
    assert.equal(v.price, "QAR 500,000");
    assert.equal(v.unit_no, "");
  });
});

describe("money and date text", () => {
  it("a bare number becomes QAR, typed text is kept", () => {
    assert.equal(normalizeMoneyText("25000"), "QAR 25,000");
    assert.equal(normalizeMoneyText(" 1,250,000 "), "QAR 1,250,000");
    assert.equal(normalizeMoneyText("USD 5,000"), "USD 5,000");
    assert.equal(normalizeMoneyText(""), "");
  });

  it("dates print as dd/mm/yyyy", () => {
    assert.equal(formatFormDate("2026-10-22"), "22/10/2026");
    assert.equal(formatFormDate("not a date"), "not a date");
  });

  it("finalize strips the percent sign and formats money", () => {
    const f = finalizeOfferFormValues({
      ...sample,
      commission_percent: " 2.5% ",
      price: "1250000",
      reservation_amount: "25000",
    });
    assert.equal(f.commission_percent, "2.5");
    assert.equal(f.price, "QAR 1,250,000");
    assert.equal(f.reservation_amount, "QAR 25,000");
  });
});

describe("validateOfferForm", () => {
  it("requires a client name", () => {
    assert.ok(
      validateOfferForm("booking", { ...sample, client_name: " " }).some(
        (i) => i.field === "client_name",
      ),
    );
  });

  it("commission must be 0 to 100 when given, and may be left for handwriting", () => {
    assert.deepEqual(validateOfferForm("booking", { ...sample, commission_percent: "" }), []);
    assert.deepEqual(validateOfferForm("booking", { ...sample, commission_percent: "2.5%" }), []);
    assert.ok(
      validateOfferForm("booking", { ...sample, commission_percent: "101" }).some(
        (i) => i.field === "commission_percent",
      ),
    );
    assert.ok(
      validateOfferForm("booking", { ...sample, commission_percent: "abc" }).some(
        (i) => i.field === "commission_percent",
      ),
    );
    // The reservation form has no commission field to validate.
    assert.deepEqual(
      validateOfferForm("reservation", { ...sample, commission_percent: "abc" }),
      [],
    );
  });
});

describe("offerFormFilename", () => {
  it("is readable and safe on every operating system", () => {
    assert.equal(
      offerFormFilename("booking", sample),
      "Booking Form - Mohammed Al Thani - Unit 1407 - 2026-10-22.pdf",
    );
    assert.equal(
      offerFormFilename("reservation", { ...sample, client_name: 'A/B: "C"', unit_no: "" }),
      "Reservation Form - A B C - 2026-10-22.pdf",
    );
  });
});

describe("isRtlText", () => {
  it("follows the first letter, like a normal text field", () => {
    assert.equal(isRtlText("محمد آل ثاني"), true);
    assert.equal(isRtlText("برج Marina 2"), true);
    assert.equal(isRtlText("Marina Twin Tower - برج مارينا"), false);
    assert.equal(isRtlText("1407 - برج"), true);
    assert.equal(isRtlText("1407"), false);
    assert.equal(isRtlText(""), false);
  });
});

describe("buildOfferFormPdf", () => {
  it("keeps the original A4 single page for both forms", async () => {
    for (const [type, file] of [
      ["booking", "Booking Form Sale.pdf"],
      ["reservation", "Reservation Form.pdf"],
    ] as const) {
      const bytes = await buildOfferFormPdf(type, sample, { templateBytes: template(file) });
      const out = await PDFDocument.load(bytes);
      assert.equal(out.getPageCount(), 1);
      const { width, height } = out.getPage(0).getSize();
      assert.equal(Math.round(width), 595);
      assert.equal(Math.round(height), 842);
      assert.ok(
        (out.getTitle() ?? "").includes(type === "booking" ? "Booking Form" : "Reservation Form"),
      );
    }
  });

  it("values change the page, and an empty form leaves it as supplied", async () => {
    const blank = await buildOfferFormPdf("booking", EMPTY_OFFER_FORM_VALUES, {
      templateBytes: template("Booking Form Sale.pdf"),
    });
    const filled = await buildOfferFormPdf("booking", sample, {
      templateBytes: template("Booking Form Sale.pdf"),
    });
    assert.ok(filled.length > blank.length);
  });

  it("the reservation amount only applies to the reservation form, the commission only to the booking form", async () => {
    const onlyCommission = { ...EMPTY_OFFER_FORM_VALUES, commission_percent: "3" };
    const onlyAmount = { ...EMPTY_OFFER_FORM_VALUES, reservation_amount: "QAR 10,000" };
    const blankRes = await buildOfferFormPdf("reservation", EMPTY_OFFER_FORM_VALUES, {
      templateBytes: template("Reservation Form.pdf"),
    });
    const resWithCommission = await buildOfferFormPdf("reservation", onlyCommission, {
      templateBytes: template("Reservation Form.pdf"),
    });
    const resWithAmount = await buildOfferFormPdf("reservation", onlyAmount, {
      templateBytes: template("Reservation Form.pdf"),
    });
    assert.equal(resWithCommission.length, blankRes.length);
    assert.ok(resWithAmount.length > blankRes.length);
  });

  it("very long values are shrunk or shortened, never thrown or left to overflow the box", async () => {
    const long =
      "A very long project location name that keeps going well past the edge of the printed input box ".repeat(
        4,
      );
    const bytes = await buildOfferFormPdf(
      "booking",
      { ...sample, location: long },
      { templateBytes: template("Booking Form Sale.pdf") },
    );
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
  });

  it("Arabic needs the browser's text shaping, and works with it", async () => {
    const arabic = { ...sample, client_name: "محمد آل ثاني" };
    await assert.rejects(
      buildOfferFormPdf("booking", arabic, { templateBytes: template("Booking Form Sale.pdf") }),
      /browser/i,
    );
    const calls: { text: string; rtl: boolean; align: string }[] = [];
    const bytes = await buildOfferFormPdf("booking", arabic, {
      templateBytes: template("Booking Form Sale.pdf"),
      renderText: async (text, o) => {
        calls.push({ text, rtl: o.rtl, align: o.align });
        return PIXEL_PNG;
      },
    });
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    assert.deepEqual(calls, [{ text: "محمد آل ثاني", rtl: true, align: "right" }]);
  });

  it("mixed values go through shaping, and a value that starts in English is laid out left to right", async () => {
    const calls: { text: string; rtl: boolean; align: string }[] = [];
    await buildOfferFormPdf(
      "reservation",
      { ...sample, tower_name: "Marina Twin Tower - برج مارينا", location: "برج Marina 2" },
      {
        templateBytes: template("Reservation Form.pdf"),
        renderText: async (text, o) => {
          calls.push({ text, rtl: o.rtl, align: o.align });
          return PIXEL_PNG;
        },
      },
    );
    assert.deepEqual(calls, [
      { text: "برج Marina 2", rtl: true, align: "right" },
      { text: "Marina Twin Tower - برج مارينا", rtl: false, align: "left" },
    ]);
  });

  it("characters outside the standard PDF font are routed to shaping instead of crashing", async () => {
    await assert.rejects(
      buildOfferFormPdf(
        "booking",
        { ...sample, client_name: "Zoë Ωmega" },
        { templateBytes: template("Booking Form Sale.pdf") },
      ),
      /browser/i,
    );
    // Latin-1 accents are fine in the standard font.
    const ok = await buildOfferFormPdf(
      "booking",
      { ...sample, client_name: "José Müller" },
      { templateBytes: template("Booking Form Sale.pdf") },
    );
    assert.ok(ok.length > 1000);
  });
});
