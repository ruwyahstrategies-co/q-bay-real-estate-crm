import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVED_MESSAGE,
  NO_SITE_MESSAGE,
  UNPUBLISHED_MESSAGE,
  normalizeWebsiteUrl,
  propertyWebsiteLink,
} from "../website-link";

const published = {
  id: "11111111-2222-3333-4444-555555555555",
  slug: "lusail-penthouse",
  is_published: true,
  status: "active",
};

describe("normalizeWebsiteUrl", () => {
  it("keeps only the origin and accepts a bare domain", () => {
    assert.equal(normalizeWebsiteUrl("https://q-bay.example/"), "https://q-bay.example");
    assert.equal(normalizeWebsiteUrl("  q-bay.example/some/path?x=1#y "), "https://q-bay.example");
    assert.equal(
      normalizeWebsiteUrl("https://www.q-bay.example:8443/a"),
      "https://www.q-bay.example:8443",
    );
  });

  it("rejects anything that is not a usable public address", () => {
    assert.equal(normalizeWebsiteUrl(""), null);
    assert.equal(normalizeWebsiteUrl(null), null);
    assert.equal(normalizeWebsiteUrl("not a url"), null);
    assert.equal(normalizeWebsiteUrl("http://q-bay.example"), null);
    assert.equal(normalizeWebsiteUrl("ftp://q-bay.example"), null);
    assert.equal(normalizeWebsiteUrl("https://user:pass@q-bay.example"), null);
    assert.equal(normalizeWebsiteUrl("https://intranet"), null);
    assert.equal(normalizeWebsiteUrl("javascript:alert(1)"), null);
  });

  it("allows plain http only for localhost", () => {
    assert.equal(normalizeWebsiteUrl("http://localhost:3000/x"), "http://localhost:3000");
  });
});

describe("propertyWebsiteLink", () => {
  it("gives the real public URL for a published property, by slug", () => {
    const link = propertyWebsiteLink(published, "https://q-bay.example");
    assert.deepEqual(link, {
      state: "ready",
      url: "https://q-bay.example/properties/lusail-penthouse",
    });
  });

  it("falls back to the id when there is no slug", () => {
    const link = propertyWebsiteLink({ ...published, slug: null }, "https://q-bay.example/");
    assert.equal(link.state, "ready");
    assert.equal((link as { url: string }).url, `https://q-bay.example/properties/${published.id}`);
  });

  it("refuses honestly for an unpublished property and never builds a URL", () => {
    const link = propertyWebsiteLink(
      { ...published, is_published: false },
      "https://q-bay.example",
    );
    assert.deepEqual(link, { state: "unpublished", message: UNPUBLISHED_MESSAGE });
    assert.equal(UNPUBLISHED_MESSAGE, "Publish this property to the Q-Bay website first.");
  });

  it("refuses for an archived property even if it is still flagged published", () => {
    const link = propertyWebsiteLink({ ...published, status: "archived" }, "https://q-bay.example");
    assert.deepEqual(link, { state: "unpublished", message: ARCHIVED_MESSAGE });
  });

  it("does not invent a domain when none is configured", () => {
    assert.deepEqual(propertyWebsiteLink(published, null), {
      state: "no_site",
      message: NO_SITE_MESSAGE,
    });
    assert.deepEqual(propertyWebsiteLink(published, "nonsense"), {
      state: "no_site",
      message: NO_SITE_MESSAGE,
    });
  });
});
