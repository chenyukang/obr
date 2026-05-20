const state = {
  view: "day",
  lastListView: "day",
  currentFile: "",
  currentContent: "",
  currentContentLoaded: false,
  currentHighlightKeyword: "",
  image: "",
  searchTimer: 0,
  searchController: null,
  searchRequestId: 0,
  pageController: null,
  pageRequestId: 0,
  passkeyRegistered: false,
  passwordLoginAllowed: true,
  connectionOnline: navigator.onLine,
  connectionPingController: null,
  connectionWindowFocused: true,
  entrySaving: false,
  entryImagePreparing: false,
  longPress: null,
  scrollTimer: 0,
  suppressLinkClickUntil: 0,
  suppressLinkElement: null,
  toastTimer: 0,
  viewScroll: {},
  syncingOutbox: false,
  historyReady: false,
  applyingHistory: false,
  updateWorker: null,
  refreshingForUpdate: false,
};

const el = (id) => document.getElementById(id);
const PAGE_EDITOR_LEAVE_MESSAGE =
  "You have unsaved page edits. Leave this page?";
const MAX_IMAGE_DATA_URL_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_DIMENSIONS = [1920, 1440, 1080];
const IMAGE_JPEG_QUALITIES = [0.82, 0.72, 0.62];
const LONG_PRESS_COPY_MS = 650;
const LONG_PRESS_MOVE_PX = 12;
const SCROLL_SAVE_MS = 160;
const TOAST_MS = 1800;
const PING_TIMEOUT_MS = 3000;
const RECENT_PAGE_LIMIT = 20;
const RECENT_PAGES_KEY = "obr.offline.recent-pages";
const OUTBOX_KEY = "obr.offline.outbox";
const CLIENT_ID_KEY = "obr.client-id";

const ICONS = {
  "arrow-left": '<path d="M19 12H5"></path><path d="m12 19-7-7 7-7"></path>',
  "book-open":
    '<path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path>',
  "calendar-days":
    '<path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path><path d="M8 18h.01"></path><path d="M12 18h.01"></path><path d="M16 18h.01"></path>',
  camera:
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"></path><circle cx="12" cy="13" r="3"></circle>',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"></path>',
  "list-checks":
    '<path d="m3 7 2 2 4-4"></path><path d="m3 17 2 2 4-4"></path><path d="M13 6h8"></path><path d="M13 12h8"></path><path d="M13 18h8"></path>',
  "log-in":
    '<path d="m10 17 5-5-5-5"></path><path d="M15 12H3"></path><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>',
  "log-out":
    '<path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>',
  key: '<path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-2.8-2.8L21 2"></path><path d="m15 5 4 4"></path><path d="m13 7 4 4"></path>',
  pencil:
    '<path d="M21.2 6.8a1 1 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8L2 21.4a.5.5 0 0 0 .6.6L7 20.7a2 2 0 0 0 .8-.5z"></path><path d="m15 5 4 4"></path>',
  plus: '<path d="M5 12h14"></path><path d="M12 5v14"></path>',
  "rotate-ccw":
    '<path d="M3 12a9 9 0 1 0 9-9 9.8 9.8 0 0 0-6.7 2.7L3 8"></path><path d="M3 3v5h5"></path>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M17 21v-7H7v7"></path><path d="M7 3v5h8"></path>',
  search:
    '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>',
  x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
};

document.addEventListener("DOMContentLoaded", async () => {
  installIcons();
  bindEvents();
  initializeAppHistory({ view: "day" });
  void registerServiceWorker();
  startConnectionMonitor();
  restoreDraft();
  updateEntrySaveState();
  const ok = await verify();
  if (ok) {
    showApp();
    showView("day", { updateHistory: false });
    void syncOutbox();
  } else if (canUseOfflineApp()) {
    showApp();
    await showOfflineStart();
  } else {
    await refreshAuthOptions();
    showLogin();
  }
});

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      await showView(button.dataset.view);
    });
  });
  el("logout-button").addEventListener("click", logout);
  el("passkey-login-button").addEventListener("click", passkeyLogin);
  el("passkey-register-button").addEventListener("click", registerPasskey);
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("popstate", handleAppPopState);
  window.addEventListener("scroll", handleWindowScroll, { passive: true });
  document.addEventListener("keydown", handleGlobalKeydown);
  el("update-banner").addEventListener("click", applyServiceWorkerUpdate);
  el("outbox-button").addEventListener("click", toggleOutboxPanel);
  el("outbox-close").addEventListener("click", hideOutboxPanel);
  el("outbox-retry").addEventListener("click", retryOutbox);
  el("outbox-list").addEventListener("click", handleOutboxListClick);
  installLongPressCopy(el("page-content"));
  installLongPressCopy(el("search-results"));

  el("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await login();
  });

  el("entry-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveEntry();
  });

  el("entry-reset").addEventListener("click", resetEntry);
  el("entry-text").addEventListener("input", handleEntryInput);
  el("entry-page").addEventListener("input", handleEntryInput);
  el("entry-links").addEventListener("input", handleEntryInput);
  el("entry-text").addEventListener("paste", handlePaste);
  el("entry-image-file").addEventListener("change", handleImageFile);
  el("entry-camera-file").addEventListener("change", handleImageFile);
  el("page-editor").addEventListener("input", handlePageEditorInput);

  el("search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    window.clearTimeout(state.searchTimer);
    await search();
  });
  el("search-input").addEventListener("input", () => {
    updateSearchClear();
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(search, 180);
  });
  el("search-input").addEventListener("keydown", async (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      await clearSearch();
    }
  });
  el("search-clear").addEventListener("click", clearSearch);

  el("search-results").addEventListener("click", async (event) => {
    const link = event.target.closest("a[id]");
    if (!link) return;
    event.preventDefault();
    await fetchPage(link.id, state.view, el("search-input").value.trim());
  });

  el("todo-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await addTodo();
  });

  el("todo-list").addEventListener("change", async (event) => {
    const task = event.target.closest("input[data-task-index]");
    if (!task || !task.checked) return;
    await markTodo(task.dataset.taskIndex);
    await loadTodo();
  });

  el("back-button").addEventListener("click", goBackToLastList);
  el("edit-button").addEventListener("click", toggleEdit);

  el("page-content").addEventListener("click", async (event) => {
    const task = event.target.closest("input[data-task-index]");
    if (task && state.currentFile === "Zero/todo.md") {
      await markTodo(task.dataset.taskIndex);
      await fetchPage("Zero/todo", "todo");
      return;
    }

    const wiki = event.target.closest("a[data-page]");
    if (wiki) {
      event.preventDefault();
      await fetchPage(wiki.dataset.page, state.lastListView);
    }
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    if (registration.waiting && navigator.serviceWorker.controller) {
      showServiceWorkerUpdate(registration.waiting);
    }
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          showServiceWorkerUpdate(worker);
        }
      });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (state.refreshingForUpdate) window.location.reload();
    });
  } catch (error) {
    console.error(error);
  }
}

function showServiceWorkerUpdate(worker) {
  state.updateWorker = worker;
  el("update-banner").hidden = false;
}

function applyServiceWorkerUpdate() {
  state.refreshingForUpdate = true;
  el("update-banner").hidden = true;
  state.updateWorker?.postMessage({ type: "SKIP_WAITING" });
  window.setTimeout(() => window.location.reload(), 800);
}

function initializeAppHistory(entry) {
  if (!window.history?.replaceState) return;
  state.historyReady = true;
  replaceAppHistory(entry);
}

function appHistoryState(entry) {
  return {
    obr: true,
    ...entry,
  };
}

function replaceAppHistory(entry) {
  if (!state.historyReady) return;
  window.history.replaceState(appHistoryState(entry), "", location.href);
}

function pushAppHistory(entry) {
  if (!state.historyReady || state.applyingHistory) return;
  const next = appHistoryState(entry);
  if (sameAppHistoryState(window.history.state, next)) return;
  window.history.pushState(next, "", location.href);
}

function sameAppHistoryState(left, right) {
  if (!left?.obr || !right?.obr) return false;
  return (
    left.view === right.view &&
    left.file === right.file &&
    left.sourceView === right.sourceView &&
    left.highlightKeyword === right.highlightKeyword
  );
}

function currentAppHistoryEntry() {
  if (state.view === "page") {
    return {
      view: "page",
      file: state.currentFile,
      sourceView: state.lastListView,
      highlightKeyword: state.currentHighlightKeyword,
    };
  }
  return { view: state.view };
}

async function handleAppPopState(event) {
  const target = event.state;
  if (!target?.obr) return;

  if (!prepareToLeavePageEditor()) {
    pushAppHistory(currentAppHistoryEntry());
    return;
  }

  state.applyingHistory = true;
  try {
    if (target.view === "page" && target.file) {
      await fetchPage(
        target.file,
        target.sourceView || state.lastListView,
        target.highlightKeyword || "",
        { updateHistory: false },
      );
      return;
    }
    await showView(target.view || "day", {
      focusSearch: false,
      updateHistory: false,
    });
  } finally {
    state.applyingHistory = false;
  }
}

function startConnectionMonitor() {
  state.connectionWindowFocused = document.hasFocus?.() ?? true;
  setConnectionStatus(navigator.onLine);
  window.addEventListener("online", () => resumeConnectionMonitor());
  window.addEventListener("offline", () => {
    pauseConnectionMonitor();
    setConnectionStatus(false);
  });
  window.addEventListener("focus", () => {
    state.connectionWindowFocused = true;
    resumeConnectionMonitor();
  });
  window.addEventListener("blur", () => {
    state.connectionWindowFocused = false;
    pauseConnectionMonitor();
  });
  window.addEventListener("pageshow", () => {
    state.connectionWindowFocused = true;
    resumeConnectionMonitor();
  });
  window.addEventListener("pagehide", () => {
    state.connectionWindowFocused = false;
    pauseConnectionMonitor();
  });
  document.addEventListener("freeze", () => {
    state.connectionWindowFocused = false;
    pauseConnectionMonitor();
  });
  document.addEventListener("resume", () => {
    state.connectionWindowFocused = true;
    resumeConnectionMonitor();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseConnectionMonitor();
      return;
    }
    resumeConnectionMonitor();
  });
  resumeConnectionMonitor();
}

function resumeConnectionMonitor() {
  if (!isForegroundPage()) return;
  void checkConnectivity({ sync: true });
}

function pauseConnectionMonitor() {
  abortConnectivityCheck();
}

function abortConnectivityCheck() {
  state.connectionPingController?.abort();
  state.connectionPingController = null;
}

async function checkConnectivity(options = {}) {
  if (!isForegroundPage() && !options.allowHidden) {
    return state.connectionOnline;
  }
  if (!navigator.onLine) {
    setConnectionStatus(false);
    return false;
  }

  const controller = new AbortController();
  state.connectionPingController = controller;
  const timeout = window.setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const response = await fetch(pingUrl(), {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    const online = response.ok;
    setConnectionStatus(online);
    if (online && options.sync) void syncOutbox();
    return online;
  } catch {
    if (!document.hidden) setConnectionStatus(false);
    return false;
  } finally {
    window.clearTimeout(timeout);
    if (state.connectionPingController === controller) {
      state.connectionPingController = null;
    }
  }
}

function isForegroundPage() {
  return !document.hidden && state.connectionWindowFocused;
}

function pingUrl() {
  const params = new URLSearchParams({
    ts: String(Date.now()),
    client: clientId(),
    visible: document.hidden ? "0" : "1",
    focused: state.connectionWindowFocused ? "1" : "0",
  });
  return `/api/ping?${params}`;
}

function clientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (id) return id;
  id = Math.random().toString(36).slice(2, 10);
  localStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

function setConnectionStatus(online) {
  state.connectionOnline = Boolean(online);
  const status = el("connection-status");
  const label = el("connection-label");
  if (!status || !label) return;

  status.classList.toggle("is-online", state.connectionOnline);
  status.classList.toggle("is-offline", !state.connectionOnline);
  updateConnectionStatusLabel();
}

function updateConnectionStatusLabel() {
  const status = el("connection-status");
  const label = el("connection-label");
  if (!status || !label) return;

  const pending = readOutbox().length;
  const base = state.connectionOnline ? "Online" : "Offline";
  const text = pending ? `${base} · ${pending} pending` : base;
  label.textContent = text;
  status.title = text;
  status.setAttribute("aria-label", text);
  updateOutboxButton(pending);
  if (!el("outbox-panel").hidden) renderOutboxPanel();
}

function canUseOfflineApp() {
  return !state.connectionOnline && readRecentPages().length > 0;
}

async function showOfflineStart() {
  const [recent] = readRecentPages();
  if (recent) {
    state.currentFile = recent.file;
    state.currentContent = pendingPageContent(recent.file) ?? recent.source ?? "";
    state.currentContentLoaded = Boolean(state.currentContent);
    showPage(
      recent.file,
      recent.html || offlineSourcePreview(state.currentContent),
      "find",
    );
    showToast("Offline copy.");
    return;
  }
  await showView("find");
}

function readRecentPages() {
  return readJson(RECENT_PAGES_KEY, []).filter((page) => page?.file);
}

function writeRecentPages(pages) {
  try {
    writeJson(RECENT_PAGES_KEY, pages.slice(0, RECENT_PAGE_LIMIT));
  } catch (error) {
    console.error(error);
    try {
      writeJson(RECENT_PAGES_KEY, pages.slice(0, 5));
    } catch (retryError) {
      console.error(retryError);
    }
  }
}

function rememberPage(data, requestedPath = "", source = null) {
  if (!data?.file || data.file === "NoPage") return;
  const pages = readRecentPages();
  const aliases = pageAliases(data.file, requestedPath);
  const existing = pages.find((page) => page.file === data.file);
  const next = {
    file: data.file,
    html: data.html ?? existing?.html ?? "",
    source: source ?? existing?.source ?? "",
    aliases: uniqueStrings([...(existing?.aliases || []), ...aliases]),
    savedAt: Date.now(),
  };
  writeRecentPages([
    next,
    ...pages.filter((page) => page.file !== data.file),
  ]);
}

function rememberPageSource(file, source) {
  if (!file || file === "NoPage") return;
  const pages = readRecentPages();
  const index = pages.findIndex((page) => page.file === file);
  if (index === -1) {
    writeRecentPages([
      {
        file,
        html: "",
        source,
        aliases: pageAliases(file),
        savedAt: Date.now(),
      },
      ...pages,
    ]);
    return;
  }
  pages[index] = {
    ...pages[index],
    source,
    savedAt: Date.now(),
  };
  writeRecentPages(pages);
}

function findCachedPage(path) {
  const needle = normalizePageAlias(path);
  return readRecentPages().find((page) =>
    pageAliases(page.file, ...(page.aliases || [])).some(
      (alias) => normalizePageAlias(alias) === needle,
    ),
  );
}

function cachedPageSource(file) {
  return findCachedPage(file)?.source || "";
}

function pageAliases(file, ...extra) {
  const aliases = [file, ...extra].filter(Boolean);
  if (file.endsWith(".md")) aliases.push(file.slice(0, -3));
  return uniqueStrings(aliases.map(normalizePageAlias));
}

function normalizePageAlias(path) {
  return String(path || "").replace(/^\/+/, "").replace(/\.md$/, "");
}

function renderCachedSearchResults(keyword = "") {
  const needle = keyword.trim().toLowerCase();
  const pages = readRecentPages().filter((page) => {
    if (!needle) return true;
    return page.file.toLowerCase().includes(needle);
  });
  if (!pages.length) {
    el("search-results").innerHTML =
      '<p class="empty">No offline pages cached.</p>';
    return;
  }
  const items = pages
    .map(
      (page) =>
        `<li><a id="${escapeHtmlAttr(page.file)}" href="#">${escapeHtml(page.file)}</a></li>`,
    )
    .join("");
  el("search-results").innerHTML = `<p class="offline-note">Offline recent pages</p><ul>${items}</ul>`;
}

function readOutbox() {
  return readJson(OUTBOX_KEY, []).filter((item) => item?.id && item?.type);
}

function writeOutbox(items) {
  writeJson(OUTBOX_KEY, items);
  updateConnectionStatusLabel();
}

function queueOfflineMutation(type, payload) {
  const items = readOutbox();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const item = { id, type, payload, createdAt: Date.now(), error: "" };
  if (type === "page") {
    const filtered = items.filter(
      (existing) =>
        existing.type !== "page" || existing.payload.file !== payload.file,
    );
    writeOutbox([...filtered, item]);
    return;
  }
  writeOutbox([...items, item]);
}

function pendingPageContent(file) {
  const item = [...readOutbox()]
    .reverse()
    .find((queued) => queued.type === "page" && queued.payload.file === file);
  return item?.payload.content ?? null;
}

async function syncOutbox() {
  if (state.syncingOutbox || !state.connectionOnline) return;
  let items = readOutbox();
  if (!items.length) return;

  state.syncingOutbox = true;
  updateConnectionStatusLabel();
  const remaining = [];
  try {
    for (const item of items) {
      try {
        await syncOutboxItem(item);
      } catch (error) {
        console.error(error);
        remaining.push(
          { ...item, error: errorMessage(error) },
          ...items.slice(items.indexOf(item) + 1),
        );
        break;
      }
    }
  } finally {
    state.syncingOutbox = false;
    writeOutbox(remaining);
  }
}

function updateOutboxButton(pending = readOutbox().length) {
  const button = el("outbox-button");
  if (!button) return;
  button.hidden = pending === 0;
  setButtonIcon(button, "list-checks", String(pending));
  const label = `${pending} pending sync ${pending === 1 ? "item" : "items"}`;
  button.title = label;
  button.setAttribute("aria-label", label);
}

function toggleOutboxPanel() {
  const panel = el("outbox-panel");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) renderOutboxPanel();
}

function hideOutboxPanel() {
  el("outbox-panel").hidden = true;
}

async function retryOutbox() {
  renderOutboxPanel();
  if (!readOutbox().length) return;
  showToast("Retrying sync.");
  const online = await checkConnectivity({ sync: true, allowHidden: true });
  if (!online) showToast("Still offline.");
  renderOutboxPanel();
}

function handleOutboxListClick(event) {
  const button = event.target.closest("button[data-outbox-delete]");
  if (!button) return;
  const id = button.dataset.outboxDelete;
  writeOutbox(readOutbox().filter((item) => item.id !== id));
  renderOutboxPanel();
  showToast("Removed pending item.");
}

function renderOutboxPanel() {
  const items = readOutbox();
  el("outbox-count").textContent = `${items.length} pending`;
  el("outbox-retry").disabled = !items.length || state.syncingOutbox;
  if (!items.length) {
    el("outbox-list").innerHTML = '<p class="empty">Nothing waiting to sync.</p>';
    return;
  }
  el("outbox-list").innerHTML = items.map(outboxItemHtml).join("");
}

function outboxItemHtml(item) {
  const title = item.type === "page" ? "Page edit" : "Memo";
  const detail = outboxItemDetail(item);
  const error = item.error
    ? `<p class="outbox-item-error">${escapeHtml(item.error)}</p>`
    : "";
  return `
    <article class="outbox-item">
      <div class="outbox-item-title">
        <span>${escapeHtml(title)}</span>
        <span>${escapeHtml(formatTime(item.createdAt))}</span>
      </div>
      <p class="outbox-item-detail">${escapeHtml(detail)}</p>
      ${error}
      <button type="button" data-outbox-delete="${escapeHtmlAttr(item.id)}">${iconSvg("x")}<span>Delete</span></button>
    </article>
  `;
}

function outboxItemDetail(item) {
  if (item.type === "page") {
    return item.payload?.file || "Untitled page";
  }
  const page = item.payload?.page?.trim() || "Daily";
  const text = firstLine(item.payload?.text || "");
  const image = item.payload?.image ? " + image" : "";
  return text ? `${page}: ${text}${image}` : `${page}${image}`;
}

function firstLine(value) {
  return String(value).trim().split(/\r?\n/, 1)[0].slice(0, 120);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(error) {
  return error?.message || String(error || "Sync failed.");
}

async function syncOutboxItem(item) {
  if (item.type === "entry") {
    const response = await request("/api/entry", {
      method: "POST",
      body: JSON.stringify(item.payload),
    });
    const text = await response.text();
    if (text !== "ok") throw new Error(text);
    showToast("Offline entry synced.");
    if (item.payload.page === "todo" && state.view === "todo") {
      await loadTodo();
    }
    return;
  }

  if (item.type === "page") {
    const response = await request("/api/page", {
      method: "POST",
      body: JSON.stringify(item.payload),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    rememberPage(data, item.payload.file, item.payload.content);
    if (state.currentFile === data.file) {
      state.currentContent = item.payload.content;
      state.currentContentLoaded = true;
      if (el("page-editor").value === item.payload.content) {
        clearPageDraft(data.file);
      }
      if (el("page-editor").hidden) {
        el("page-content").innerHTML = data.html || "";
        highlightPageContent(state.currentHighlightKeyword);
      }
      setPageEditorStatus("");
    }
    showToast("Offline page synced.");
    return;
  }

  throw new Error(`Unknown offline item: ${item.type}`);
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(error);
    throw new Error("Local offline storage is full.");
  }
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function shouldQueueOffline(error) {
  return (
    !state.connectionOnline ||
    error instanceof TypeError ||
    error?.name === "AbortError"
  );
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function offlineSourcePreview(source) {
  if (!source) return '<p class="empty">Offline copy has no source cached.</p>';
  return `<p class="offline-note">Offline draft queued. Rendered view updates after sync.</p><pre class="offline-source-preview">${escapeHtml(source)}</pre>`;
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    setConnectionStatus(response.headers.get("x-obr-offline-cache") !== "1");
  } catch (error) {
    if (error?.name !== "AbortError") setConnectionStatus(false);
    throw error;
  }
  if (response.status === 401) {
    await refreshAuthOptions();
    showLogin();
    throw new Error("unauthorized");
  }
  return response;
}

async function verify() {
  try {
    const response = await fetch("/api/verify", {
      cache: "no-store",
      credentials: "same-origin",
    });
    setConnectionStatus(true);
    return response.ok;
  } catch {
    setConnectionStatus(false);
    return false;
  }
}

async function fetchPasskeyAvailability() {
  try {
    const options = await fetchAuthOptions();
    return options.passkeyRegistered;
  } catch {
    return false;
  }
}

async function refreshAuthOptions() {
  const options = await fetchAuthOptions();
  state.passkeyRegistered = options.passkeyRegistered;
  state.passwordLoginAllowed = options.passwordLoginAllowed;
}

async function fetchAuthOptions() {
  try {
    const response = await fetch("/api/auth/options", {
      credentials: "same-origin",
    });
    setConnectionStatus(true);
    if (!response.ok) throw new Error(await response.text());
    const options = await response.json();
    return {
      passkeyRegistered: Boolean(options.passkey_registered),
      passwordLoginAllowed: Boolean(options.password_login_allowed),
    };
  } catch (error) {
    console.error(error);
    if (error instanceof TypeError) setConnectionStatus(false);
    const passkeyRegistered = await fetchLegacyPasskeyAvailability();
    return {
      passkeyRegistered,
      passwordLoginAllowed: !passkeyRegistered || isLocalBrowserHost(),
    };
  }
}

async function fetchLegacyPasskeyAvailability() {
  try {
    const response = await fetch("/api/passkey/available", {
      credentials: "same-origin",
    });
    setConnectionStatus(true);
    if (!response.ok) return false;
    const status = await response.json();
    return Boolean(status.registered);
  } catch (error) {
    if (error instanceof TypeError) setConnectionStatus(false);
    return false;
  }
}

function isLocalBrowserHost() {
  return (
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "[::1]" ||
    location.hostname === "::1"
  );
}

async function login() {
  el("login-error").hidden = true;
  let response;
  try {
    response = await fetch("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: el("username").value,
        password: el("password").value,
      }),
    });
    setConnectionStatus(true);
  } catch {
    setConnectionStatus(false);
    setLoginError("Offline. Recent pages are still available on this device.");
    return;
  }
  if (!response.ok) {
    el("login-error").hidden = false;
    return;
  }
  el("password").value = "";
  showApp();
  replaceAppHistory({ view: "day" });
  showView("day", { updateHistory: false });
}

async function passkeyLogin() {
  try {
    if (!window.PublicKeyCredential)
      throw new Error("This browser does not support passkeys.");
    setLoginError("Touch your passkey to log in.", false);
    const start = await fetch("/api/passkey/login/start", {
      method: "POST",
      credentials: "same-origin",
    });
    if (!start.ok) throw new Error(await start.text());
    const requestOptions = await start.json();
    requestOptions.publicKey.challenge = base64urlToUint8Array(
      requestOptions.publicKey.challenge,
    );
    requestOptions.publicKey.allowCredentials?.forEach((credential) => {
      credential.id = base64urlToUint8Array(credential.id);
    });

    const assertion = await navigator.credentials.get({
      publicKey: requestOptions.publicKey,
    });
    const finish = await fetch("/api/passkey/login/finish", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: assertion.id,
        rawId: uint8ArrayToBase64url(new Uint8Array(assertion.rawId)),
        type: assertion.type,
        response: {
          authenticatorData: uint8ArrayToBase64url(
            new Uint8Array(assertion.response.authenticatorData),
          ),
          clientDataJSON: uint8ArrayToBase64url(
            new Uint8Array(assertion.response.clientDataJSON),
          ),
          signature: uint8ArrayToBase64url(
            new Uint8Array(assertion.response.signature),
          ),
          userHandle: assertion.response.userHandle
            ? uint8ArrayToBase64url(
                new Uint8Array(assertion.response.userHandle),
              )
            : null,
        },
      }),
    });
    if (!finish.ok) throw new Error(await finish.text());
    state.passkeyRegistered = true;
    setLoginError("", true);
    showApp();
    replaceAppHistory({ view: "day" });
    showView("day", { updateHistory: false });
  } catch (error) {
    console.error(error);
    setLoginError(error.message || "Passkey login failed.");
  }
}

async function registerPasskey() {
  try {
    if (!window.PublicKeyCredential)
      throw new Error("This browser does not support passkeys.");
    const start = await request("/api/passkey/register/start", {
      method: "POST",
    });
    if (!start.ok) throw new Error(await start.text());
    const creationOptions = await start.json();
    creationOptions.publicKey.challenge = base64urlToUint8Array(
      creationOptions.publicKey.challenge,
    );
    creationOptions.publicKey.user.id = base64urlToUint8Array(
      creationOptions.publicKey.user.id,
    );
    creationOptions.publicKey.excludeCredentials?.forEach((credential) => {
      credential.id = base64urlToUint8Array(credential.id);
    });

    const credential = await navigator.credentials.create({
      publicKey: creationOptions.publicKey,
    });
    const finish = await request("/api/passkey/register/finish", {
      method: "POST",
      body: JSON.stringify({
        id: credential.id,
        rawId: uint8ArrayToBase64url(new Uint8Array(credential.rawId)),
        type: credential.type,
        response: {
          attestationObject: uint8ArrayToBase64url(
            new Uint8Array(credential.response.attestationObject),
          ),
          clientDataJSON: uint8ArrayToBase64url(
            new Uint8Array(credential.response.clientDataJSON),
          ),
        },
      }),
    });
    if (!finish.ok) throw new Error(await finish.text());
    state.passkeyRegistered = true;
    el("passkey-register-button").hidden = true;
    alert("Passkey registered.");
  } catch (error) {
    console.error(error);
    alert(error.message || "Passkey registration failed.");
  }
}

function setLoginError(message, hidden = false) {
  el("login-error").textContent = message || "Login failed.";
  el("login-error").hidden = hidden;
}

function base64urlToUint8Array(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function logout() {
  if (!prepareToLeavePageEditor()) return;
  await fetch("/api/logout", {
    method: "POST",
    credentials: "same-origin",
  });
  showLogin();
}

function showLogin() {
  const showPasswordLogin = !state.passkeyRegistered || state.passwordLoginAllowed;
  el("app").hidden = true;
  el("login").hidden = false;
  el("login-form").classList.toggle(
    "passkey-login-only",
    state.passkeyRegistered && !showPasswordLogin,
  );
  el("password-login-fields").hidden = !showPasswordLogin;
  el("passkey-login-button").hidden = !state.passkeyRegistered;
  el("password").value = "";
  setLoginError("", true);
}

function showApp() {
  el("login").hidden = true;
  el("app").hidden = false;
  refreshPasskeyRegisterButton();
}

async function refreshPasskeyRegisterButton() {
  try {
    const response = await request("/api/passkey/status");
    const status = await response.json();
    state.passkeyRegistered = Boolean(status.registered);
    el("passkey-register-button").hidden = Boolean(status.registered);
  } catch (error) {
    console.error(error);
    el("passkey-register-button").hidden = true;
  }
}

async function showView(name, options = {}) {
  if (!prepareToLeavePageEditor()) return;
  const { focusSearch = true, restoreScroll = true, updateHistory = true } = options;
  saveCurrentScrollPosition();
  state.view = name;
  for (const view of document.querySelectorAll(".view")) {
    view.hidden = true;
  }
  if (name === "todo") {
    state.lastListView = "todo";
    el("todo-view").hidden = false;
    await loadTodo();
    if (restoreScroll) restoreViewScroll("todo");
    if (updateHistory) pushAppHistory({ view: "todo" });
    return;
  }
  if (name === "find") {
    state.lastListView = "find";
    el("find-view").hidden = false;
    updateSearchClear();
    if (!el("search-results").innerHTML.trim()) {
      await search();
    }
    if (focusSearch && getViewScroll("find") < 80) {
      focusSearchInput();
    }
    if (restoreScroll) restoreViewScroll("find");
    if (updateHistory) pushAppHistory({ view: "find" });
    return;
  }
  el("day-view").hidden = false;
  if (restoreScroll) restoreViewScroll("day");
  if (updateHistory) pushAppHistory({ view: "day" });
}

async function saveEntry() {
  if (!hasEntryContent()) {
    setEntryStatus("Empty post cannot be saved.");
    updateEntrySaveState();
    return;
  }
  const payload = {
    page: el("entry-page").value,
    links: el("entry-links").value,
    text: el("entry-text").value,
    image: state.image,
  };
  setEntrySaving(true);
  setEntryStatus("Saving...");
  try {
    const response = await request("/api/entry", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (text !== "ok") throw new Error(text);
    resetEntry();
    setEntryStatus("Saved.");
    showToast("Saved.");
  } catch (error) {
    console.error(error);
    if (shouldQueueOffline(error)) {
      try {
        queueOfflineMutation("entry", payload);
        resetEntry();
        setEntryStatus("Saved offline. Will sync when online.");
        showToast("Saved offline.");
        return;
      } catch (queueError) {
        console.error(queueError);
        setEntryStatus(queueError.message || "Could not save offline.");
        return;
      }
    }
    const message = error.message ? `Save failed: ${error.message}` : "Save failed.";
    setEntryStatus(message);
  } finally {
    setEntrySaving(false);
  }
}

function hasEntryContent() {
  return Boolean(
    el("entry-text").value.trim() ||
    el("entry-page").value.trim() ||
    el("entry-links").value.trim() ||
    state.image,
  );
}

function updateEntrySaveState() {
  el("entry-save").disabled =
    state.entrySaving || state.entryImagePreparing || !hasEntryContent();
  setButtonIcon(el("entry-save"), "save", state.entrySaving ? "Saving..." : "Save");
}

function handleEntryInput() {
  persistDraft();
  updateEntrySaveState();
}

function setEntryStatus(message) {
  el("entry-status").textContent = message;
  el("entry-status").hidden = false;
}

function resetEntry() {
  el("entry-text").value = "";
  el("entry-page").value = "";
  el("entry-links").value = "";
  el("entry-image-file").value = "";
  el("entry-camera-file").value = "";
  state.image = "";
  el("entry-preview").hidden = true;
  localStorage.removeItem("obr.entry.text");
  localStorage.removeItem("obr.entry.page");
  localStorage.removeItem("obr.entry.links");
  updateEntrySaveState();
}

function persistDraft() {
  localStorage.setItem("obr.entry.text", el("entry-text").value);
  localStorage.setItem("obr.entry.page", el("entry-page").value);
  localStorage.setItem("obr.entry.links", el("entry-links").value);
}

function restoreDraft() {
  el("entry-text").value = localStorage.getItem("obr.entry.text") || "";
  el("entry-page").value = localStorage.getItem("obr.entry.page") || "";
  el("entry-links").value = localStorage.getItem("obr.entry.links") || "";
  updateEntrySaveState();
}

function handlePaste(event) {
  const items = event.clipboardData?.items || [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      void readImage(item.getAsFile());
      break;
    }
  }
}

function handleImageFile(event) {
  const file = event.target.files[0];
  if (file) void readImage(file);
}

async function readImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  state.image = "";
  state.entryImagePreparing = true;
  el("entry-preview").hidden = true;
  updateEntrySaveState();
  setEntryStatus("Preparing image...");
  try {
    state.image = await prepareImage(file);
    el("entry-preview").src = state.image;
    el("entry-preview").hidden = false;
    updateEntrySaveState();
    setEntryStatus("Image ready.");
  } catch (error) {
    console.error(error);
    state.image = "";
    el("entry-preview").hidden = true;
    updateEntrySaveState();
    setEntryStatus(error.message || "Could not prepare image.");
  } finally {
    state.entryImagePreparing = false;
    updateEntrySaveState();
  }
}

async function prepareImage(file) {
  const dataUrl = await readFileAsDataUrl(file);
  if (file.type === "image/gif") {
    if (dataUrl.length > MAX_IMAGE_DATA_URL_BYTES) {
      throw new Error("GIF is too large to upload.");
    }
    return dataUrl;
  }

  const image = await loadImage(dataUrl);
  for (const maxDimension of MAX_IMAGE_DIMENSIONS) {
    const { width, height } = scaledDimensions(
      image.naturalWidth,
      image.naturalHeight,
      maxDimension,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not process image.");
    context.drawImage(image, 0, 0, width, height);

    for (const quality of IMAGE_JPEG_QUALITIES) {
      const compressed = canvas.toDataURL("image/jpeg", quality);
      if (compressed.length <= MAX_IMAGE_DATA_URL_BYTES) {
        return compressed;
      }
    }
  }

  throw new Error("Image is too large after compression.");
}

function scaledDimensions(width, height, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("This image format cannot be processed."));
    image.src = dataUrl;
  });
}

function setEntrySaving(saving) {
  state.entrySaving = saving;
  updateEntrySaveState();
}

async function search() {
  const keyword = el("search-input").value.trim();
  updateSearchClear();
  state.searchController?.abort();
  const requestId = state.searchRequestId + 1;
  state.searchRequestId = requestId;
  const controller = new AbortController();
  state.searchController = controller;
  try {
    const response = await request(
      `/api/search?keyword=${encodeURIComponent(keyword)}`,
      { signal: controller.signal },
    );
    const html = await response.text();
    if (requestId !== state.searchRequestId) return;
    el("search-results").innerHTML = `<ul>${html}</ul>`;
  } catch (error) {
    if (error?.name === "AbortError" || requestId !== state.searchRequestId) return;
    console.error(error);
    if (shouldQueueOffline(error)) {
      renderCachedSearchResults(keyword);
      return;
    }
    el("search-results").innerHTML = '<p class="empty">Search failed.</p>';
  } finally {
    if (state.searchController === controller) state.searchController = null;
  }
}

async function clearSearch() {
  window.clearTimeout(state.searchTimer);
  if (!el("search-input").value) return;
  el("search-input").value = "";
  updateSearchClear();
  await search();
  el("search-input").focus();
}

function updateSearchClear() {
  el("search-clear").hidden = !el("search-input").value;
}

function focusSearchInput(options = {}) {
  window.requestAnimationFrame(() => {
    const input = el("search-input");
    input.focus({ preventScroll: true });
    if (options.select) input.select();
  });
}

async function loadTodo() {
  try {
    const response = await request("/api/page?path=Zero%2Ftodo");
    const data = await response.json();
    if (data.file !== "NoPage") {
      rememberPage(data, "Zero/todo");
      void warmPageSource(data.file);
    }
    const html = data.file === "NoPage" ? "" : data.html || "";
    el("todo-list").innerHTML = html.trim()
      ? html
      : '<p class="empty">No todos.</p>';
  } catch (error) {
    console.error(error);
    const cached = findCachedPage("Zero/todo");
    const html = cached?.html || "";
    el("todo-list").innerHTML = html.trim()
      ? html
      : '<p class="empty">No offline todo cache.</p>';
  }
}

async function addTodo() {
  const text = el("todo-input").value.trim();
  if (!text) return;
  const payload = {
    page: "todo",
    links: "",
    text,
    image: "",
  };
  el("todo-status").textContent = "Saving...";
  el("todo-status").hidden = false;
  try {
    const response = await request("/api/entry", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const result = await response.text();
    if (result !== "ok") throw new Error(result);
    el("todo-input").value = "";
    el("todo-status").hidden = true;
    showToast("Todo saved.");
    await loadTodo();
  } catch (error) {
    console.error(error);
    if (shouldQueueOffline(error)) {
      try {
        queueOfflineMutation("entry", payload);
        el("todo-input").value = "";
        el("todo-status").textContent = "Saved offline. Will sync when online.";
        showToast("Todo saved offline.");
        return;
      } catch (queueError) {
        console.error(queueError);
      }
    }
    el("todo-status").textContent = "Save failed.";
  }
}

async function fetchPage(
  path,
  sourceView = state.view,
  highlightKeyword = "",
  options = {},
) {
  if (!prepareToLeavePageEditor()) return;
  const { updateHistory = true } = options;
  state.pageController?.abort();
  const requestId = state.pageRequestId + 1;
  state.pageRequestId = requestId;
  const controller = new AbortController();
  state.pageController = controller;
  let data;
  try {
    const response = await request(`/api/page?path=${encodeURIComponent(path)}`, {
      signal: controller.signal,
    });
    data = await response.json();
    if (requestId !== state.pageRequestId) return;
    if (data.file !== "NoPage") {
      rememberPage(data, path);
      void warmPageSource(data.file);
    }
  } catch (error) {
    if (error?.name === "AbortError" || requestId !== state.pageRequestId) return;
    console.error(error);
    const cached = findCachedPage(path);
    if (!cached) {
      showToast("No offline copy.");
      return;
    }
    data = cached;
    showToast("Offline copy.");
  } finally {
    if (state.pageController === controller) state.pageController = null;
  }
  if (requestId !== state.pageRequestId) return;
  const file = data.file;
  state.currentHighlightKeyword = highlightKeyword.trim();
  if (file === "NoPage") {
    state.currentFile = path.endsWith(".md") ? path : `${path}.md`;
    state.currentContent = "";
    state.currentContentLoaded = true;
    showPage("NoPage", "No page yet.", sourceView, { updateHistory });
    return;
  }
  state.currentFile = file;
  state.currentContent = pendingPageContent(file) ?? data.source ?? "";
  state.currentContentLoaded = Boolean(state.currentContent);
  const html = data.html || offlineSourcePreview(state.currentContent);
  showPage(file, html, sourceView, { updateHistory });
}

function showPage(title, html, sourceView, options = {}) {
  const { updateHistory = true } = options;
  saveCurrentScrollPosition();
  if (sourceView === "todo" || sourceView === "find") {
    state.lastListView = sourceView;
  } else if (state.lastListView !== "todo") {
    state.lastListView = "find";
  }
  state.view = "page";
  for (const view of document.querySelectorAll(".view")) {
    view.hidden = true;
  }
  el("page-title").textContent = title;
  el("page-content").innerHTML = html;
  highlightPageContent(state.currentHighlightKeyword);
  el("page-content").hidden = false;
  el("page-editor").hidden = true;
  setPageEditorStatus("");
  setButtonIcon(el("edit-button"), "pencil", "Edit");
  el("page-view").hidden = false;
  if (title === "NoPage") {
    window.scrollTo(0, 0);
  } else {
    restoreReadingPosition(state.currentFile);
  }
  if (updateHistory) {
    pushAppHistory({
      view: "page",
      file: state.currentFile || title,
      sourceView: state.lastListView,
      highlightKeyword: state.currentHighlightKeyword,
    });
  }
}

async function toggleEdit() {
  const editor = el("page-editor");
  const content = el("page-content");
  const button = el("edit-button");
  if (editor.hidden) {
    setPageEditorStatus("Loading source...");
    button.disabled = true;
    try {
      await loadCurrentPageSource();
    } catch (error) {
      console.error(error);
      const message = error.message
        ? `Could not load source: ${error.message}`
        : "Could not load source.";
      setPageEditorStatus(message);
      button.disabled = false;
      return;
    }
    button.disabled = false;
    const draft = loadPageDraft(state.currentFile);
    editor.value = draft ?? state.currentContent;
    editor.hidden = false;
    content.hidden = true;
    setPageEditorStatus(draft === null ? "" : "Draft restored.");
    setButtonIcon(button, "save", "Save");
    return;
  }
  setPageEditorStatus("Saving...");
  button.disabled = true;
  setButtonIcon(button, "save", "Saving...");
  const payload = {
    file: state.currentFile,
    content: editor.value,
  };
  try {
    const response = await request("/api/page", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    state.currentContent = editor.value;
    state.currentContentLoaded = true;
    state.currentFile = data.file || state.currentFile;
    replaceAppHistory(currentAppHistoryEntry());
    clearPageDraft(state.currentFile);
    content.innerHTML = data.html || "";
    highlightPageContent(state.currentHighlightKeyword);
    editor.hidden = true;
    content.hidden = false;
    setPageEditorStatus("Saved.");
    showToast("Page saved.");
    setButtonIcon(button, "pencil", "Edit");
  } catch (error) {
    console.error(error);
    if (shouldQueueOffline(error)) {
      try {
        queueOfflineMutation("page", payload);
        state.currentContent = payload.content;
        state.currentContentLoaded = true;
        replaceAppHistory(currentAppHistoryEntry());
        clearPageDraft(state.currentFile);
        rememberPageSource(state.currentFile, payload.content);
        content.innerHTML = offlineSourcePreview(payload.content);
        editor.hidden = true;
        content.hidden = false;
        setPageEditorStatus("Saved offline. Will sync when online.");
        showToast("Saved offline.");
        setButtonIcon(button, "pencil", "Edit");
        return;
      } catch (queueError) {
        console.error(queueError);
        setPageEditorStatus(queueError.message || "Could not save offline.");
        setButtonIcon(button, "save", "Save");
        return;
      }
    }
    const message = error.message ? `Save failed: ${error.message}` : "Save failed.";
    setPageEditorStatus(message);
    setButtonIcon(button, "save", "Save");
  } finally {
    button.disabled = false;
  }
}

async function loadCurrentPageSource() {
  if (state.currentContentLoaded) return;
  const pending = pendingPageContent(state.currentFile);
  if (pending !== null) {
    state.currentContent = pending;
    state.currentContentLoaded = true;
    return;
  }
  const cached = cachedPageSource(state.currentFile);
  if (cached) {
    state.currentContent = cached;
    state.currentContentLoaded = true;
    return;
  }
  const response = await request(
    `/api/page/source?path=${encodeURIComponent(state.currentFile)}`,
  );
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  if (data.file === "NoPage") {
    state.currentContent = "";
    state.currentContentLoaded = true;
    return;
  }
  state.currentFile = data.file;
  state.currentContent = data.content || "";
  state.currentContentLoaded = true;
  rememberPageSource(state.currentFile, state.currentContent);
}

async function warmPageSource(file) {
  if (!file || cachedPageSource(file) || pendingPageContent(file) !== null) return;
  try {
    const response = await request(
      `/api/page/source?path=${encodeURIComponent(file)}`,
    );
    if (!response.ok) return;
    const data = await response.json();
    if (data.file !== "NoPage") rememberPageSource(data.file, data.content || "");
  } catch {
    // Best effort only.
  }
}

function handlePageEditorInput() {
  persistPageDraft();
  setPageEditorStatus(hasUnsavedPageEdit() ? "Unsaved draft." : "");
}

function handleBeforeUnload(event) {
  saveCurrentScrollPosition();
  pauseConnectionMonitor();
  if (!hasUnsavedPageEdit()) return;
  event.preventDefault();
  event.returnValue = "";
}

function prepareToLeavePageEditor() {
  if (!confirmDiscardUnsavedPageEdit()) return false;
  closePageEditor();
  return true;
}

function confirmDiscardUnsavedPageEdit() {
  return !hasUnsavedPageEdit() || window.confirm(PAGE_EDITOR_LEAVE_MESSAGE);
}

function hasUnsavedPageEdit() {
  const editor = el("page-editor");
  return !editor.hidden && editor.value !== state.currentContent;
}

function closePageEditor() {
  const editor = el("page-editor");
  if (editor.hidden) return;
  editor.hidden = true;
  el("page-content").hidden = false;
  setButtonIcon(el("edit-button"), "pencil", "Edit");
  setPageEditorStatus("");
}

function persistPageDraft() {
  if (!state.currentFile) return;
  const editor = el("page-editor");
  if (editor.value === state.currentContent) {
    clearPageDraft(state.currentFile);
    return;
  }
  localStorage.setItem(pageDraftKey(state.currentFile), editor.value);
}

function loadPageDraft(file) {
  if (!file) return null;
  const draft = localStorage.getItem(pageDraftKey(file));
  if (draft === null || draft === state.currentContent) return null;
  return draft;
}

function clearPageDraft(file) {
  if (!file) return;
  localStorage.removeItem(pageDraftKey(file));
}

function pageDraftKey(file) {
  return `obr.page-draft.${encodeURIComponent(file)}`;
}

function setPageEditorStatus(message) {
  el("page-editor-status").textContent = message;
  el("page-editor-status").hidden = !message;
}

function handleWindowScroll() {
  window.clearTimeout(state.scrollTimer);
  state.scrollTimer = window.setTimeout(saveCurrentScrollPosition, SCROLL_SAVE_MS);
}

function saveCurrentScrollPosition() {
  if (state.view === "page") {
    saveReadingPosition();
  } else {
    saveViewScroll(state.view);
  }
}

function saveViewScroll(view) {
  if (!["day", "find", "todo"].includes(view)) return;
  const y = Math.max(0, Math.round(window.scrollY));
  state.viewScroll[view] = y;
  try {
    sessionStorage.setItem(viewScrollKey(view), String(y));
  } catch {
    // Best effort only; scroll memory should never block the UI.
  }
}

function getViewScroll(view) {
  if (state.viewScroll[view] !== undefined) return state.viewScroll[view];
  let saved = 0;
  try {
    saved = Number(sessionStorage.getItem(viewScrollKey(view)) || 0);
  } catch {
    saved = 0;
  }
  state.viewScroll[view] = Number.isFinite(saved) ? saved : 0;
  return state.viewScroll[view];
}

function restoreViewScroll(view) {
  const y = getViewScroll(view);
  window.requestAnimationFrame(() => {
    window.scrollTo(0, y);
  });
}

function viewScrollKey(view) {
  return `obr.scroll.${view}`;
}

function saveReadingPosition(file = state.currentFile) {
  if (!file || el("page-editor").hidden === false) return;
  const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const y = Math.min(maxY, Math.max(0, Math.round(window.scrollY)));
  try {
    localStorage.setItem(readingPositionKey(file), JSON.stringify({ y }));
  } catch {
    // Best effort only.
  }
}

function restoreReadingPosition(file) {
  const y = readReadingPosition(file);
  restorePageScroll(y);
  window.setTimeout(() => restorePageScroll(y), 250);
}

function restorePageScroll(y) {
  window.requestAnimationFrame(() => {
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.min(y, maxY));
  });
}

function readReadingPosition(file) {
  if (!file) return 0;
  try {
    const saved = JSON.parse(localStorage.getItem(readingPositionKey(file)) || "{}");
    return Number.isFinite(saved.y) ? Math.max(0, saved.y) : 0;
  } catch {
    return 0;
  }
}

function readingPositionKey(file) {
  return `obr.reading.${encodeURIComponent(file)}`;
}

async function goBackToLastList() {
  if (window.history.state?.obr && window.history.state.view === "page") {
    window.history.back();
    return;
  }
  await showView(state.lastListView, { focusSearch: false });
}

function handleGlobalKeydown(event) {
  if (el("app").hidden) return;
  if (event.defaultPrevented || isEditableTarget(event.target)) return;
  const searchShortcut =
    event.key === "/" ||
    ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k");
  if (!searchShortcut || event.altKey) return;
  event.preventDefault();
  void showView("find", { restoreScroll: false }).then(() =>
    focusSearchInput({ select: true }),
  );
}

function isEditableTarget(target) {
  return Boolean(
    target?.closest?.("input, textarea, select, [contenteditable='true']"),
  );
}

function installLongPressCopy(root) {
  root.addEventListener("pointerdown", startLongPressCopy);
  root.addEventListener("pointermove", moveLongPressCopy, { passive: true });
  root.addEventListener("pointerup", endLongPressCopy);
  root.addEventListener("pointercancel", endLongPressCopy);
  root.addEventListener("click", suppressCopiedLinkClick, true);
  root.addEventListener("contextmenu", suppressCopiedLinkMenu);
}

function startLongPressCopy(event) {
  if (event.button && event.button !== 0) return;
  const anchor = event.target.closest("a[href], a[data-page]");
  if (!anchor) return;
  clearLongPressCopy();
  state.longPress = {
    anchor,
    copied: false,
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    timer: window.setTimeout(() => completeLongPressCopy(anchor), LONG_PRESS_COPY_MS),
  };
}

function moveLongPressCopy(event) {
  const press = state.longPress;
  if (!press || press.pointerId !== event.pointerId || press.copied) return;
  const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
  if (moved > LONG_PRESS_MOVE_PX) clearLongPressCopy();
}

function endLongPressCopy(event) {
  const press = state.longPress;
  if (!press || press.pointerId !== event.pointerId) return;
  window.clearTimeout(press.timer);
  state.longPress = null;
}

async function completeLongPressCopy(anchor) {
  const press = state.longPress;
  if (!press || press.anchor !== anchor) return;
  press.copied = true;
  state.suppressLinkClickUntil = Date.now() + 800;
  state.suppressLinkElement = anchor;
  try {
    await copyText(linkCopyText(anchor));
    navigator.vibrate?.(12);
    showToast("Link copied.");
  } catch (error) {
    console.error(error);
    showToast("Copy failed.");
  }
}

function suppressCopiedLinkClick(event) {
  if (
    Date.now() <= state.suppressLinkClickUntil &&
    event.target.closest("a") === state.suppressLinkElement
  ) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function suppressCopiedLinkMenu(event) {
  if (
    Date.now() <= state.suppressLinkClickUntil &&
    event.target.closest("a") === state.suppressLinkElement
  ) {
    event.preventDefault();
  }
}

function clearLongPressCopy() {
  if (state.longPress?.timer) window.clearTimeout(state.longPress.timer);
  state.longPress = null;
}

function linkCopyText(anchor) {
  if (anchor.dataset.page) return `[[${anchor.dataset.page}]]`;
  if (anchor.id && anchor.getAttribute("href") === "#") return `[[${anchor.id}]]`;
  return anchor.href || anchor.textContent.trim();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function showToast(message) {
  const toast = el("toast");
  if (!toast) return;
  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  window.requestAnimationFrame(() => toast.classList.add("show"));
  state.toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => {
      if (!toast.classList.contains("show")) toast.hidden = true;
    }, 160);
  }, TOAST_MS);
}

function highlightPageContent(keyword) {
  const root = el("page-content");
  const needle = keyword.trim();
  if (!needle) return;

  const lowerNeedle = needle.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (
        parent.closest(
          "mark.search-highlight, pre, code, script, style, textarea",
        )
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.nodeValue.toLowerCase().includes(lowerNeedle)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  const matches = [];
  while (walker.nextNode()) matches.push(walker.currentNode);

  for (const node of matches) {
    const text = node.nodeValue;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let index = text.toLowerCase().indexOf(lowerNeedle);
    while (index !== -1) {
      if (index > cursor) {
        fragment.append(document.createTextNode(text.slice(cursor, index)));
      }
      const mark = document.createElement("mark");
      mark.className = "search-highlight";
      mark.textContent = text.slice(index, index + needle.length);
      fragment.append(mark);
      cursor = index + needle.length;
      index = text.toLowerCase().indexOf(lowerNeedle, cursor);
    }
    if (cursor < text.length) {
      fragment.append(document.createTextNode(text.slice(cursor)));
    }
    node.replaceWith(fragment);
  }
}

function installIcons() {
  document.querySelectorAll("[data-icon]").forEach((element) => {
    addIcon(element, element.dataset.icon);
  });
}

function addIcon(element, iconName) {
  if (!ICONS[iconName] || element.firstElementChild?.classList.contains("icon"))
    return;
  element.insertAdjacentHTML("afterbegin", iconSvg(iconName));
}

function setButtonIcon(button, iconName, label) {
  button.dataset.icon = iconName;
  button.innerHTML = `${iconSvg(iconName)}<span>${escapeHtml(label)}</span>`;
}

function iconSvg(iconName) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[iconName]}</svg>`;
}

async function markTodo(index) {
  await request(`/api/mark?index=${encodeURIComponent(index)}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
