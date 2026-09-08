(() => {
  "use strict";
  const config = window.SNACK_CONFIG;
  const preview = !config.apiUrl.trim();
  const $ = (selector) => document.querySelector(selector);
  const gamesElement = $("#games");
  const dialog = $("#signup-dialog");
  const form = $("#signup-form");
  const previewKey = "team-snacks-preview-v1";
  let games = [];
  let filter = "all";
  let selectedGame = null;
  let pendingClaim = null;
  let saving = false;
  let loading = false;
  let revision = 0;
  let toastTimer;

  document.title = config.title;
  $("#page-title").textContent = config.title;
  $("#preview-notice").hidden = !preview;
  if (config.teamNote) {
    $("#team-note").textContent = config.teamNote;
    $("#team-note").hidden = false;
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function icon(name, size = 16) {
    const image = document.createElement("img");
    image.src = `assets/icons/${name}.svg`;
    image.alt = "";
    image.width = image.height = size;
    return image;
  }

  function gameDate(game) {
    return new Date(`${game.date}T12:00:00Z`);
  }

  function dateText(game, options) {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(gameDate(game));
  }

  function timeText(time) {
    const [hour, minute] = time.split(":").map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
  }

  function timeRange(game) {
    return `${timeText(game.startTime)}\u2013${timeText(game.endTime)}`;
  }

  function isPast(game) {
    // Compare calendar dates in the team's timezone, not the visitor's timezone.
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    return game.date < today;
  }

  function isOpen(game) {
    return !game.name && !isPast(game);
  }

  function showMessage(selector, message) {
    const element = $(selector);
    element.textContent = message;
    element.hidden = !message;
  }

  function toast(message) {
    clearTimeout(toastTimer);
    showMessage("#toast", message);
    toastTimer = setTimeout(() => showMessage("#toast", ""), 7000);
  }

  function render() {
    const covered = games.filter((game) => game.name).length;
    const open = games.filter(isOpen).length;
    $("#all-count").textContent = games.length;
    $("#open-count").textContent = open;
    $("#schedule-summary").textContent = `${covered} of ${games.length} games covered \u00b7 ${open} ${open === 1 ? "game needs" : "games need"} snacks`;
    $("#coverage-fill").style.width = `${games.length ? covered / games.length * 100 : 0}%`;
    $(".coverage").setAttribute("aria-valuemax", games.length);
    $(".coverage").setAttribute("aria-valuenow", covered);
    gamesElement.replaceChildren();
    const visible = games.filter((game) => filter === "all" || isOpen(game));
    if (!visible.length) {
      gamesElement.append(node("p", "empty-state", filter === "open" ? "No games need snacks right now. Thanks, team!" : "No games are scheduled yet."));
      return;
    }
    let currentMonth;
    let group;
    for (const game of visible) {
      const month = dateText(game, { month: "long" });
      if (month !== currentMonth) {
        currentMonth = month;
        group = node("section", "month-group");
        group.setAttribute("aria-label", month);
        group.append(node("h3", "month-label", month));
        gamesElement.append(group);
      }
      const row = node("article", "game");
      row.dataset.gameId = game.id;
      row.setAttribute("aria-label", dateText(game, { month: "long", day: "numeric" }));
      const date = node("div", "date-block");
      date.setAttribute("aria-hidden", "true");
      const shortMonth = dateText(game, { month: "short" });
      date.append(
        node("span", "date-month", shortMonth === "Sep" ? "Sept" : shortMonth),
        node("span", "date-day", dateText(game, { day: "numeric" })),
        node("span", "date-weekday", dateText(game, { weekday: "short" })),
      );
      const details = node("div", "game-details");
      details.append(node("p", "game-time", timeRange(game)));
      const signup = node("div", `signup-detail${game.name ? " claimed" : ""}`);
      const status = node("p", "signup-status");
      if (game.name) {
        status.append(icon("circle-check"), node("span", "", game.name));
        signup.append(status, node("p", "signup-note", game.note || "Snacks + drinks covered"));
      } else {
        status.append(node("span", "status-dot"), node("span", "", isPast(game) ? "Game completed" : "Snacks needed"));
        signup.append(status, node("p", "signup-note", isPast(game) ? "No family signed up" : "Snacks + drinks"));
      }
      row.append(date, details, signup);
      if (isOpen(game)) {
        const button = node("button", "signup-button");
        button.type = "button";
        button.setAttribute("aria-label", `Sign up for ${dateText(game, { month: "long", day: "numeric" })}`);
        button.append(icon("plus"), node("span", "", "Sign up"));
        button.addEventListener("click", () => openSignup(game));
        row.append(button);
      } else {
        const reserved = node("span", "reserved");
        reserved.append(icon(game.name ? "lock-keyhole" : "check", 13), node("span", "", game.name ? "Reserved" : "Past game"));
        row.append(reserved);
      }
      group.append(row);
    }
  }

  async function request(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const url = new URL(config.apiUrl);
      if (!payload) url.searchParams.set("t", Date.now());
      const response = await fetch(url, {
        method: payload ? "POST" : "GET",
        // A simple text/plain POST avoids a preflight that Apps Script cannot serve.
        ...(payload ? { headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(payload) } : {}),
        redirect: "follow",
        credentials: "omit",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("The schedule service is unavailable.");
      const data = await response.json();
      if (!data || typeof data.ok !== "boolean") throw new Error("Invalid schedule response.");
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function validateGames(value) {
    if (!Array.isArray(value) || value.some((game) => !game ||
      !["id", "date", "startTime", "endTime", "name", "note"].every((key) => typeof game[key] === "string") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(game.date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(game.startTime) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(game.endTime))) {
      throw new Error("Invalid schedule response.");
    }
    return value.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }

  function previewGames() {
    let claims = {};
    try { claims = JSON.parse(sessionStorage.getItem(previewKey) || "{}"); } catch { /* Preview also works without browser storage. */ }
    return window.PREVIEW_GAMES.map((game) => ({ ...game, name: "", note: "", ...(claims?.[game.id] || {}) }));
  }

  async function refresh(announce = false) {
    if (loading || saving) return;
    loading = true;
    const startRevision = revision;
    $("#refresh").disabled = true;
    gamesElement.setAttribute("aria-busy", "true");
    try {
      const data = preview ? { ok: true, games: previewGames() } : await request();
      if (!data.ok) throw new Error(data.message);
      if (startRevision !== revision) return;
      games = validateGames(data.games);
      render();
      showMessage("#schedule-message", "");
      if (announce) toast("Schedule refreshed.");
    } catch {
      showMessage("#schedule-message", "We couldn't refresh the schedule. Please check your connection and try again.");
      if (!games.length) {
        $("#schedule-summary").textContent = "Schedule unavailable";
        gamesElement.replaceChildren(node("p", "empty-state", "Game dates will appear when the schedule reconnects."));
        $("#all-count").textContent = "-";
      }
    } finally {
      loading = false;
      $("#refresh").disabled = false;
      gamesElement.setAttribute("aria-busy", "false");
    }
  }

  function openSignup(game) {
    selectedGame = game;
    pendingClaim = null;
    form.reset();
    showMessage("#form-message", "");
    $("#signup-game").textContent = `${dateText(game, { weekday: "long", month: "short", day: "numeric" })} \u00b7 ${timeRange(game)} ET`;
    $("#confirm-signup span").textContent = preview ? "Try a sample signup" : "Count me in";
    dialog.showModal();
    $("#family-name").focus();
  }

  function setSaving(value) {
    saving = value;
    for (const input of form.elements) input.disabled = value;
    $("#close-dialog").disabled = value;
    $("#refresh").disabled = value || loading;
    $("#confirm-signup span").textContent = value ? "Reserving your spot..." : preview ? "Try a sample signup" : "Count me in";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    const name = $("#family-name").value.trim();
    const note = $("#signup-note").value.trim();
    if (!name) {
      showMessage("#form-message", "Please enter your name or family name.");
      $("#family-name").focus();
      return;
    }
    // Keep the same request ID on retries if the response was lost after a write.
    if (!pendingClaim || pendingClaim.name !== name || pendingClaim.note !== note) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      const requestId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      pendingClaim = { action: "claim", gameId: selectedGame.id, name, note, requestId };
    }
    showMessage("#form-message", "");
    setSaving(true);
    try {
      let result;
      if (preview) {
        const game = games.find((entry) => entry.id === selectedGame.id);
        if (game.name) result = { ok: false, code: "TAKEN", game };
        else {
          Object.assign(game, { name, note });
          try {
            const claims = Object.fromEntries(games.filter((entry) => entry.name).map((entry) => [entry.id, { name: entry.name, note: entry.note }]));
            sessionStorage.setItem(previewKey, JSON.stringify(claims));
          } catch { /* Storage is optional in preview mode. */ }
          result = { ok: true, game };
        }
      } else result = await request(pendingClaim);
      if (result.game) {
        const [updated] = validateGames([result.game]);
        revision += 1;
        games = games.map((game) => game.id === updated.id ? updated : game);
        render();
      }
      if (!result.ok) {
        if (result.code === "TAKEN" || result.code === "PAST") {
          dialog.close();
          toast(result.code === "TAKEN" ? "Another family just reserved this game. Please choose another date." : "This game has already passed. Please choose another date.");
        } else showMessage("#form-message", result.message || "We couldn't reserve that spot. Please try again.");
        return;
      }
      if (!result.game) throw new Error("Missing saved signup.");
      dialog.close();
      toast(preview ? "Sample signup saved in this tab only." : `Thanks, ${name}! You're on snack duty for ${dateText(selectedGame, { month: "short", day: "numeric" })}.`);
    } catch {
      showMessage("#form-message", "We couldn't confirm your signup. Your spot may have been saved. Retry with the same name and note, or close this window and refresh the schedule.");
    } finally {
      setSaving(false);
    }
  });

  $("#close-dialog").addEventListener("click", () => { if (!saving) dialog.close(); });
  dialog.addEventListener("cancel", (event) => { if (saving) event.preventDefault(); });
  $("#refresh").addEventListener("click", () => refresh(true));
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((tab) => tab.setAttribute("aria-pressed", tab === button));
      if (games.length) render();
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !dialog.open) refresh();
  });
  refresh();
})();
