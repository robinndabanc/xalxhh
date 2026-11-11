(() => {
  "use strict";
  const cache = new Map(), pending = new Map();
  function parse(value) {
    try {
      const url = new URL(value.trim());
      if (!["http:", "https:"].includes(url.protocol) || url.hostname !== "open.spotify.com" || url.username || url.password) return null;
      const id = url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?(?:embed\/)?track\/([A-Za-z0-9]{22})\/?$/)?.[1];
      return id ? { id, url: `https://open.spotify.com/track/${id}` } : null;
    } catch { return null; }
  }
  function embed(host, value, title = "Spotify song preview") {
    const track = parse(value); host.replaceChildren();
    if (!track) return;
    const frame = document.createElement("iframe");
    frame.src = `https://open.spotify.com/embed/track/${track.id}?utm_source=generator`;
    frame.title = title; frame.width = "100%"; frame.height = "152";
    frame.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    frame.allowFullscreen = true; frame.referrerPolicy = "strict-origin-when-cross-origin";
    host.append(frame);
  }
  async function lookup(value) {
    const track = parse(value); if (!track) throw new Error("Please paste a Spotify song link, rather than an album or playlist.");
    if (cache.has(track.id)) return cache.get(track.id);
    if (pending.has(track.id)) return pending.get(track.id);
    const task = (async () => {
      const config = window.XALXHH_CONFIG || {}, configured = config.spotifyMetadataUrl;
      const supabaseEndpoint = config.supabaseUrl ? `${config.supabaseUrl.replace(/\/+$/, "")}/functions/v1/spotify-track` : "";
      if (location.protocol === "file:" && !configured && !supabaseEndpoint) throw new Error("Open the town with Start Town Preview.command to load the song title and artist.");
      const endpoint = new URL(configured || supabaseEndpoint || "/api/spotify-track", location.href); endpoint.searchParams.set("url", track.url);
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(endpoint, { signal: controller.signal, headers: { Accept: "application/json" } });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || data.id !== track.id || typeof data.title !== "string" || !data.title.trim() || typeof data.artist !== "string" || !data.artist.trim()) {
          throw new Error(data?.error || "Spotify couldn’t load this song. Check the link and try again.");
        }
        const result = { ...track, title: data.title, artist: data.artist }; cache.set(track.id, result); return result;
      } catch (error) {
        if (error.name === "AbortError") throw new Error("Spotify took too long to reply. Please try again.");
        if (error instanceof TypeError) throw new Error("Song details are unavailable. Check your connection and open the town using its preview launcher.");
        throw error;
      } finally { clearTimeout(timeout); }
    })();
    pending.set(track.id, task);
    try { return await task; } finally { pending.delete(track.id); }
  }
  window.TownSpotify = { parse, embed, lookup };
})();
