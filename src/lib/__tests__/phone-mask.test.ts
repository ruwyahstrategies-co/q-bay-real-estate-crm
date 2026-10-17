import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { maskPhone } from "../phone";

describe("maskPhone", () => {
  it("hides every digit except the last two and keeps the formatting", () => {
    assert.equal(maskPhone("+974 5555 2255"), "+••• •••• ••55");
  });

  it("never leaves the leading or middle digits in the masked string", () => {
    const masked = maskPhone("+974 5555 2255");
    assert.ok(!masked.includes("974"));
    assert.ok(!masked.includes("5555"));
  });

  it("masks short numbers completely", () => {
    assert.equal(maskPhone("12345"), "•••••");
  });

  it("leaves non-digit text alone", () => {
    assert.equal(maskPhone("n/a"), "n/a");
  });
});
