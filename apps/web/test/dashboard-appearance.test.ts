import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { prepareHeroImage, readLocalAppearance, saveLocalAppearance, appearanceImageUrl } from "../lib/server/dashboard-appearance.ts";

test("background upload decodes actual image bytes, converts to WebP and rejects invalid or oversized uploads", async () => {
  const png = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#2277aa" } }).png().toBuffer();
  const appearance = await prepareHeroImage(new Request("http://localhost/image", { method: "PUT", body: png }));
  const meta = await sharp(appearance.heroImage).metadata();
  assert.equal(meta.format, "webp"); assert.ok(meta.width! <= 1920); assert.ok(meta.height! <= 1080); assert.equal(meta.exif, undefined);
  await assert.rejects(prepareHeroImage(new Request("http://localhost/image", { method: "PUT", body: "<svg>not a photo</svg>" })), { status: 400 });
  await assert.rejects(prepareHeroImage(new Request("http://localhost/image", { method: "PUT", headers: { "content-length": String(5 * 1024 * 1024) }, body: "large" })), { status: 413 });
});

test("background preferences persist per athlete and reset without changing another athlete", () => {
  const root = mkdtempSync(path.join(tmpdir(), "road-appearance-"));
  const file = path.join(root, "app.sqlite");
  try {
    assert.equal(readLocalAppearance(file, "a"), null);
    const image = { heroImage: new Uint8Array([1, 2, 3]), version: "v1" };
    saveLocalAppearance(file, "a", image);
    assert.equal(readLocalAppearance(file, "a")?.version, "v1");
    assert.equal(readLocalAppearance(file, "b"), null);
    assert.match(appearanceImageUrl(readLocalAppearance(file, "a")), /appearance\/image\?v=v1/);
    saveLocalAppearance(file, "b", { ...image, version: "v2" });
    saveLocalAppearance(file, "a", null);
    assert.equal(appearanceImageUrl(readLocalAppearance(file, "a")), "/road-to-comrades.webp");
    assert.equal(readLocalAppearance(file, "b")?.version, "v2");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
