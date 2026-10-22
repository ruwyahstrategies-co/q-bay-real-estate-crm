import { test } from "node:test";
import assert from "node:assert/strict";
import { galleryRows, heroOf, idsAfterMove, orderedForDocument, photosForDocument, type MediaRow } from "../property-images";

const up = (id: string, url: string | null = `https://img/${id}.jpg`) => ({
  id,
  filename: `${id}.jpg`,
  storage_bucket: "b",
  storage_path: `p/${id}.jpg`,
  public_url: url,
});
const row = (id: string, order: number, extra: Partial<MediaRow> = {}): MediaRow => ({
  id,
  is_hero: false,
  display_order: order,
  media_type: "image",
  uploads: up(id),
  ...extra,
});

test("gallery rows are images with a file, in order, even when positions repeat", () => {
  const rows = [
    row("c", 1),
    row("a", 0),
    row("video", 2, { media_type: "video" }),
    row("gone", 3, { uploads: null }),
    row("b", 1, { created_at: "2026-01-01" }),
  ];
  // "a" is first; "b" and "c" share a position, so the one with no creation time sorts before the dated one.
  assert.deepEqual(
    galleryRows(rows).map((r) => r.id),
    ["a", "c", "b"],
  );
});

test("the hero is the marked photo, else the one matching the property's hero address, else the first", () => {
  const rows = [row("a", 0), row("b", 1), row("c", 2, { is_hero: true })];
  assert.equal(heroOf(rows)!.id, "c");
  const unmarked = [row("a", 0), row("b", 1)];
  assert.equal(heroOf(unmarked, "https://img/b.jpg")!.id, "b");
  assert.equal(heroOf(unmarked, "https://elsewhere/x.jpg")!.id, "a");
  assert.equal(heroOf([]), null);
});

test("documents list the hero first and keep the others in gallery order", () => {
  const rows = [row("a", 0), row("b", 1), row("c", 2, { is_hero: true }), row("d", 3)];
  assert.deepEqual(
    orderedForDocument(rows).map((r) => r.id),
    ["c", "a", "b", "d"],
  );
  assert.deepEqual(orderedForDocument([]), []);
});

test("moving a photo one step gives the new order, and refuses to move past either end", () => {
  const rows = [row("a", 0), row("b", 1), row("c", 2)];
  assert.deepEqual(idsAfterMove(rows, 1, -1), ["b", "a", "c"]);
  assert.deepEqual(idsAfterMove(rows, 1, 1), ["a", "c", "b"]);
  assert.equal(idsAfterMove(rows, 0, -1), null);
  assert.equal(idsAfterMove(rows, 2, 1), null);
  assert.equal(idsAfterMove(rows, 9, 1), null);
});

test("a document takes the hero first and caps the count, reporting what was left out",
  () => {
    const rows = [row("a", 0), row("b", 1), row("c", 2, { is_hero: true }), row("d", 3)];
    const { included, omitted } = photosForDocument(rows, null, 3);
    assert.deepEqual(included.map((r) => r.id), ["c", "a", "b"]);
    assert.equal(omitted, 1);
    assert.equal(photosForDocument(rows, null, 10).omitted, 0);
  });
