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
  searchPage: 0,
  pageController: null,
  pageRequestId: 0,
  todoRequestId: 0,
  passkeyRegistered: false,
  passwordLoginAllowed: true,
  connectionOnline: true,
  connectionPingController: null,
  connectionRetryTimer: 0,
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
  commandItems: [],
  commandIndex: 0,
  imageLightboxScale: 1,
  imageLightboxX: 0,
  imageLightboxY: 0,
  imageLightboxDrag: null,
  imageLightboxLastTap: null,
  imageLightboxSuppressZoomUntil: 0,
  imageObserver: null,
  imageQueue: [],
  imageActiveLoads: 0,
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
const CONNECTION_RETRY_MS = 5000;
const STARTUP_VERIFY_TIMEOUT_MS = 1200;
const AUTH_OPTIONS_TIMEOUT_MS = 1200;
const IMAGE_DOUBLE_TAP_MS = 340;
const IMAGE_LIGHTBOX_MIN_SCALE = 1;
const IMAGE_LIGHTBOX_MAX_SCALE = 4;
const IMAGE_LIGHTBOX_ZOOM_STEP = 1.35;
const MARKDOWN_IMAGE_MAX_ACTIVE_LOADS = 2;
const MARKDOWN_IMAGE_ROOT_MARGIN = "900px 0px";
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
  command:
    '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0 0-6"></path>',
  "list-checks":
    '<path d="m3 7 2 2 4-4"></path><path d="m3 17 2 2 4-4"></path><path d="M13 6h8"></path><path d="M13 12h8"></path><path d="M13 18h8"></path>',
  loader:
    '<path d="M12 2v4"></path><path d="m16.2 7.8 2.9-2.9"></path><path d="M18 12h4"></path><path d="m16.2 16.2 2.9 2.9"></path><path d="M12 18v4"></path><path d="m4.9 19.1 2.9-2.9"></path><path d="M2 12h4"></path><path d="m4.9 4.9 2.9 2.9"></path>',
  "log-in":
    '<path d="m10 17 5-5-5-5"></path><path d="M15 12H3"></path><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>',
  "log-out":
    '<path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>',
  minus: '<path d="M5 12h14"></path>',
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
  el("command-button").addEventListener("click", openCommandPalette);
  el("update-banner").addEventListener("click", applyServiceWorkerUpdate);
  el("outbox-button").addEventListener("click", toggleOutboxPanel);
  el("outbox-close").addEventListener("click", hideOutboxPanel);
  el("outbox-retry").addEventListener("click", retryOutbox);
  el("outbox-list").addEventListener("click", handleOutboxListClick);
  el("command-palette").addEventListener("click", handleCommandBackdropClick);
  el("command-input").addEventListener("input", renderCommandPalette);
  el("command-input").addEventListener("keydown", handleCommandInputKeydown);
  el("command-list").addEventListener("click", handleCommandListClick);
  bindImageLightboxEvents();
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
  el("entry-meta").addEventListener("toggle", updateEntryMetaSummary);
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
    const more = event.target.closest("[data-search-page]");
    if (more) {
      event.preventDefault();
      more.disabled = true;
      await search({ page: Number(more.dataset.searchPage || 0), append: true });
      return;
    }

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
    await loadTodo({ renderCache: false });
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
  setConnectionStatus(true);
  window.addEventListener("online", () => resumeConnectionMonitor());
  window.addEventListener("offline", () => {
    // Mobile browsers/WebViews can briefly report offline after subresource failures
    // such as missing or aborted images. Do not trust navigator.onLine by itself;
    // immediately probe the real backend and keep retrying while visible.
    scheduleConnectivityRetry(0);
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

function scheduleConnectivityRetry(delay = CONNECTION_RETRY_MS) {
  window.clearTimeout(state.connectionRetryTimer);
  state.connectionRetryTimer = window.setTimeout(async () => {
    state.connectionRetryTimer = 0;
    const online = await checkConnectivity({ sync: true, allowHidden: true });
    if (!online && !document.hidden) scheduleConnectivityRetry();
  }, delay);
}

function abortConnectivityCheck() {
  state.connectionPingController?.abort();
  state.connectionPingController = null;
}

async function checkConnectivity(options = {}) {
  if (!isForegroundPage() && !options.allowHidden) {
    return state.connectionOnline;
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
    if (!document.hidden) {
      setConnectionStatus(false);
      scheduleConnectivityRetry();
    }
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

function cachedPageHtml(page) {
  if (!page) return "";
  return page.html || (page.source ? offlineSourcePreview(page.source) : "");
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
      await loadTodo({ renderCache: false });
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
        setDeferredMarkdownHtml(el("page-content"), data.html || "");
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
    const response = await fetchWithTimeout(
      "/api/verify",
      {
        cache: "no-store",
        credentials: "same-origin",
      },
      STARTUP_VERIFY_TIMEOUT_MS,
    );
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
    const response = await fetchWithTimeout(
      "/api/auth/options",
      {
        credentials: "same-origin",
      },
      AUTH_OPTIONS_TIMEOUT_MS,
    );
    setConnectionStatus(true);
    if (!response.ok) throw new Error(await response.text());
    const options = await response.json();
    return {
      passkeyRegistered: Boolean(options.passkey_registered),
      passwordLoginAllowed: Boolean(options.password_login_allowed),
    };
  } catch (error) {
    console.error(error);
    if (error?.name === "AbortError" || error instanceof TypeError) {
      setConnectionStatus(false);
      const local = isLocalBrowserHost();
      return {
        passkeyRegistered: !local,
        passwordLoginAllowed: local,
      };
    }
    const passkeyRegistered = await fetchLegacyPasskeyAvailability();
    return {
      passkeyRegistered,
      passwordLoginAllowed: !passkeyRegistered || isLocalBrowserHost(),
    };
  }
}

async function fetchLegacyPasskeyAvailability() {
  try {
    const response = await fetchWithTimeout(
      "/api/passkey/available",
      {
        credentials: "same-origin",
      },
      AUTH_OPTIONS_TIMEOUT_MS,
    );
    setConnectionStatus(true);
    if (!response.ok) return false;
    const status = await response.json();
    return Boolean(status.registered);
  } catch (error) {
    if (error instanceof TypeError) setConnectionStatus(false);
    return false;
  }
}

async function fetchWithTimeout(path, options = {}, timeoutMs = 0) {
  if (!timeoutMs) return fetch(path, options);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(path, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
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
  if (response.status === 403) {
    await refreshAuthOptions();
    showLogin();
    setLoginError(
      "Password login is disabled here. Use passkey, or open localhost to use username/password.",
    );
    return;
  }
  if (!response.ok) {
    setLoginError("Login failed.");
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
  hideBoot();
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
  hideBoot();
  el("login").hidden = true;
  el("app").hidden = false;
  refreshPasskeyRegisterButton();
}

function hideBoot() {
  const boot = el("boot");
  if (boot) boot.hidden = true;
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
  setEntryStatus("Local draft saved. Syncing...");
  try {
    const response = await request("/api/entry", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (text !== "ok") throw new Error(text);
    resetEntry();
    setEntryStatus("");
    showToast("Synced to file.");
  } catch (error) {
    console.error(error);
    if (shouldQueueOffline(error)) {
      try {
        queueOfflineMutation("entry", payload);
        resetEntry();
        setEntryStatus("");
        showToast("Waiting to sync.");
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
  updateEntryMetaSummary();
}

function setEntryStatus(message) {
  el("entry-status").textContent = message;
  el("entry-status").hidden = !message;
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
  el("entry-meta").open = false;
  updateEntryMetaSummary();
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
  updateEntryMetaSummary();
  updateEntrySaveState();
}

function updateEntryMetaSummary() {
  const fields = [el("entry-page"), el("entry-links")];
  const filled = fields.filter((input) => input.value.trim()).length;
  const count = el("entry-meta-count");
  count.textContent = `${filled} filled`;
  count.hidden = filled === 0 || el("entry-meta").open;
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

async function search(options = {}) {
  const keyword = el("search-input").value.trim();
  const page = Number(options.page || 0);
  const append = Boolean(options.append);
  updateSearchClear();
  state.searchController?.abort();
  const requestId = state.searchRequestId + 1;
  state.searchRequestId = requestId;
  const controller = new AbortController();
  state.searchController = controller;
  setSearchLoading(true);
  try {
    const response = await request(
      `/api/search?keyword=${encodeURIComponent(keyword)}&page=${page}`,
      { signal: controller.signal },
    );
    const html = await response.text();
    if (requestId !== state.searchRequestId) return;
    renderSearchResults(html, { append });
    state.searchPage = page;
  } catch (error) {
    if (error?.name === "AbortError" || requestId !== state.searchRequestId) return;
    console.error(error);
    if (shouldQueueOffline(error)) {
      renderCachedSearchResults(keyword);
      return;
    }
    el("search-results").innerHTML = '<p class="empty">Search failed.</p>';
  } finally {
    if (state.searchController === controller) {
      state.searchController = null;
      setSearchLoading(false);
    }
  }
}

function setSearchLoading(loading) {
  const button = el("search-submit");
  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
  button.setAttribute("aria-busy", loading ? "true" : "false");
  setButtonIcon(button, loading ? "loader" : "search", loading ? "Searching..." : "Search");
}

function renderSearchResults(html, options = {}) {
  const results = el("search-results");
  if (options.append) {
    const list = results.querySelector("ul");
    if (list) {
      list.querySelector(".search-more-row")?.remove();
      list.insertAdjacentHTML("beforeend", html);
      return;
    }
  }
  results.innerHTML = `<ul>${html}</ul>`;
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

async function loadTodo(options = {}) {
  const { renderCache = true } = options;
  const requestId = state.todoRequestId + 1;
  state.todoRequestId = requestId;
  const cached = findCachedPage("Zero/todo");
  const cachedHtml = cachedPageHtml(cached);
  if (renderCache && cached) renderTodoHtml(cachedHtml, "No cached todos.");

  try {
    const response = await request("/api/page?path=Zero%2Ftodo");
    const data = await response.json();
    if (requestId !== state.todoRequestId) return;
    if (data.file !== "NoPage") {
      rememberPage(data, "Zero/todo");
      void warmPageSource(data.file);
    }
    const html = data.file === "NoPage" ? "" : data.html || "";
    if (!renderCache || !cached || html !== cachedHtml) {
      renderTodoHtml(html, "No todos.");
    }
  } catch (error) {
    if (requestId !== state.todoRequestId) return;
    console.error(error);
    if (!renderCache || !cached) renderTodoHtml("", "No offline todo cache.");
  }
}

function renderTodoHtml(html, emptyMessage) {
  setDeferredMarkdownHtml(
    el("todo-list"),
    html.trim() ? html : `<p class="empty">${escapeHtml(emptyMessage)}</p>`,
  );
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
  el("todo-status").textContent = "Local draft saved. Syncing...";
  el("todo-status").hidden = false;
  try {
    const response = await request("/api/entry", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const result = await response.text();
    if (result !== "ok") throw new Error(result);
    el("todo-input").value = "";
    el("todo-status").textContent = "";
    el("todo-status").hidden = true;
    showToast("Todo synced to file.");
    await loadTodo({ renderCache: false });
  } catch (error) {
    console.error(error);
    if (shouldQueueOffline(error)) {
      try {
        queueOfflineMutation("entry", payload);
        el("todo-input").value = "";
        el("todo-status").textContent = "";
        el("todo-status").hidden = true;
        showToast("Todo waiting to sync.");
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
  const { updateHistory = true, queryType = "" } = options;
  state.pageController?.abort();
  const requestId = state.pageRequestId + 1;
  state.pageRequestId = requestId;
  const controller = new AbortController();
  state.pageController = controller;
  let renderedCachedPage = false;
  let cachedPage = null;
  if (!queryType) {
    cachedPage = findCachedPage(path);
    if (cachedPage) {
      displayPageData(cachedPage, path, sourceView, highlightKeyword, {
        updateHistory,
      });
      renderedCachedPage = true;
    }
  }
  let data;
  try {
    const params = new URLSearchParams();
    if (queryType) {
      params.set("query_type", queryType);
    } else {
      params.set("path", path);
    }
    const response = await request(`/api/page?${params}`, {
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
    if (!renderedCachedPage) {
      showToast("No offline copy.");
    } else {
      showToast("Offline copy.");
    }
    return;
  } finally {
    if (state.pageController === controller) state.pageController = null;
  }
  if (requestId !== state.pageRequestId) return;
  if (
    renderedCachedPage &&
    data.file === cachedPage?.file &&
    (data.html || "") === cachedPageHtml(cachedPage)
  ) {
    return;
  }
  displayPageData(data, path, sourceView, highlightKeyword, {
    updateHistory: updateHistory && !renderedCachedPage,
    saveScroll: !renderedCachedPage,
    restoreReading: !renderedCachedPage,
  });
}

function displayPageData(
  data,
  requestedPath,
  sourceView,
  highlightKeyword = "",
  options = {},
) {
  const file = data.file;
  state.currentHighlightKeyword = highlightKeyword.trim();
  if (file === "NoPage") {
    state.currentFile = requestedPath.endsWith(".md")
      ? requestedPath
      : `${requestedPath}.md`;
    state.currentContent = "";
    state.currentContentLoaded = true;
    showPage("NoPage", "No page yet.", sourceView, options);
    return;
  }
  state.currentFile = file;
  state.currentContent =
    pendingPageContent(file) ?? data.source ?? cachedPageSource(file) ?? "";
  state.currentContentLoaded = Boolean(state.currentContent);
  const html = data.html || offlineSourcePreview(state.currentContent);
  showPage(file, html, sourceView, options);
}

function showPage(title, html, sourceView, options = {}) {
  const {
    updateHistory = true,
    saveScroll = true,
    restoreReading = true,
  } = options;
  if (saveScroll) saveCurrentScrollPosition();
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
  setDeferredMarkdownHtml(el("page-content"), html);
  highlightPageContent(state.currentHighlightKeyword);
  el("page-content").hidden = false;
  el("page-editor").hidden = true;
  setPageEditorStatus("");
  setButtonIcon(el("edit-button"), "pencil", "Edit");
  el("page-view").hidden = false;
  if (title === "NoPage") {
    window.scrollTo(0, 0);
  } else if (restoreReading) {
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
    saveReadingPosition(state.currentFile);
    setPageEditorStatus("Loading source...");
    button.disabled = true;
    try {
      await loadCurrentPageSource({ forceNetwork: true });
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
  setPageEditorStatus("Local draft saved. Syncing...");
  button.disabled = true;
  setButtonIcon(button, "save", "Saving...");
  const payload = {
    file: state.currentFile,
    content: editor.value,
  };
  const restoreFile = state.currentFile;
  const restoreY = readReadingPosition(restoreFile);
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
    rememberPageSource(state.currentFile, state.currentContent);
    replaceAppHistory(currentAppHistoryEntry());
    clearPageDraft(state.currentFile);
    setDeferredMarkdownHtml(content, data.html || "");
    highlightPageContent(state.currentHighlightKeyword);
    editor.hidden = true;
    content.hidden = false;
    restoreReadingPositionAfterEdit(restoreFile, restoreY);
    setPageEditorStatus("");
    showToast("Page synced to file.");
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
        restoreReadingPositionAfterEdit(restoreFile, restoreY);
        setPageEditorStatus("");
        showToast("Page waiting to sync.");
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

async function loadCurrentPageSource(options = {}) {
  const { forceNetwork = false } = options;
  const pending = pendingPageContent(state.currentFile);
  if (pending !== null) {
    state.currentContent = pending;
    state.currentContentLoaded = true;
    return;
  }
  if (!forceNetwork && state.currentContentLoaded) return;
  if (!forceNetwork) {
    const cached = cachedPageSource(state.currentFile);
    if (cached) {
      state.currentContent = cached;
      state.currentContentLoaded = true;
      return;
    }
  }
  const params = new URLSearchParams({ path: state.currentFile });
  if (forceNetwork) params.set("fresh", String(Date.now()));
  const response = await request(`/api/page/source?${params}`, {
    cache: "no-store",
  });
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

function restoreReadingPositionAfterEdit(file, y) {
  if (file) {
    try {
      localStorage.setItem(readingPositionKey(file), JSON.stringify({ y }));
    } catch {
      // Best effort only.
    }
  }
  restorePageScroll(y);
  window.setTimeout(() => restorePageScroll(y), 250);
  window.setTimeout(() => restorePageScroll(y), 800);
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
  if (event.defaultPrevented) return;
  if (!el("image-lightbox").hidden) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeImageLightbox();
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomImageLightbox(IMAGE_LIGHTBOX_ZOOM_STEP);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomImageLightbox(1 / IMAGE_LIGHTBOX_ZOOM_STEP);
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      resetImageLightboxZoom();
      return;
    }
  }
  if (event.key === "Escape" && !el("command-palette").hidden) {
    event.preventDefault();
    closeCommandPalette();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !event.altKey) {
    event.preventDefault();
    openCommandPalette();
    return;
  }
  if (isEditableTarget(event.target) || event.key !== "/" || event.altKey) return;
  event.preventDefault();
  void showView("find", { restoreScroll: false }).then(() =>
    focusSearchInput({ select: true }),
  );
}

function openCommandPalette() {
  state.commandIndex = 0;
  el("command-input").value = "";
  el("command-palette").hidden = false;
  renderCommandPalette();
  window.requestAnimationFrame(() => el("command-input").focus());
}

function closeCommandPalette() {
  el("command-palette").hidden = true;
}

function handleCommandBackdropClick(event) {
  if (event.target === el("command-palette")) closeCommandPalette();
}

function handleCommandInputKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeCommandPalette();
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveCommandSelection(1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveCommandSelection(-1);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const command = state.commandItems[state.commandIndex];
    if (command) void runCommand(command.id);
  }
}

function handleCommandListClick(event) {
  const button = event.target.closest("button[data-command-id]");
  if (!button) return;
  void runCommand(button.dataset.commandId);
}

function renderCommandPalette() {
  const query = el("command-input").value.trim().toLowerCase();
  const commands = buildCommandItems();
  state.commandItems = commands.filter((command) => {
    const haystack = `${command.label} ${command.hint || ""}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  state.commandIndex = Math.min(
    state.commandIndex,
    Math.max(0, state.commandItems.length - 1),
  );
  if (!state.commandItems.length) {
    el("command-list").innerHTML = '<p class="empty">No commands.</p>';
    return;
  }
  el("command-list").innerHTML = state.commandItems
    .map((command, index) => commandItemHtml(command, index))
    .join("");
}

function commandItemHtml(command, index) {
  return `
    <button class="command-item" type="button" role="option" data-command-id="${escapeHtmlAttr(command.id)}" aria-selected="${index === state.commandIndex}">
      <span>${escapeHtml(command.label)}</span>
      <small>${escapeHtml(command.hint || "")}</small>
    </button>
  `;
}

function moveCommandSelection(delta) {
  if (!state.commandItems.length) return;
  const length = state.commandItems.length;
  state.commandIndex = (state.commandIndex + delta + length) % length;
  renderCommandPalette();
  const selected = el("command-list").querySelector('[aria-selected="true"]');
  selected?.scrollIntoView({ block: "nearest" });
}

function buildCommandItems() {
  const commands = [
    {
      id: "new-memo",
      label: "New memo",
      hint: "Day",
      run: async () => {
        await showView("day", { restoreScroll: false });
        window.requestAnimationFrame(() => el("entry-text").focus());
      },
    },
    {
      id: "find",
      label: "Find",
      hint: "/",
      run: async () => {
        await showView("find", { restoreScroll: false });
        focusSearchInput({ select: true });
      },
    },
    {
      id: "todo",
      label: "Todo",
      hint: "Open todo",
      run: () => showView("todo", { restoreScroll: false }),
    },
    {
      id: "random",
      label: "Random page",
      hint: "Open a random note",
      run: () => fetchPage("", state.lastListView, "", { queryType: "rand" }),
    },
  ];
  if (state.currentFile && state.currentFile !== "NoPage") {
    commands.push({
      id: "copy-current-page",
      label: "Copy current page link",
      hint: pageLinkText(state.currentFile),
      run: copyCurrentPageLink,
    });
  }
  for (const page of readRecentPages().slice(0, 6)) {
    commands.push({
      id: `recent:${page.file}`,
      label: page.file,
      hint: "Recent page",
      run: () => fetchPage(page.file, "find"),
    });
  }
  return commands;
}

async function runCommand(id) {
  const command = state.commandItems.find((item) => item.id === id);
  if (!command) return;
  closeCommandPalette();
  await command.run();
}

async function copyCurrentPageLink() {
  if (!state.currentFile || state.currentFile === "NoPage") {
    showToast("No page open.");
    return;
  }
  try {
    await copyText(pageLinkText(state.currentFile));
    showToast("Page link copied.");
  } catch (error) {
    console.error(error);
    showToast("Copy failed.");
  }
}

function pageLinkText(file) {
  return `[[${String(file).replace(/\.md$/, "")}]]`;
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

function setDeferredMarkdownHtml(root, html) {
  if (!root) return;
  const template = document.createElement("template");
  template.innerHTML = html || "";
  for (const img of template.content.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (!src || src.startsWith("data:")) continue;
    img.dataset.src = src;
    img.removeAttribute("src");
    img.loading = "lazy";
    img.decoding = "async";
    img.fetchPriority = "low";
  }
  root.replaceChildren(template.content);
  enhanceMarkdownImages(root);
}

function markdownImageObserver() {
  if (state.imageObserver || !("IntersectionObserver" in window)) return state.imageObserver;
  state.imageObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        state.imageObserver.unobserve(entry.target);
        enqueueMarkdownImage(entry.target);
      }
    },
    { rootMargin: MARKDOWN_IMAGE_ROOT_MARGIN },
  );
  return state.imageObserver;
}

function observeDeferredMarkdownImage(img) {
  const observer = markdownImageObserver();
  if (observer) {
    observer.observe(img);
  } else {
    enqueueMarkdownImage(img);
  }
}

function enqueueMarkdownImage(img) {
  if (!img?.dataset?.src || img.dataset.loadQueued === "1") return;
  img.dataset.loadQueued = "1";
  state.imageQueue.push(img);
  pumpMarkdownImageQueue();
}

function pumpMarkdownImageQueue() {
  while (
    state.imageActiveLoads < MARKDOWN_IMAGE_MAX_ACTIVE_LOADS &&
    state.imageQueue.length
  ) {
    const img = state.imageQueue.shift();
    if (!img?.dataset?.src || img.src) continue;
    state.imageActiveLoads += 1;
    img.dataset.loadingActive = "1";
    img.src = img.dataset.src;
  }
}

function finishMarkdownImageLoad(img) {
  if (img?.dataset?.loadingActive === "1") {
    delete img.dataset.loadingActive;
    state.imageActiveLoads = Math.max(0, state.imageActiveLoads - 1);
    pumpMarkdownImageQueue();
  }
}

function enhanceMarkdownImages(root) {
  if (!root) return;
  for (const img of root.querySelectorAll("img")) {
    if (img.closest(".image-frame")) continue;
    const frame = document.createElement("span");
    frame.className = "image-frame image-loading";
    frame.setAttribute("aria-busy", "true");
    const width = parseImageDimension(img.getAttribute("width"));
    const height = parseImageDimension(img.getAttribute("height"));
    if (width) {
      frame.style.setProperty("--image-placeholder-width", `${width}px`);
    }
    if (height) {
      frame.style.setProperty("--image-placeholder-height", `${height}px`);
    } else if (width) {
      const estimatedHeight = Math.max(120, Math.min(Math.round(width * 0.62), 360));
      frame.style.setProperty("--image-placeholder-height", `${estimatedHeight}px`);
    }

    const placeholder = document.createElement("span");
    placeholder.className = "image-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = "Loading image";

    img.parentNode.insertBefore(frame, img);
    frame.append(placeholder, img);
    installImageLightboxTrigger(img);

    const finish = () => {
      finishMarkdownImageLoad(img);
      frame.classList.remove("image-loading", "image-error");
      frame.classList.add("image-loaded");
      frame.removeAttribute("aria-busy");
    };
    const fail = () => {
      finishMarkdownImageLoad(img);
      frame.classList.remove("image-loading", "image-loaded");
      frame.classList.add("image-error");
      frame.removeAttribute("aria-busy");
      placeholder.textContent = "Image unavailable";
      scheduleConnectivityRetry(0);
    };

    img.addEventListener("load", finish, { once: true });
    img.addEventListener("error", fail, { once: true });
    if (img.dataset.src && !img.src) {
      observeDeferredMarkdownImage(img);
    } else if (img.complete) {
      if (img.naturalWidth > 0 || img.naturalHeight > 0) {
        finish();
      } else {
        fail();
      }
    }
  }
}

function bindImageLightboxEvents() {
  const overlay = el("image-lightbox");
  const stage = el("image-lightbox-stage");
  const image = el("image-lightbox-img");
  overlay.addEventListener("click", handleImageLightboxBackdropClick);
  stage.addEventListener("wheel", handleImageLightboxWheel, { passive: false });
  stage.addEventListener("pointerdown", startImageLightboxDrag);
  stage.addEventListener("pointermove", moveImageLightboxDrag);
  stage.addEventListener("pointerup", endImageLightboxDrag);
  stage.addEventListener("pointercancel", endImageLightboxDrag);
  image.addEventListener("dblclick", (event) => {
    event.preventDefault();
    toggleImageLightboxZoom();
  });
  image.addEventListener("pointerup", handleImageLightboxPointerUp);
  image.addEventListener("dragstart", (event) => event.preventDefault());
  el("image-lightbox-close").addEventListener("click", closeImageLightbox);
  el("image-lightbox-zoom-in").addEventListener("click", () =>
    zoomImageLightbox(IMAGE_LIGHTBOX_ZOOM_STEP),
  );
  el("image-lightbox-zoom-out").addEventListener("click", () =>
    zoomImageLightbox(1 / IMAGE_LIGHTBOX_ZOOM_STEP),
  );
  el("image-lightbox-reset").addEventListener("click", resetImageLightboxZoom);
}

function installImageLightboxTrigger(img) {
  img.classList.add("image-openable");
  img.tabIndex = 0;
  img.setAttribute("role", "button");
  img.setAttribute("aria-label", img.alt ? `Open image: ${img.alt}` : "Open image");
  img.title = "Double tap to preview";
  img.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openImageLightbox(img);
  });
  img.addEventListener("pointerup", handleImageTriggerPointerUp);
  img.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openImageLightbox(img);
  });
}

function handleImageTriggerPointerUp(event) {
  if (event.pointerType === "mouse" || !event.isPrimary) return;
  const img = event.currentTarget;
  const now = Date.now();
  const last = state.imageLightboxLastTap;
  if (last?.target === img && now - last.time <= IMAGE_DOUBLE_TAP_MS) {
    event.preventDefault();
    state.imageLightboxLastTap = null;
    openImageLightbox(img);
    return;
  }
  state.imageLightboxLastTap = { target: img, time: now };
}

function openImageLightbox(sourceImg) {
  const src = sourceImg.currentSrc || sourceImg.src;
  if (!src) return;
  const preview = el("image-lightbox-img");
  preview.src = src;
  preview.alt = sourceImg.alt || "Image preview";
  preview.classList.remove("is-dragging");
  state.imageLightboxScale = 1;
  state.imageLightboxX = 0;
  state.imageLightboxY = 0;
  state.imageLightboxDrag = null;
  state.imageLightboxLastTap = null;
  state.imageLightboxSuppressZoomUntil = Date.now() + IMAGE_DOUBLE_TAP_MS;
  applyImageLightboxTransform();
  el("image-lightbox").hidden = false;
  document.body.classList.add("lightbox-open");
  window.requestAnimationFrame(() => el("image-lightbox-close").focus());
}

function closeImageLightbox() {
  el("image-lightbox").hidden = true;
  document.body.classList.remove("lightbox-open");
  el("image-lightbox-img").removeAttribute("src");
  state.imageLightboxDrag = null;
}

function handleImageLightboxBackdropClick(event) {
  if (
    event.target === el("image-lightbox") ||
    (event.target === el("image-lightbox-stage") && state.imageLightboxScale === 1)
  ) {
    closeImageLightbox();
  }
}

function handleImageLightboxWheel(event) {
  if (el("image-lightbox").hidden) return;
  event.preventDefault();
  zoomImageLightbox(event.deltaY < 0 ? IMAGE_LIGHTBOX_ZOOM_STEP : 1 / IMAGE_LIGHTBOX_ZOOM_STEP);
}

function handleImageLightboxPointerUp(event) {
  if (event.pointerType === "mouse" || !event.isPrimary || state.imageLightboxDrag) return;
  if (Date.now() < state.imageLightboxSuppressZoomUntil) return;
  const now = Date.now();
  const last = state.imageLightboxLastTap;
  if (last?.target === event.currentTarget && now - last.time <= IMAGE_DOUBLE_TAP_MS) {
    event.preventDefault();
    state.imageLightboxLastTap = null;
    toggleImageLightboxZoom();
    return;
  }
  state.imageLightboxLastTap = { target: event.currentTarget, time: now };
}

function toggleImageLightboxZoom() {
  if (Date.now() < state.imageLightboxSuppressZoomUntil) return;
  if (state.imageLightboxScale <= 1.05) {
    setImageLightboxScale(2);
  } else {
    resetImageLightboxZoom();
  }
}

function zoomImageLightbox(factor) {
  setImageLightboxScale(state.imageLightboxScale * factor);
}

function resetImageLightboxZoom() {
  state.imageLightboxScale = 1;
  state.imageLightboxX = 0;
  state.imageLightboxY = 0;
  applyImageLightboxTransform();
}

function setImageLightboxScale(scale) {
  state.imageLightboxScale = clamp(
    scale,
    IMAGE_LIGHTBOX_MIN_SCALE,
    IMAGE_LIGHTBOX_MAX_SCALE,
  );
  if (state.imageLightboxScale === 1) {
    state.imageLightboxX = 0;
    state.imageLightboxY = 0;
  }
  clampImageLightboxPan();
  applyImageLightboxTransform();
}

function startImageLightboxDrag(event) {
  if (event.button && event.button !== 0) return;
  if (state.imageLightboxScale <= 1) return;
  event.preventDefault();
  state.imageLightboxDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: state.imageLightboxX,
    y: state.imageLightboxY,
  };
  el("image-lightbox-stage").setPointerCapture?.(event.pointerId);
  el("image-lightbox-img").classList.add("is-dragging");
}

function moveImageLightboxDrag(event) {
  const drag = state.imageLightboxDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  state.imageLightboxX = drag.x + event.clientX - drag.startX;
  state.imageLightboxY = drag.y + event.clientY - drag.startY;
  clampImageLightboxPan();
  applyImageLightboxTransform();
}

function endImageLightboxDrag(event) {
  const drag = state.imageLightboxDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  state.imageLightboxDrag = null;
  el("image-lightbox-stage").releasePointerCapture?.(event.pointerId);
  el("image-lightbox-img").classList.remove("is-dragging");
}

function clampImageLightboxPan() {
  const image = el("image-lightbox-img");
  const stage = el("image-lightbox-stage");
  const maxX = Math.max(
    0,
    (image.offsetWidth * state.imageLightboxScale - stage.clientWidth) / 2 + 24,
  );
  const maxY = Math.max(
    0,
    (image.offsetHeight * state.imageLightboxScale - stage.clientHeight) / 2 + 24,
  );
  state.imageLightboxX = clamp(state.imageLightboxX, -maxX, maxX);
  state.imageLightboxY = clamp(state.imageLightboxY, -maxY, maxY);
}

function applyImageLightboxTransform() {
  const image = el("image-lightbox-img");
  image.style.transform = `translate3d(${state.imageLightboxX}px, ${state.imageLightboxY}px, 0) scale(${state.imageLightboxScale})`;
  image.classList.toggle("is-zoomed", state.imageLightboxScale > 1);
  el("image-lightbox-zoom-out").disabled = state.imageLightboxScale <= 1;
  el("image-lightbox-zoom-in").disabled =
    state.imageLightboxScale >= IMAGE_LIGHTBOX_MAX_SCALE;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseImageDimension(value) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
