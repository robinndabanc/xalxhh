(() => {
  "use strict";
  const routes = new Set(["home", "games", "games/new", "videos", "videos/new", "songs", "songs/new", "wheel", "bingo", "admin"]);
  const titles = { home: "xalxhh's community island", games: "Suggest games", videos: "Suggest YouTube videos", songs: "Suggest songs", wheel: "Spin the wheel", bingo: "Viewer bingo", admin: "Town admin" };
  function route() { const hash = location.hash.slice(1), query = new URLSearchParams(location.search).get("page"); return routes.has(hash) ? hash : routes.has(query) ? query : "home"; }
  function navigate(next) { if (!routes.has(next)) return; if (route() === next) show(); else location.hash = next; }
  function sizeMapTargets() {
    const svg = document.querySelector(".town-map svg"); if (!svg.clientWidth) return;
    const size = Math.max(110, 44 * 2160 / svg.clientWidth);
    svg.querySelectorAll(".map-location").forEach(link => { const [x, y] = link.dataset.center.split(",").map(Number), rect = link.querySelector(".map-hit-target"); rect.setAttribute("x", x - size / 2); rect.setAttribute("y", y - size / 2); rect.setAttribute("width", size); rect.setAttribute("height", size); });
  }
  function show() {
    const current = route(), room = current.split("/")[0], design = window.TownDesigns[room], header = document.querySelector(".site-header"), body = document.body;
    document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
    document.querySelectorAll("[data-view]").forEach(view => { view.hidden = view.dataset.view !== room; });
    body.dataset.room = room; body.style.setProperty("--page-wall", design?.wall || "#80c8e5"); body.style.setProperty("--page-ink", design?.ink || "#3f5553");
    header.style.backgroundColor = design?.header || "#80c8e5"; header.style.color = design?.headerInk || "#3f5553";
    document.querySelector('meta[name="theme-color"]').content = design?.header || "#80c8e5";
    document.querySelector("#header-back-town").hidden = room === "home"; document.title = `${titles[room]} · xalxhh's little town`;
    window.TownPages.route(current); window.TownAdmin.render(); requestAnimationFrame(sizeMapTargets);
  }
  window.TownUI = { route, navigate };
  window.TownPages.init(); window.TownAdmin.init();
  window.TownStore.subscribe(() => { window.TownPages.render(); window.TownAdmin.render(); });
  addEventListener("hashchange", () => { show(); scrollTo(0, 0); document.querySelector("#content").focus({ preventScroll: true }); });
  new ResizeObserver(sizeMapTargets).observe(document.querySelector(".town-map svg"));
  const discord = window.TownPages.safeLink(window.XALXHH_CONFIG?.discordInviteUrl);
  if (discord) { document.querySelector("#discord-link").href = discord; document.querySelector("#discord-link").hidden = false; }
  show(); window.TownUI.ready = window.TownStore.init();
})();
