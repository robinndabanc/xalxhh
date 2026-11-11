(() => {
  "use strict";
  const $ = selector => document.querySelector(selector), store = window.TownStore, examples = window.TownPreviewData;
  const page = { games: 0, videos: 0, songs: 0 }, busy = new Set();
  const boards = {
    games: { board: "gh-board", form: "gh-form-page", grid: "gh-notes", previous: "gh-previous", next: "gh-next", count: "gh-page-number", size: 9 },
    videos: { board: "yt-board", form: "yt-form-page", grid: "yt-cloud-grid", previous: "yt-previous", next: "yt-next", count: "yt-page-count", size: 6 },
    songs: { board: "sp-board", form: "sp-form-page", grid: "sp-note-grid", previous: "sp-previous", next: "sp-next", count: "sp-page-count", size: 9 },
  };
  const angles = [-3, 2, -1, 3, -2, 1, -4, 2, -1];
  function textSpan(className, text) { const span = document.createElement("span"); span.className = className; span.textContent = text; return span; }
  function safeLink(value) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } }
  function videoLink(value) {
    try {
      const url = new URL(value.trim()); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return null;
      const host = url.hostname.toLowerCase().replace(/^www\./, ""); let id;
      if (host === "youtu.be") id = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
      else if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) id = /^\/watch\/?$/.test(url.pathname) ? url.searchParams.get("v") : url.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { id, url: `https://www.youtube.com/watch?v=${id}` } : null;
    } catch { return null; }
  }
  const videoCache = new Map(), videoRequests = new Map(), videoFailures = new Map(), videoDisplayRequests = new Set();
  const legacyVideo = row => Boolean(row.metadata_pending) || /^youtube video title preview$/i.test((row.title || "").trim());
  async function lookupVideo(value) {
    const video = videoLink(value); if (!video) throw new Error("Please add a valid YouTube video link.");
    if (videoCache.has(video.id)) return videoCache.get(video.id);
    if (videoRequests.has(video.id)) return videoRequests.get(video.id);
    const task = (async () => {
      const endpoint = new URL("https://www.youtube.com/oembed"); endpoint.searchParams.set("url", video.url); endpoint.searchParams.set("format", "json");
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(endpoint, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" });
        if (!response.ok) throw new Error("YouTube couldn’t load this title. The video may be private, removed or unavailable.");
        const data = await response.json();
        if (data.provider_name !== "YouTube" || typeof data.title !== "string" || !data.title.trim()) throw new Error("YouTube did not return a video title.");
        const result = { ...video, title: data.title.trim() };
        if (videoCache.size >= 300) videoCache.delete(videoCache.keys().next().value);
        videoCache.set(video.id, result); videoFailures.delete(video.id); return result;
      } catch (error) {
        if (error.name === "AbortError") throw new Error("YouTube took too long to load the title. Please try again.");
        throw error;
      } finally { clearTimeout(timeout); }
    })();
    videoRequests.set(video.id, task);
    try { return await task; } finally { videoRequests.delete(video.id); }
  }
  function videoTitle(row) {
    if (!legacyVideo(row)) return row.title;
    const video = videoLink(row.url || "");
    if (!video) return "Video title unavailable";
    return videoCache.get(video?.id)?.title || (videoFailures.has(video?.id) ? "Video title unavailable" : "Loading video title…");
  }
  function resolveOldVideo(row) {
    const video = videoLink(row.url || "");
    if (!legacyVideo(row) || !video || videoCache.has(video.id) || videoDisplayRequests.has(video.id) || (videoFailures.get(video.id) || 0) > Date.now()) return;
    videoDisplayRequests.add(video.id);
    lookupVideo(video.url).catch(() => videoFailures.set(video.id, Date.now() + 30000)).finally(() => {
      videoDisplayRequests.delete(video.id);
      if (window.TownUI?.route() === "videos") renderBoard("videos");
      if (openVideoEntry && videoLink(openVideoEntry.url || "")?.id === video.id && $("#yt-video-details").open) $("#yt-video-title").textContent = videoTitle(openVideoEntry);
    });
  }
  let videoPreviewId = null, videoPreviewVersion = 0, manualVideoId = null, openVideoEntry = null;
  function hideManualVideoDetails() {
    manualVideoId = null; $("#yt-manual-details").hidden = true;
    const field = $("#yt-manual-title"); field.value = ""; field.required = false; field.disabled = true;
    $("#yt-manual-details button").disabled = true;
  }
  function showManualVideoDetails(video) {
    if (manualVideoId !== video.id) hideManualVideoDetails();
    manualVideoId = video.id; $("#yt-manual-details").hidden = false; $("#yt-manual-title").required = true; availability();
  }
  async function previewVideo() {
    const raw = $("#yt-link").value.trim(), video = videoLink(raw), status = $("#yt-link-status");
    if (!video) { ++videoPreviewVersion; videoPreviewId = null; hideManualVideoDetails(); status.textContent = raw ? "Please add a valid YouTube video link." : ""; return; }
    if (videoPreviewId === video.id) return;
    if (manualVideoId && manualVideoId !== video.id) hideManualVideoDetails();
    videoPreviewId = video.id; const version = ++videoPreviewVersion; status.textContent = "Loading video title…";
    try {
      const result = await lookupVideo(video.url); if (version !== videoPreviewVersion) return;
      hideManualVideoDetails(); status.textContent = result.title;
    } catch {
      if (version !== videoPreviewVersion) return;
      videoPreviewId = null; showManualVideoDetails(video); status.textContent = "Add the video title below to submit.";
    }
  }
  function initVideoDetails() {
    const style = document.createElement("style"); style.textContent = `
      #yt-cloud-preview .yt-lookup-status{margin:6px 0 0;font-size:clamp(12px,1.5vw,16px);line-height:1.35;overflow-wrap:anywhere}
      #yt-cloud-preview .yt-manual-details{margin:0 6.5% 24px;padding:22px;border-radius:16px;background:#fff8ed;color:#4d625f}
      #yt-cloud-preview .yt-manual-details h2{font:inherit;font-size:22px;margin:0 0 10px}
      #yt-cloud-preview .yt-manual-details p{font-size:14px;line-height:1.5;margin:0 0 18px}
      #yt-cloud-preview .yt-manual-details label{display:block;font-size:16px}
      #yt-cloud-preview .yt-manual-details input{display:block;width:100%;min-height:48px;margin-top:6px;padding:10px 12px;border:2px solid #eac0ad;border-radius:8px;background:#fffdf4;color:#4d625f;font-size:16px}
      #yt-cloud-preview .yt-manual-details button{min-height:44px;margin-top:18px;padding:10px 18px;border:0;border-radius:9px;background:#e9ba9c;color:#4d625f}`;
    $("#yt-cloud-preview").append(style);
    const status = document.createElement("p"); status.id = "yt-link-status"; status.className = "yt-lookup-status"; status.setAttribute("role", "status");
    $("#yt-link").parentElement.append(status); $("#yt-link").setAttribute("aria-describedby", status.id);
    const panel = document.createElement("section"); panel.id = "yt-manual-details"; panel.className = "yt-manual-details"; panel.hidden = true; panel.setAttribute("aria-labelledby", "yt-manual-heading");
    const heading = document.createElement("h2"); heading.id = "yt-manual-heading"; heading.textContent = "Add a video title";
    const hint = document.createElement("p"); hint.textContent = "Automatic lookup is unavailable. Add the title to submit your YouTube link.";
    const label = document.createElement("label"); label.htmlFor = "yt-manual-title"; label.textContent = "Video title";
    const input = document.createElement("input"); input.id = "yt-manual-title"; input.name = "video_title"; input.maxLength = 120; input.setAttribute("form", "yt-form"); input.dataset.videoManual = "true"; input.disabled = true; label.append(input);
    const button = document.createElement("button"); button.type = "submit"; button.setAttribute("form", "yt-form"); button.dataset.videoManual = "true"; button.disabled = true; button.textContent = "Submit video";
    panel.append(heading, hint, label, button); $("#yt-form-page").append(panel);
  }
  const songLink = value => window.TownSpotify.parse(value);
  let songPreviewId = null, songPreviewVersion = 0, manualSongId = null;
  function hideManualSongDetails() {
    manualSongId = null; $("#sp-manual-details").hidden = true;
    for (const id of ["sp-manual-title", "sp-manual-artist"]) { const field = $(`#${id}`); field.value = ""; field.required = false; field.disabled = true; }
    $("#sp-manual-details button").disabled = true;
  }
  function showManualSongDetails(track) {
    if (manualSongId !== track.id) hideManualSongDetails();
    manualSongId = track.id; $("#sp-manual-details").hidden = false;
    $("#sp-manual-title").required = true; $("#sp-manual-artist").required = true;
    availability();
  }
  function clearSongPreview() {
    songPreviewId = null; ++songPreviewVersion; $("#sp-live-preview").hidden = true;
    $("#sp-preview-player").replaceChildren(); $("#sp-link-status").textContent = "";
  }
  async function previewSong() {
    const value = $("#sp-link").value.trim(), track = songLink(value), status = $("#sp-link-status");
    if (!track) { clearSongPreview(); hideManualSongDetails(); if (value) { status.textContent = "Paste a Spotify song link beginning open.spotify.com/track/."; status.classList.add("error"); } return; }
    if (songPreviewId === track.id) return;
    if (manualSongId && manualSongId !== track.id) hideManualSongDetails();
    songPreviewId = track.id; const version = ++songPreviewVersion;
    status.textContent = "Loading song and artist…"; status.classList.remove("error");
    $("#sp-live-preview").hidden = false; $("#sp-preview-caption").textContent = "Spotify song preview";
    $("#sp-preview-link").href = track.url; window.TownSpotify.embed($("#sp-preview-player"), track.url);
    try {
      const result = await window.TownSpotify.lookup(track.url); if (version !== songPreviewVersion) return;
      hideManualSongDetails();
      const caption = `${result.title} — ${result.artist}`; status.textContent = caption; $("#sp-preview-caption").textContent = caption;
      $("#sp-preview-player iframe").title = `Spotify: ${caption}`;
    } catch (error) {
      if (version !== songPreviewVersion) return;
      songPreviewId = null; showManualSongDetails(track);
      status.textContent = "Add the song title and artist below to submit."; status.classList.remove("error");
    }
  }
  function details(kind, row) {
    if (kind === "games") {
      $("#gh-detail-title").textContent = row.title; $("#gh-detail-name").textContent = `Suggested by ${row.display_name}`;
      const link = $("#gh-detail-link"), url = safeLink(row.url); link.hidden = !url;
      if (url) { link.href = url; link.textContent = "Open game link ↗"; } else link.removeAttribute("href");
      $("#gh-detail-dialog").showModal();
    } else if (kind === "videos") {
      openVideoEntry = row; $("#yt-video-title").textContent = videoTitle(row); $("#yt-video-author").textContent = `Suggested by ${row.display_name}`;
      $("#yt-watch").href = safeLink(row.url); $("#yt-video-details").showModal();
      resolveOldVideo(row);
    } else {
      $("#sp-detail-title").textContent = row.title; $("#sp-detail-artist").textContent = row.artist || "Artist unavailable";
      $("#sp-detail-name").textContent = `Suggested by ${row.display_name}`; $("#sp-spotify").href = safeLink(row.url);
      window.TownSpotify.embed($("#sp-detail-player"), row.url, `Spotify: ${row.title}${row.artist ? ` — ${row.artist}` : ""}`); $("#sp-song-details").showModal();
    }
  }
  function card(kind, row, index) {
    const button = document.createElement("button"); button.type = "button"; button.dataset.entryId = row.id;
    button.setAttribute("aria-label", `Open ${kind === "videos" ? videoTitle(row) : row.title}${row.artist ? ` by ${row.artist}` : ""}`);
    if (kind === "games") {
      button.className = "gh-note"; button.style.setProperty("--gh-angle", `${angles[index]}deg`);
      const content = textSpan("gh-note-text", ""); content.append(textSpan("gh-note-title", row.title), textSpan("gh-note-name", `by ${row.display_name}`));
      if (safeLink(row.url)) content.append(textSpan("gh-note-link", "view game ↗")); button.append(content);
    } else if (kind === "videos") {
      button.className = "yt-cloud"; const content = textSpan("yt-cloud-text", ""); content.append(textSpan("yt-cloud-title", videoTitle(row)), textSpan("yt-cloud-name", `by ${row.display_name}`)); button.append(content);
    } else {
      button.className = "sp-note"; button.style.setProperty("--sp-angle", `${angles[index]}deg`);
      const content = textSpan("sp-note-text", ""); content.append(textSpan("sp-song-title", row.title), textSpan("sp-song-artist", row.artist || "Artist preview")); button.append(content);
    }
    button.addEventListener("click", () => details(kind, row)); return button;
  }
  function renderBoard(kind) {
    const spec = boards[kind], rows = store.list(kind), total = Math.max(1, Math.ceil(rows.length / spec.size));
    page[kind] = Math.min(page[kind], total - 1);
    const visible = rows.slice(page[kind] * spec.size, (page[kind] + 1) * spec.size);
    $(`#${spec.grid}`).replaceChildren(...visible.map((row, i) => card(kind, row, i)));
    $(`#${spec.previous}`).disabled = page[kind] === 0; $(`#${spec.next}`).disabled = page[kind] + 1 >= total;
    $(`#${spec.count}`).textContent = rows.length ? `${page[kind] + 1} / ${total}` : "";
    const notice = kind === "games" ? $("#gh-board-status") : kind === "videos" ? $("#yt-board-notice") : $("#sp-board-notice");
    let boardMessage = store.error || "";
    if (!boardMessage && kind === "videos") {
      const unresolved = visible.filter(row => legacyVideo(row) && !videoCache.has(videoLink(row.url || "")?.id));
      if (unresolved.length) boardMessage = unresolved.some(row => !videoLink(row.url || "") || videoFailures.has(videoLink(row.url || "")?.id)) ? "A video title couldn’t be loaded. You can still open its YouTube link." : "Loading video titles…";
    }
    if (!boardMessage && kind === "songs" && visible.some(row => row.metadata_pending)) boardMessage = "Some older song suggestions still need their song details refreshed.";
    notice.textContent = boardMessage;
    if (kind === "videos" && window.TownUI?.route() === "videos") visible.forEach(resolveOldVideo);
  }
  function availability() {
    const available = ["preview", "shared"].includes(store.mode);
    for (const [kind, id] of [["games", "gh-form"], ["videos", "yt-form"], ["songs", "sp-form"], ["wheel", "tw-form"]]) {
      Array.from($(`#${id}`).elements).filter(control => control.matches("input,button")).forEach(control => {
        control.disabled = !available || busy.has(kind) || (control.dataset.songManual === "true" && $("#sp-manual-details").hidden) || (control.dataset.videoManual === "true" && $("#yt-manual-details").hidden);
      });
    }
    $("#tw-spin").disabled = !available || spinning || !store.list("wheel").length;
  }
  async function submit(kind) {
    if (busy.has(kind)) return;
    const prefix = { games: "gh", videos: "yt", songs: "sp" }[kind], form = $(`#${prefix}-form`), status = $(`#${prefix}-form-status`);
    if (!form.reportValidity()) return;
    const name = form.elements.display_name.value.trim(); let values, focusSongDetails = false, focusVideoDetails = false;
    busy.add(kind); availability(); status.textContent = kind === "songs" ? "Loading song and artist…" : kind === "videos" ? "Loading video title…" : "Adding your suggestion…"; status.classList.remove("error");
    try {
      if (!name) throw new Error("Please add your name.");
      if (kind === "games") {
        const title = form.elements.title.value.trim(), raw = form.elements.url.value.trim(), url = raw ? safeLink(raw) : null;
        if (!title || (raw && !url)) throw new Error("Please add a game title and a valid link if you include one.");
        values = { kind: "games", title, url, display_name: name };
      } else if (kind === "videos") {
        const parsed = videoLink(form.elements.url.value); if (!parsed) throw new Error("Please add a valid YouTube video link.");
        let title;
        if (manualVideoId === parsed.id) {
          title = $("#yt-manual-title").value.trim(); if (!title) { focusVideoDetails = true; throw new Error("Please add the video title below."); }
        } else {
          try { title = (await lookupVideo(parsed.url)).title; }
          catch { showManualVideoDetails(parsed); focusVideoDetails = true; throw new Error("Add the video title below, then choose Submit video."); }
        }
        values = { kind: "cat-videos", title, url: parsed.url, display_name: name, metadata_pending: false };
      } else {
        const parsed = songLink(form.elements.url.value); if (!parsed) throw new Error("Please add a Spotify song link beginning open.spotify.com/track/.");
        let song;
        if (manualSongId === parsed.id) {
          const title = $("#sp-manual-title").value.trim(), artist = $("#sp-manual-artist").value.trim();
          if (!title || !artist) { focusSongDetails = true; throw new Error("Please add the song title and artist below."); }
          song = { ...parsed, title, artist };
        } else {
          try { song = await window.TownSpotify.lookup(parsed.url); }
          catch {
            showManualSongDetails(parsed); focusSongDetails = true;
            throw new Error("Add the song title and artist below, then choose Submit song.");
          }
        }
        values = { kind: "songs", title: song.title, artist: song.artist, url: song.url, display_name: name, metadata_pending: false };
      }
      status.textContent = "Adding your suggestion…";
      await store.add(values); page[kind] = 0; form.reset(); if (kind === "songs") hideManualSongDetails(); if (kind === "videos") { hideManualVideoDetails(); videoPreviewId = null; ++videoPreviewVersion; $("#yt-link-status").textContent = ""; } status.textContent = ""; window.TownUI.navigate(kind);
    } catch (error) { status.textContent = error.message; status.classList.add("error"); }
    finally { busy.delete(kind); availability(); if (focusSongDetails) $("#sp-manual-title").focus(); if (focusVideoDetails) $("#yt-manual-title").focus(); }
  }
  let marked = new Set([12]), previousRevision = null, wonLines = new Set(), confettiTimer;
  const bingoLines = [[0, 6, 12, 18, 24], [4, 8, 12, 16, 20]];
  for (let i = 0; i < 5; i++) { bingoLines.push(Array.from({ length: 5 }, (_, j) => i * 5 + j), Array.from({ length: 5 }, (_, j) => j * 5 + i)); }
  function celebrateBingo() {
    const confetti = $("#cb-confetti"); clearTimeout(confettiTimer); confetti.replaceChildren();
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const colours = ["#f26ba8", "#ffe066", "#66c7f4", "#b995ef", "#ff8c69", "#74d8ad", "#56d5db", "#6f96ef"], random = (a, b) => a + Math.random() * (b - a);
      const fall = Math.max(600, $(".cb-scene").clientHeight * .9);
      for (let i = 0; i < 120; i++) {
        const piece = document.createElement("i"), drift = random(-180, 180), round = Math.random() < .3, width = random(5, 11);
        const values = { x: `${random(0, 100)}%`, y: `${random(18, 40)}%`, delay: `${random(0, .55)}s`, duration: `${random(2.2, 3.8)}s`, colour: colours[Math.floor(Math.random() * colours.length)], width: `${width}px`, height: `${round ? width : random(9, 19)}px`, radius: round ? "50%" : `${random(0, 3)}px`, drift: `${drift}px`, sway: `${drift * .35 + random(-70, 70)}px`, fall: `${fall * random(.75, 1.15)}px`, spin: `${random(-1080, 1080)}deg`, "start-angle": `${random(0, 360)}deg` };
        for (const [key, value] of Object.entries(values)) piece.style.setProperty(`--cb-${key}`, value); confetti.append(piece);
      }
      confettiTimer = setTimeout(() => confetti.replaceChildren(), 4500);
    }
    if (!$("#cb-celebration").open) $("#cb-celebration").showModal();
  }
  function renderBingo(celebrate = false) {
    const setting = store.bingo;
    if (previousRevision !== setting.revision) { marked = new Set([12]); wonLines = new Set(); previousRevision = setting.revision; }
    const previous = new Set(wonLines); wonLines = new Set(bingoLines.map((line, i) => line.every(index => marked.has(index)) ? i : null).filter(index => index !== null));
    const grid = $("#cb-grid"); grid.replaceChildren();
    setting.prompts.forEach((prompt, index) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "cb-tile"; button.setAttribute("aria-label", prompt); button.setAttribute("aria-pressed", String(marked.has(index))); button.title = prompt;
      const shape = textSpan("cb-shape", ""); shape.setAttribute("aria-hidden", "true");
      for (const className of ["cb-ear cb-ear-left", "cb-ear cb-ear-right", "cb-face"]) shape.append(textSpan(className, ""));
      button.append(shape, textSpan("cb-prompt", prompt));
      button.addEventListener("click", () => { if (marked.has(index)) marked.delete(index); else marked.add(index); renderBingo(true); }); grid.append(button);
    });
    $("#cb-status").textContent = wonLines.size ? "Bingo!" : "";
    if (celebrate && [...wonLines].some(index => !previous.has(index))) celebrateBingo();
  }
  let angle = 0, spinning = false, frameId;
  const palette = ["#f6afbf", "#f8df81", "#b9ddcb", "#d6c8e8", "#ffc8ae", "#bcdae9"];
  const normalize = value => ((value % 360) + 360) % 360;
  function drawWheel() {
    const canvas = $("#tw-canvas"), size = canvas.clientWidth, options = store.list("wheel"); if (!size) return;
    const context = canvas.getContext("2d"), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr); context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const radius = size / 2, step = Math.PI * 2 / Math.max(options.length, 1), fontSize = Math.max(11, Math.min(20, size * .037));
    context.clearRect(0, 0, size, size); context.translate(radius, radius);
    options.forEach((option, index) => {
      const start = -Math.PI / 2 + index * step, mid = start + step / 2;
      context.beginPath(); context.moveTo(0, 0); context.arc(0, 0, radius, start, start + step); context.closePath(); context.fillStyle = palette[index % palette.length]; context.fill();
      context.save(); context.rotate(mid); context.translate(radius * .62, 0); if (Math.cos(mid) < 0) context.rotate(Math.PI);
      context.fillStyle = "#5c4850"; context.font = `${fontSize}px "Chalkboard SE", "Comic Sans MS", "Trebuchet MS", sans-serif`; context.textAlign = "center"; context.textBaseline = "middle";
      const lines = []; let line = "";
      if (options.length > 10) lines.push(String(index + 1));
      else {
        for (const word of option.title.split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (line && context.measureText(next).width > radius * .7) { lines.push(line); line = word; } else line = next; }
        if (line) lines.push(line);
      }
      const visible = lines.slice(0, 3); visible.forEach((text, i) => { if (context.measureText(text).width > radius * .7 || (i === 2 && lines.length > 3)) { while (text.length > 1 && context.measureText(`${text}…`).width > radius * .7) text = text.slice(0, -1); text += "…"; } context.fillText(text, 0, (i - (visible.length - 1) / 2) * fontSize * 1.22); }); context.restore();
    });
    canvas.style.transform = `rotate(${angle}deg)`; canvas.setAttribute("aria-label", `Wheel with ${options.length} suggestions: ${options.map(row => row.title).join(", ")}`);
    const list = $("#tw-options"); list.hidden = options.length <= 10; list.replaceChildren();
    if (options.length > 10) options.forEach(row => { const li = document.createElement("li"); li.textContent = row.title; list.append(li); });
    if (!options.length) $("#tw-result").textContent = "The wheel is waiting for its first suggestion.";
  }
  function spin() {
    if (spinning || !store.list("wheel").length) return;
    spinning = true; availability(); $("#tw-added").textContent = ""; $("#tw-result").textContent = "Spinning…";
    const start = angle, target = start + (5 + Math.floor(Math.random() * 3)) * 360 + Math.random() * 360, began = performance.now(), duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 3300;
    function animate(now) {
      const progress = duration ? Math.min(1, (now - began) / duration) : 1; angle = start + (target - start) * (1 - Math.pow(1 - progress, 4)); $("#tw-canvas").style.transform = `rotate(${angle}deg)`;
      if (progress < 1) { frameId = requestAnimationFrame(animate); return; }
      angle = normalize(target); $("#tw-canvas").style.transform = `rotate(${angle}deg)`; spinning = false; availability();
      const options = store.list("wheel"); if (!options.length) return;
      const chosen = options[Math.floor(normalize(-angle) / (360 / options.length)) % options.length]; $("#tw-result").textContent = `Picked: ${chosen.title}`; $("#tw-picked-name").textContent = chosen.title;
      if (window.TownUI.route() === "wheel") $("#tw-picked").showModal();
    }
    frameId = requestAnimationFrame(animate);
  }
  async function addWheel() {
    if (busy.has("wheel") || !$("#tw-form").reportValidity()) return;
    const field = $("#tw-suggestion"), title = field.value.trim().replace(/\s+/g, " "); if (!title) return;
    busy.add("wheel"); availability(); $("#tw-added").textContent = "Adding your suggestion…";
    try { await store.add({ kind: "wheel", title }); field.value = ""; $("#tw-added").textContent = `Added “${title}” to the wheel.`; }
    catch (error) { $("#tw-added").textContent = error.message; }
    finally { busy.delete("wheel"); availability(); }
  }
  function init() {
    initVideoDetails();
    const notice = document.createElement("p"); notice.id = "gh-board-status"; notice.className = "town-board-status"; notice.setAttribute("role", "status"); $("#gh-board").append(notice);
    for (const kind of Object.keys(boards)) {
      const spec = boards[kind], prefix = { games: "gh", videos: "yt", songs: "sp" }[kind];
      $(`#${prefix}-open-form`).addEventListener("click", () => window.TownUI.navigate(`${kind}/new`));
      $(`#${spec.previous}`).addEventListener("click", () => { page[kind] = Math.max(0, page[kind] - 1); renderBoard(kind); });
      $(`#${spec.next}`).addEventListener("click", () => { page[kind]++; renderBoard(kind); });
      const form = $(`#${prefix}-form`), submitButton = form.querySelector("button"); submitButton.setAttribute("aria-label", `Submit your ${kind === "games" ? "game" : kind === "videos" ? "video" : "song"} suggestion`);
      submitButton.addEventListener("click", () => submit(kind)); form.addEventListener("submit", event => { event.preventDefault(); submit(kind); });
      form.addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); submit(kind); } });
    }
    for (const [id, route] of [["yt-back-board", "videos"], ["yt-mobile-back-board", "videos"], ["sp-back-board", "songs"], ["sp-mobile-back-board", "songs"]]) $(`#${id}`).addEventListener("click", () => window.TownUI.navigate(route));
    for (const [button, dialog] of [["gh-close-details", "gh-detail-dialog"], ["yt-close-details", "yt-video-details"], ["sp-close-details", "sp-song-details"], ["cb-close", "cb-celebration"], ["tw-picked-close", "tw-picked"]]) $(`#${button}`).addEventListener("click", () => $(`#${dialog}`).close());
    $("#sp-link").addEventListener("input", previewSong);
    $("#sp-link").addEventListener("change", previewSong);
    $("#sp-song-details").addEventListener("close", () => $("#sp-detail-player").replaceChildren());
    $("#yt-link").addEventListener("input", previewVideo); $("#yt-link").addEventListener("change", previewVideo);
    $("#yt-video-details").addEventListener("close", () => { openVideoEntry = null; });
    $("#tw-spin").addEventListener("click", spin); $("#tw-add").addEventListener("click", addWheel); $("#tw-form").addEventListener("submit", event => { event.preventDefault(); addWheel(); });
    $("#tw-suggestion").addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); addWheel(); } });
    for (const [kind, listId] of [["videos", "yt-example-links"], ["songs", "sp-example-links"]]) examples[kind].forEach(item => { const option = document.createElement("option"); option.value = kind === "videos" ? `https://www.youtube.com/watch?v=${item.id}` : `https://open.spotify.com/track/${item.id}`; option.label = `${item.title}${item.artist ? ` — ${item.artist}` : ""}`; $(`#${listId}`).append(option); });
    new ResizeObserver(drawWheel).observe($("#tw-wheel"));
  }
  function route(value) {
    const [kind, form] = value.split("/");
    if (value === "videos/new") previewVideo(); else { videoPreviewId = null; ++videoPreviewVersion; }
    if (value === "songs/new") previewSong(); else clearSongPreview();
    for (const [name, spec] of Object.entries(boards)) { $(`#${spec.board}`).hidden = name === kind && form === "new"; $(`#${spec.form}`).hidden = !(name === kind && form === "new"); }
    render(); requestAnimationFrame(drawWheel);
  }
  function render() { Object.keys(boards).forEach(renderBoard); renderBingo(); drawWheel(); availability(); }
  window.TownPages = { init, route, render, safeLink, videoLink, songLink, lookupVideo, videoTitle };
})();
