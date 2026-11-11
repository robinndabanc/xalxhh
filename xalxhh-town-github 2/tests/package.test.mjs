import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat, readdir } from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url)), docs = path.join(root, "docs");
const read = name => readFile(path.join(docs, name), "utf8");

test("GitHub Pages package contains every local asset and unique page IDs", async () => {
  const html = await read("index.html"), ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (!/^[a-z]+:/i.test(match[1])) { await stat(path.join(docs, match[1])); assert.ok(new URL(match[1], "https://owner.github.io/xalxhh-town/").pathname.startsWith("/xalxhh-town/")); }
  }
  for (const name of ["town.css", "design-pages.css"]) for (const match of (await read(name)).matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)) {
    if (!/^[a-z]+:/i.test(match[1])) await stat(path.join(docs, match[1]));
  }
  await stat(path.join(docs, ".nojekyll"));
  assert.ok(!html.includes("Enter the admin password to"));
  assert.ok(!(await read("town-admin.js")).includes("Preview mode ·"));
});
test("all browser scripts parse and production configuration is safe to upload", async () => {
  for (const name of await readdir(docs)) if (name.endsWith(".js")) new vm.Script(await read(name), { filename: name });
  const context = { window: {} }; vm.runInNewContext(await read("config.js"), context);
  const config = context.window.XALXHH_CONFIG;
  assert.equal(config.previewMode, false); assert.equal(config.supabaseUrl, ""); assert.equal(config.supabasePublishableKey, "");
  assert.equal(config.spotifyMetadataUrl, "");
});
test("missing or partial production connection never loads examples or mock admin", async () => {
  const source = await read("town-store.js");
  for (const config of [{ previewMode: false }, { previewMode: false, supabaseUrl: "https://test.supabase.co" }]) {
    const context = { window: { XALXHH_CONFIG: config, TownPreviewData: { games: [], videos: [], songs: [], wheel: [], prompts: Array(25).fill("Topic") } }, crypto: webcrypto, TextEncoder, setInterval: () => 0, setTimeout, clearTimeout, document: { addEventListener() {} } };
    vm.runInNewContext(source, context); const store = context.window.TownStore; await store.init();
    assert.equal(store.mode, "unavailable"); assert.equal(store.isAdmin(), false); assert.equal(store.list("songs").length, 0);
    await assert.rejects(store.enterPreviewAdmin("any-password"), /only available/);
    await assert.rejects(store.add({ kind: "wheel", title: "Unavailable save" }), /temporarily unavailable/);
  }
});
