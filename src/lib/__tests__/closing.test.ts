import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  closingDefaults,
  closingTypeFor,
  commissionFor,
  toNumber,
  validateClosing,
  type ClosingValues,
} from "../closing";

const TODAY = "2026-10-22";

const valid: ClosingValues = {
  property_id: "p1",
  transaction_type: "sale",
  closing_date: "2026-10-20",
  price: "1,250,000",
  currency: "QAR",
  client_name: "Sara Ali",
  client_phone: "+974 5000 0000",
  client_email: "",
  payment_method: "bank_transfer",
  payment_status: "paid",
  payment_details: "",
  commission_rate: "2.5",
  commission_amount: "31250",
  notes: "",
};

describe("closingTypeFor", () => {
  it("follows the listing, and the lead's intent when the listing could be either", () => {
    assert.equal(closingTypeFor("rent", "sale"), "rental");
    assert.equal(closingTypeFor("sale", "rent"), "sale");
    assert.equal(closingTypeFor("off_plan", "rent"), "sale");
    assert.equal(closingTypeFor("off_plan_resale", null), "sale");
    assert.equal(closingTypeFor("commercial", "rent"), "rental");
    assert.equal(closingTypeFor(null, "sale"), "sale");
  });
});

describe("commissionFor", () => {
  it("works out the commission in whole units", () => {
    assert.equal(commissionFor(1250000, 2.5), 31250);
    assert.equal(commissionFor(100000, 0), 0);
    assert.equal(commissionFor(999, 1), 10);
  });

  it("returns null when it cannot be worked out", () => {
    assert.equal(commissionFor(null, 2), null);
    assert.equal(commissionFor(1000, null), null);
    assert.equal(commissionFor(0, 2), null);
    assert.equal(commissionFor(1000, 101), null);
    assert.equal(commissionFor(1000, -1), null);
  });
});

describe("toNumber", () => {
  it("reads typed amounts with thousands separators", () => {
    assert.equal(toNumber("1,250,000"), 1250000);
    assert.equal(toNumber(" 12.5 "), 12.5);
    assert.equal(toNumber(""), null);
    assert.equal(toNumber("abc"), null);
  });
});

describe("closingDefaults", () => {
  const lead = {
    full_name: "Sara Ali",
    phone: "+974 5000 0000",
    email: "sara@example.com",
    transaction_intent: "sale",
  };
  const property = { id: "p1", price: 1300000, currency: "QAR", purpose: "sale" };

  it("prefers the accepted offer's amount over the listing price", () => {
    const d = closingDefaults({ lead, property, offerAmount: 1250000, todayIso: TODAY });
    assert.equal(d.price, "1250000");
    assert.equal(d.property_id, "p1");
    assert.equal(d.transaction_type, "sale");
    assert.equal(d.closing_date, TODAY);
    assert.equal(d.client_name, "Sara Ali");
    assert.equal(d.client_phone, "+974 5000 0000");
  });

  it("falls back to the listing price, and leaves the payment choices for the person closing the deal", () => {
    const d = closingDefaults({ lead, property, todayIso: TODAY });
    assert.equal(d.price, "1300000");
    assert.equal(d.payment_method, "");
    assert.equal(d.payment_status, "");
  });

  it("works with no property chosen yet", () => {
    const d = closingDefaults({ lead: { ...lead, transaction_intent: "rent" }, todayIso: TODAY });
    assert.equal(d.property_id, "");
    assert.equal(d.price, "");
    assert.equal(d.transaction_type, "rental");
  });
});

describe("validateClosing", () => {
  it("accepts a complete deal", () => {
    assert.deepEqual(validateClosing(valid, TODAY), {});
  });

  it("asks for every required closing detail", () => {
    const e = validateClosing(
      {
        ...valid,
        property_id: "",
        price: "",
        client_name: " ",
        client_phone: "",
        payment_method: "",
        payment_status: "",
      },
      TODAY,
    );
    assert.deepEqual(Object.keys(e).sort(), [
      "client_name",
      "client_phone",
      "payment_method",
      "payment_status",
      "price",
      "property_id",
    ]);
  });

  it("refuses a future transaction date but allows today and the past", () => {
    assert.match(
      validateClosing({ ...valid, closing_date: "2026-10-23" }, TODAY).closing_date ?? "",
      /future/,
    );
    assert.equal(validateClosing({ ...valid, closing_date: TODAY }, TODAY).closing_date, undefined);
    assert.equal(
      validateClosing({ ...valid, closing_date: "2025-01-01" }, TODAY).closing_date,
      undefined,
    );
    assert.match(
      validateClosing({ ...valid, closing_date: "" }, TODAY).closing_date ?? "",
      /required/,
    );
  });

  it("checks the price and the commission figures", () => {
    assert.match(validateClosing({ ...valid, price: "0" }, TODAY).price ?? "", /price/);
    assert.match(
      validateClosing({ ...valid, commission_rate: "150" }, TODAY).commission_rate ?? "",
      /between 0 and 100/,
    );
    assert.match(
      validateClosing({ ...valid, commission_rate: "x" }, TODAY).commission_rate ?? "",
      /between 0 and 100/,
    );
    assert.match(
      validateClosing({ ...valid, commission_amount: "-5" }, TODAY).commission_amount ?? "",
      /positive/,
    );
    assert.deepEqual(
      validateClosing({ ...valid, commission_rate: "", commission_amount: "" }, TODAY),
      {},
    );
  });
});
