import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../docs/town-spotify.js", import.meta.url), "utf8");
const id = "11dFghVXANMlKmJXsNCbNl", link = `https://open.spotify.com/track/${id}`;
function service(config, fetcher, protocol = "https:") {
  const context = { window: { XALXHH_CONFIG: config }, location: { protocol, href: protocol === "file:" ? "file:///town/index.html" : "https://owner.github.io/xalxhh-town/" }, URL, Map, AbortController, setTimeout, clearTimeout, fetch: fetcher };
  vm.runInNewContext(source, context); return context.window.TownSpotify;
}
const response = () => Response.json({ id, url: link, title: "Cut To The Feeling", artist: "Carly Rae Jepsen" });
test("configured GitHub Pages uses the Supabase function and caches successful details", async () => {
  const requests = [], api = service({ supabaseUrl: "https://project.supabase.co/" }, async (url, options) => { requests.push({ url: String(url), options }); return response(); });
  const values = await Promise.all([api.lookup(link), api.lookup(link)]); await api.lookup(link);
  assert.equal(requests.length, 1); assert.equal(values[0].artist, "Carly Rae Jepsen");
  const endpoint = new URL(requests[0].url); assert.equal(endpoint.origin, "https://project.supabase.co"); assert.equal(endpoint.pathname, "/functions/v1/spotify-track"); assert.equal(endpoint.searchParams.get("url"), link);
  assert.deepEqual(Object.keys(requests[0].options.headers), ["Accept"]);
});
test("explicit lookup URL takes priority over the automatic Supabase endpoint", async () => {
  let endpoint; const api = service({ spotifyMetadataUrl: "https://metadata.example/song", supabaseUrl: "https://project.supabase.co" }, async url => { endpoint = new URL(url); return response(); });
  await api.lookup(link); assert.equal(endpoint.origin, "https://metadata.example");
});
test("file preview with Supabase configured can use the hosted metadata endpoint", async () => {
  let called = false; const api = service({ supabaseUrl: "https://project.supabase.co" }, async () => { called = true; return response(); }, "file:");
  await api.lookup(link); assert.equal(called, true);
});
test("lookup failure can be retried and never caches placeholder metadata", async () => {
  let count = 0; const api = service({ supabaseUrl: "https://project.supabase.co" }, async () => ++count === 1 ? Response.json({ error: "Temporary Spotify failure" }, { status: 502 }) : response());
  await assert.rejects(api.lookup(link), /Temporary Spotify failure/); assert.equal((await api.lookup(link)).title, "Cut To The Feeling"); assert.equal(count, 2);
});
test("invalid inputs cannot trigger a metadata request", async () => {
  const api = service({}, () => assert.fail("must not fetch"));
  await assert.rejects(api.lookup("https://open.spotify.com.evil.example/track/" + id), /Spotify song link/);
});
