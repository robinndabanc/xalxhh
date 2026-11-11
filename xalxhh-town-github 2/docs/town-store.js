(() => {
  "use strict";
  const config = window.XALXHH_CONFIG || {}, examples = window.TownPreviewData;
  const listeners = new Set(), activeKinds = ["games", "cat-videos", "asmr", "songs", "wheel"];
  let mode = "loading", client = null, user = null, staffRole = null, previewAdmin = false, entries = [], error = "", refreshId = 0, updateTimer;
  let bingo = { prompts: [...examples.prompts], revision: 1 };
  const emit = () => listeners.forEach(listener => listener());
  const isAdmin = () => mode === "preview" ? previewAdmin : Boolean(user && ["admin", "moderator"].includes(staffRole));
  const kindsFor = kind => kind === "videos" ? ["cat-videos", "asmr"] : [kind];
  function all(kind) {
    return entries.filter(row => kind === "wheel" ? row.kind === "wheel" || row.wheel_enabled : kindsFor(kind).includes(row.kind))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  }
  function list(kind) {
    return all(kind).filter(row => ["approved", "played"].includes(row.status) && (kind !== "wheel" || row.wheel_enabled))
      .sort((a, b) => kind === "wheel" ? a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id) : b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  }
  function seedPreview() {
    const base = Date.now() - 60000, row = (kind, index, values) => ({ id: `preview-${kind}-${index + 1}`, kind,
      title: "", artist: "", display_name: "", description: "", url: null, status: "approved", wheel_enabled: kind === "wheel", metadata_pending: false,
      created_at: new Date(base - index * 1000).toISOString(), ...values });
    entries = [
      ...examples.games.map((item, i) => row("games", i, { title: item.title, display_name: item.name, url: item.link || null })),
      ...examples.videos.map((item, i) => row("cat-videos", i, { title: item.title, display_name: item.name, url: `https://www.youtube.com/watch?v=${item.id}` })),
      ...examples.songs.map((item, i) => row("songs", i, { title: item.title, artist: item.artist, display_name: item.name, url: `https://open.spotify.com/track/${item.id}` })),
      ...examples.wheel.map((title, i) => row("wheel", i, { title, created_at: new Date(base - 3600000 + i * 1000).toISOString() })),
    ];
  }
  async function resolveStaff() {
    staffRole = null;
    if (!client || !user) return;
    const id = user.id, result = await client.from("town_staff").select("role").eq("user_id", id).maybeSingle();
    if (user?.id === id && !result.error && ["admin", "moderator"].includes(result.data?.role)) staffRole = result.data.role;
  }
  async function refresh() {
    if (mode !== "shared" || !client) return;
    const request = ++refreshId;
    try {
      const rows = [], size = 500;
      for (let offset = 0; ; offset += size) {
        const result = await client.from("town_suggestions")
          .select("id,kind,title,artist,display_name,url,description,status,wheel_enabled,metadata_pending,created_at")
          .in("kind", activeKinds).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + size - 1);
        if (result.error) throw result.error;
        if (request !== refreshId) return;
        rows.push(...result.data); if (result.data.length < size) break;
      }
      const setting = await client.from("town_settings").select("value,revision").eq("key", "bingo").single();
      if (setting.error) throw setting.error;
      if (request !== refreshId) return;
      entries = rows; error = "";
      const prompts = setting.data?.value?.prompts;
      if (Array.isArray(prompts) && prompts.length === 25 && prompts.every(value => typeof value === "string") && prompts[12] === "FREE 🐾") bingo = { prompts: [...prompts], revision: Number(setting.data.revision) };
      emit();
    } catch {
      if (request !== refreshId) return;
      entries = []; error = "Shared submissions could not be loaded. Please try again shortly."; emit();
    }
  }
  async function init() {
    const configured = Boolean(config.supabaseUrl && config.supabasePublishableKey);
    if (!configured) {
      if (config.previewMode === true && !config.supabaseUrl && !config.supabasePublishableKey) { mode = "preview"; seedPreview(); }
      else { mode = "unavailable"; error = "Submissions are not available yet."; }
      emit(); return;
    }
    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.119.0");
      client = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { flowType: "implicit", detectSessionInUrl: true, persistSession: true } });
      const session = await client.auth.getSession(); if (session.error) throw session.error;
      user = session.data.session?.user || null; mode = "shared"; await resolveStaff();
      client.auth.onAuthStateChange((_event, session) => {
        ++refreshId; user = session?.user || null; staffRole = null; entries = []; emit();
        window.setTimeout(async () => { try { await resolveStaff(); await refresh(); } catch { error = "Your admin access could not be checked. Please try signing in again."; emit(); } }, 0);
      });
      if (typeof client.channel === "function") client.channel("town-illustrated-updates")
        .on("postgres_changes", { event: "*", schema: "public", table: "town_suggestions" }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "town_settings" }, scheduleRefresh).subscribe();
      await refresh();
    } catch { mode = "unavailable"; client = null; user = null; entries = []; error = "Shared submissions are temporarily unavailable."; emit(); }
  }
  function scheduleRefresh() { clearTimeout(updateTimer); updateTimer = setTimeout(refresh, 150); }
  async function add(values) {
    if (!["preview", "shared"].includes(mode)) throw new Error("Submissions are temporarily unavailable.");
    const payload = { kind: values.kind, title: values.title.slice(0, 120), artist: (values.artist || "").slice(0, 200),
      display_name: (values.display_name || "").slice(0, 60), url: values.url || null, description: "", status: "approved",
      wheel_enabled: values.kind === "wheel", metadata_pending: Boolean(values.metadata_pending) };
    let row;
    if (mode === "preview") row = { ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    else {
      const result = await client.from("town_suggestions").insert({ ...payload, user_id: user?.id || null }).select("*").single();
      if (result.error || !result.data) throw new Error("Your suggestion could not be saved. Please try again.");
      row = result.data;
    }
    entries = [row, ...entries.filter(item => item.id !== row.id)]; emit(); return row;
  }
  async function deleteEntry(id, wheelOnly = false) {
    if (!isAdmin()) throw new Error("Please sign in as an admin first.");
    const row = entries.find(item => item.id === id); if (!row) return;
    const removeFromWheel = wheelOnly && row.kind !== "wheel";
    if (mode === "shared") {
      const request = removeFromWheel ? client.from("town_suggestions").update({ wheel_enabled: false }) : client.from("town_suggestions").delete();
      const result = await request.eq("id", id).select("id").single();
      if (result.error || !result.data) throw new Error("This entry could not be deleted. Please try again.");
    }
    if (removeFromWheel) entries = entries.map(item => item.id === id ? { ...item, wheel_enabled: false } : item);
    else entries = entries.filter(item => item.id !== id);
    emit();
  }
  async function saveBingo(prompts, expectedRevision = bingo.revision) {
    if (!isAdmin()) throw new Error("Please sign in as an admin first.");
    if (prompts.length !== 25 || prompts[12] !== "FREE 🐾" || !prompts.every(value => typeof value === "string" && value.trim() && value.length <= 80)) throw new Error("Please fill in every bingo topic using up to 80 characters.");
    if (expectedRevision !== bingo.revision) throw new Error("The bingo topics changed while you were editing. Refresh before saving.");
    if (mode === "shared") {
      const result = await client.from("town_settings").update({ value: { prompts } }).eq("key", "bingo").eq("revision", expectedRevision).select("value,revision").single();
      if (result.error || !result.data) throw new Error("The topics could not be saved. Refresh in case another moderator edited the card.");
      bingo = { prompts: result.data.value.prompts, revision: Number(result.data.revision) };
    } else bingo = { prompts: [...prompts], revision: bingo.revision + 1 };
    emit();
  }
  async function enterPreviewAdmin(password) {
    if (mode !== "preview") throw new Error("Preview access is only available in the local preview.");
    // This is a local mockup gate. Shared moderation still requires Supabase staff permissions.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(password || "")));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (hash !== "64c288f144c784614bd6862c259434becd110523ba1b0b617c1fad8e71f94970") throw new Error("That password isn’t correct. Please try again.");
    previewAdmin = true; emit();
  }
  async function signIn(email) {
    if (mode !== "shared" || !client) throw new Error("Admin sign-in is unavailable.");
    const redirect = new URL(location.href); redirect.hash = ""; redirect.searchParams.set("page", "admin");
    const result = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect.href } });
    if (result.error) throw new Error("The sign-in link could not be sent. Please try again.");
  }
  async function signOut() {
    if (mode === "preview") { previewAdmin = false; emit(); return; }
    const result = await client.auth.signOut(); if (result.error) throw new Error("Sign-out failed. Please try again.");
    user = null; staffRole = null; entries = []; emit(); await refresh();
  }
  setInterval(() => { if (mode === "shared" && !document.hidden) refresh(); }, 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && mode === "shared") refresh(); });
  window.TownStore = { init, list, all, add, deleteEntry, saveBingo, signIn, signOut, enterPreviewAdmin, isAdmin, refresh,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get mode() { return mode; }, get error() { return error; }, get user() { return user; }, get staffRole() { return staffRole; },
    get bingo() { return { prompts: [...bingo.prompts], revision: bingo.revision }; } };
})();
