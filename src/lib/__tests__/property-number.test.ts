import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPropertyNumber,
  parsePropertyNumber,
  propertyCode,
  propertyLabel,
  propertyNumberOf,
} from "../property-number";

test("numbers are padded to three digits and grow past 999", () => {
  assert.equal(formatPropertyNumber(1), "001");
  assert.equal(formatPropertyNumber(42), "042");
  assert.equal(formatPropertyNumber(114), "114");
  assert.equal(formatPropertyNumber(1000), "1000");
  assert.equal(formatPropertyNumber(null), "");
  assert.equal(formatPropertyNumber(0), "");
  assert.equal(formatPropertyNumber(-3), "");
  assert.equal(formatPropertyNumber(1.5), "");
});

test("the number leads, and the historical reference is only a fallback", () => {
  assert.equal(propertyNumberOf({ property_number: 7 }), "007");
  assert.equal(propertyNumberOf({ property_number_label: "007" }), "007");
  assert.equal(propertyCode({ property_number: 7, reference_code: "AAMO-26-002" }), "007");
  assert.equal(propertyCode({ property_number: null, reference_code: "AAMO-26-002" }), "AAMO-26-002");
  assert.equal(propertyCode(null), "");
  assert.equal(propertyLabel({ property_number: 7, reference_code: "AAMO-26-002", title: "Marina flat" }), "007 · Marina flat");
  assert.equal(propertyLabel({ title: "Marina flat" }), "Marina flat");
});

test("a typed number is understood however it is written", () => {
  assert.equal(parsePropertyNumber("7"), 7);
  assert.equal(parsePropertyNumber("007"), 7);
  assert.equal(parsePropertyNumber(" #045 "), 45);
  assert.equal(parsePropertyNumber("0"), null);
  assert.equal(parsePropertyNumber("AAMO-26-002"), null);
  assert.equal(parsePropertyNumber(""), null);
  assert.equal(parsePropertyNumber(null), null);
});
