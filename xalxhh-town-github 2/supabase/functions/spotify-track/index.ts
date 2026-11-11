// Public Spotify metadata only: this function never reads database rows or account tokens.
// Paste this entire file into a Supabase Edge Function named spotify-track.
type Track = { id: string; url: string };
type Song = Track & { title: string; artist: string };
type Fetcher = typeof fetch;
type JsonRecord = Record<string, unknown>;
const trackPattern = /^\/(?:intl-[a-z]{2}\/)?(?:embed\/)?track\/([A-Za-z0-9]{22})\/?$/;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "X-Content-Type-Options": "nosniff",
};

class MetadataError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}
function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function parseTrack(value: string): Track | null {
  try {
    if (value.length > 2048) return null;
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.hostname !== "open.spotify.com" || url.username || url.password || url.port) return null;
    const id = url.pathname.match(trackPattern)?.[1];
    return id ? { id, url: `https://open.spotify.com/track/${id}` } : null;
  } catch { return null; }
}
async function spotifyText(url: string, fetcher: Fetcher): Promise<string> {
  const response = await fetcher(url, {
    redirect: "error", signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json, text/html", "Accept-Language": "en" },
  });
  if (response.status === 404) throw new MetadataError("This song wasn’t found on Spotify. Please check the link.", 404);
  if (response.status === 429) throw new MetadataError("Spotify is busy. Please wait a moment and try again.", 503);
  if (!response.ok || !response.body) throw new MetadataError("Spotify couldn’t load this song. Please try again.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw new MetadataError("Spotify returned an unreadable song preview.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
function extractTrack(html: string, track: Track, title: unknown): Song {
  const json = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  let entity: JsonRecord = {};
  try {
    const data = record(JSON.parse(json || ""));
    entity = record(record(record(record(record(data.props).pageProps).state).data).entity);
  } catch { /* Unavailable song or changed embed document. */ }
  const artists = Array.isArray(entity.artists) ? entity.artists : [];
  const artist = artists.map(item => record(item).name).filter((name): name is string => typeof name === "string" && Boolean(name.trim())).map(name => name.trim()).join(", ");
  if (entity.id !== track.id || entity.type !== "track" || typeof title !== "string" || !title.trim() || !artist) {
    throw new MetadataError("Spotify couldn’t provide the song title and artist. Please check the link and try again.");
  }
  return { id: track.id, url: track.url, title: title.trim(), artist };
}
function json(status: number, body: Song | { error: string }): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(status === 405 ? { Allow: "GET, OPTIONS" } : {}) },
  });
}

// The factory keeps tests isolated and allows requests in one warm Edge Function to share a cache.
export function createHandler(fetcher: Fetcher = fetch): (request: Request) => Promise<Response> {
  const cache = new Map<string, { data: Song; expires: number }>();
  const pending = new Map<string, Promise<Song>>();
  async function getTrack(value: string): Promise<Song> {
    const track = parseTrack(value);
    if (!track) throw new MetadataError("Please use a Spotify song link from open.spotify.com/track/.", 400);
    const hit = cache.get(track.id); if (hit && hit.expires > Date.now()) return hit.data;
    const inflight = pending.get(track.id); if (inflight) return inflight;
    const task = (async () => {
      try {
        const [metadataText, html] = await Promise.all([
          spotifyText(`https://open.spotify.com/oembed?url=${encodeURIComponent(track.url)}`, fetcher),
          spotifyText(`https://open.spotify.com/embed/track/${track.id}`, fetcher),
        ]);
        let metadata: JsonRecord;
        try { metadata = record(JSON.parse(metadataText)); } catch { throw new MetadataError("Spotify returned an unreadable song preview."); }
        const data = extractTrack(html, track, metadata.title);
        if (cache.size >= 300) { const oldest = cache.keys().next().value; if (oldest) cache.delete(oldest); }
        cache.set(track.id, { data, expires: Date.now() + 3_600_000 }); return data;
      } catch (error) {
        if (error instanceof MetadataError) throw error;
        throw new MetadataError("Couldn’t reach Spotify. Check your connection and try again.");
      }
    })();
    pending.set(track.id, task);
    try { return await task; } finally { pending.delete(track.id); }
  }
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== "GET") return json(405, { error: "Use GET to look up a Spotify song." });
    try { return json(200, await getTrack(new URL(request.url).searchParams.get("url") || "")); }
    catch (error) {
      return error instanceof MetadataError ? json(error.status, { error: error.message }) : json(502, { error: "Song details are temporarily unavailable." });
    }
  };
}
export const handleRequest = createHandler();

// The Supabase entrypoint starts its server; importing in Node tests does not.
if (typeof Deno !== "undefined") Deno.serve(handleRequest);
