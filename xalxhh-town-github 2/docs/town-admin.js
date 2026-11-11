(() => {
  "use strict";
  const $ = selector => document.querySelector(selector), store = window.TownStore;
  const labels = { games: "Game suggestions", videos: "Video suggestions", songs: "Song suggestions", wheel: "Spin the wheel" };
  let dirty = false, renderedRevision = -1;
  function message(id, text, error = false) { const element = $(`#${id}`); element.textContent = text; element.classList.toggle("error", error); }
  function renderEntries() {
    const kind = $("#admin-page-filter").value, rows = kind === "wheel" ? store.list(kind) : store.all(kind), list = $("#admin-entry-list");
    $("#admin-entry-count").textContent = `${labels[kind]} · ${rows.length} ${rows.length === 1 ? "entry" : "entries"}`; list.replaceChildren();
    if (!rows.length) { const empty = document.createElement("p"); empty.className = "admin-empty"; empty.textContent = "No entries on this page yet."; list.append(empty); return; }
    rows.forEach(row => {
      const article = document.createElement("article"); article.className = "admin-entry"; article.dataset.entryId = row.id;
      const content = document.createElement("div"), title = document.createElement("h3"); title.textContent = row.title; content.append(title);
      const details = [row.artist, row.display_name ? `by ${row.display_name}` : "", row.status !== "approved" ? row.status : ""].filter(Boolean);
      if (details.length) { const p = document.createElement("p"); p.textContent = details.join(" · "); content.append(p); }
      const button = document.createElement("button"); button.type = "button"; button.className = "admin-delete"; button.textContent = "Delete"; button.setAttribute("aria-label", `Delete ${row.title}`);
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await store.deleteEntry(row.id, kind === "wheel"); message("admin-entry-status", `Deleted “${row.title}”.`); }
        catch (error) { message("admin-entry-status", error.message, true); button.disabled = false; }
      });
      article.append(content, button); list.append(article);
    });
  }
  function renderTopics() {
    const setting = store.bingo; if (dirty || renderedRevision === setting.revision) return;
    const grid = $("#admin-bingo-topics"); grid.replaceChildren();
    setting.prompts.forEach((prompt, index) => {
      const label = document.createElement("label"); label.textContent = index === 12 ? "Middle space" : `Topic ${index + 1}`;
      const input = document.createElement("input"); input.name = `topic_${index}`; input.id = `admin-topic-${index}`; input.value = prompt; input.maxLength = 80; input.required = true; input.disabled = index === 12;
      label.append(input); grid.append(label);
    });
    renderedRevision = setting.revision;
  }
  function render() {
    const preview = store.mode === "preview", admin = store.isAdmin();
    $("#admin-mode-note").textContent = ["preview", "shared"].includes(store.mode) ? "" : store.mode === "loading" ? "" : "Admin access is temporarily unavailable.";
    $("#admin-mode-note").hidden = !$("#admin-mode-note").textContent;
    $("#admin-preview-access").hidden = !preview; $("#admin-email-form").hidden = store.mode !== "shared" || Boolean(store.user);
    $("#admin-login").hidden = admin; $("#admin-tools").hidden = !admin; $("#admin-signout").hidden = !(admin || store.user);
    if (store.error) message("admin-login-status", store.error, true);
    if (store.mode === "shared" && store.user && !admin) message("admin-login-status", "You’re signed in, but this account has not been given streamer or moderator access.");
    if (!admin) { $("#admin-entry-list").replaceChildren(); return; }
    $("#admin-identity").textContent = preview ? "Admin" : `${store.staffRole} · ${store.user.email}`;
    renderEntries(); renderTopics();
  }
  function init() {
    $("#admin-password-form").addEventListener("submit", async event => {
      event.preventDefault(); const button = $("#admin-preview-login"), field = $("#admin-password"); button.disabled = true;
      try { await store.enterPreviewAdmin(field.value); message("admin-login-status", ""); }
      catch (error) { message("admin-login-status", error.message, true); field.focus(); }
      finally { field.value = ""; button.disabled = false; }
    });
    $("#admin-email-form").addEventListener("submit", async event => {
      event.preventDefault(); const button = event.currentTarget.querySelector("button"); button.disabled = true;
      try { await store.signIn($("#admin-email").value.trim()); message("admin-login-status", "Check your email for the sign-in link."); }
      catch (error) { message("admin-login-status", error.message, true); }
      finally { button.disabled = false; }
    });
    $("#admin-signout").addEventListener("click", async () => { try { await store.signOut(); dirty = false; renderedRevision = -1; message("admin-login-status", "You’re signed out."); } catch (error) { message("admin-login-status", error.message, true); } });
    $("#admin-page-filter").addEventListener("change", () => { renderEntries(); message("admin-entry-status", ""); });
    $("#admin-bingo-topics").addEventListener("input", () => { dirty = true; });
    $("#admin-bingo-form").addEventListener("submit", async event => {
      event.preventDefault(); const button = $("#admin-save-bingo"); button.disabled = true;
      const prompts = Array.from({ length: 25 }, (_, index) => index === 12 ? "FREE 🐾" : $(`#admin-topic-${index}`).value.trim());
      try { await store.saveBingo(prompts, renderedRevision); dirty = false; renderedRevision = -1; render(); message("admin-bingo-status", "Bingo topics saved. The updated card is ready to play."); }
      catch (error) { message("admin-bingo-status", error.message, true); }
      finally { button.disabled = false; }
    });
  }
  window.TownAdmin = { init, render };
})();
