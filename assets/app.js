const state = {
  view: "day",
  lastListView: "day",
  currentFile: "",
  currentContent: "",
  currentContentLoaded: false,
  currentHighlightKeyword: "",
  image: "",
  imagePreviewUrl: "",
  imagePreviewLoadId: 0,
  imageReadId: 0,
  searchTimer: 0,
  editorPreviewTimer: 0,
  activeEditorBlock: -1,
  activeEditorBlockStart: -1,
  activeEditorBlockTextEnd: -1,
  lastReadBlockIndex: -1,
  lastReadBlockFile: "",
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
  connectionHeartbeatTimer: 0,
  connectionLastPingAt: 0,
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
  outboxSyncTimer: 0,
  outboxAbortController: null,
  outboxActiveItemId: "",
  outboxCancelingIds: new Set(),
  historyReady: false,
  applyingHistory: false,
  updateWorker: null,
  refreshingForUpdate: false,
  imageLightboxScale: 1,
  imageLightboxX: 0,
  imageLightboxY: 0,
  imageLightboxDrag: null,
  imageLightboxLastTap: null,
  imageLightboxLoadId: 0,
  imageLightboxSuppressZoomUntil: 0,
  imageObserver: null,
  imageQueue: [],
  imageActiveLoads: 0,
  loadedImageUrls: new Set(),
  pagePrefetchQueue: [],
  pagePrefetching: false,
  pagePrefetchScheduled: false,
  pagePrefetchSeen: new Set(),
  pageOutline: [],
  currentOutlineId: "",
  appConfig: {
    dailyDir: "Daily",
    entryDir: "Posts",
    imageDir: "Pics",
    todoPath: "Posts/todo",
    todoFile: "Posts/todo.md",
  },
  confirmResolve: null,
};

const el = (id) => document.getElementById(id);
const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
const TARGET_IMAGE_UPLOAD_BYTES = 1200 * 1024;
const MAX_ORIGINAL_IMAGE_UPLOAD_BYTES = 1536 * 1024;
const MAX_IMAGE_DIMENSIONS = [1600, 1280, 1024, 800];
const IMAGE_JPEG_QUALITIES = [0.82, 0.74, 0.66, 0.58, 0.5];
const ENTRY_SYNC_TIMEOUT_MS = 45000;
const LONG_PRESS_COPY_MS = 650;
const LONG_PRESS_MOVE_PX = 12;
const SCROLL_SAVE_MS = 160;
const TOAST_MS = 1800;
const PING_TIMEOUT_MS = 5000;
const CONNECTION_HEARTBEAT_MS = 10000;
const CONNECTION_MIN_PING_GAP_MS = 9000;
const CONNECTION_RETRY_MS = 5000;
const STARTUP_VERIFY_TIMEOUT_MS = 1200;
const AUTH_OPTIONS_TIMEOUT_MS = 1200;
const IMAGE_DOUBLE_TAP_MS = 340;
const IMAGE_LIGHTBOX_MIN_SCALE = 1;
const IMAGE_LIGHTBOX_MAX_SCALE = 4;
const IMAGE_LIGHTBOX_ZOOM_STEP = 1.35;
const MARKDOWN_IMAGE_MAX_ACTIVE_LOADS = 2;
const MARKDOWN_IMAGE_ROOT_MARGIN = "900px 0px";
const PAGE_PREFETCH_LIMIT = 6;
const PAGE_PREFETCH_IDLE_TIMEOUT_MS = 1400;
const RECENT_PAGE_LIMIT = 20;
const RECENT_PAGES_KEY = "obr.offline.recent-pages";
const RECENT_EDITS_KEY = "obr.recent-edits";
const SEARCH_CACHE_KEY = "obr.search-cache";
const SEARCH_CACHE_LIMIT = 24;
const OUTBOX_KEY = "obr.offline.outbox";
const APP_CONFIG_KEY = "obr.app-config";
const CLIENT_ID_KEY = "obr.client-id";
const LOADED_IMAGE_URLS_KEY = "obr.loaded-image-urls";
const LOADED_IMAGE_URLS_LIMIT = 600;

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
  list: '<path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path>',
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
  shuffle:
    '<path d="m18 14 4 4-4 4"></path><path d="m18 2 4 4-4 4"></path><path d="M2 18h1.9a6 6 0 0 0 5.2-3l5.8-10A6 6 0 0 1 20.1 2H22"></path><path d="M2 6h1.9a6 6 0 0 1 5.2 3l.7 1.2"></path><path d="M14.9 19a6 6 0 0 0 5.2 3H22"></path>',
  "trash-2":
    '<path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>',
  x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
};

document.addEventListener("DOMContentLoaded", async () => {
  installIcons();
  restoreLoadedImageUrls();
  restoreAppConfig();
  bindEvents();
  initializeAppHistory({ view: "day" });
  void registerServiceWorker();
  startConnectionMonitor();
  restoreDraft();
  updateEntrySaveState();
  const ok = await verify();
  if (ok) {
    await refreshAppConfig();
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
  el("random-note-button").addEventListener("click", openRandomNote);
  el("update-banner").addEventListener("click", applyServiceWorkerUpdate);
  el("outbox-button").addEventListener("click", toggleOutboxPanel);
  el("outbox-close").addEventListener("click", hideOutboxPanel);
  el("outbox-retry").addEventListener("click", retryOutbox);
  el("outbox-list").addEventListener("click", handleOutboxListClick);
  el("recent-panel").addEventListener("click", handleRecentPanelClick);
  el("toc-button").addEventListener("click", openTocPanel);
  el("toc-close").addEventListener("click", closeTocPanel);
  el("toc-panel").addEventListener("click", handleTocPanelClick);
  el("toc-list").addEventListener("click", handleTocListClick);
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
  el("entry-image-file").addEventListener("click", clearFileInputBeforePick);
  el("entry-camera-file").addEventListener("click", clearFileInputBeforePick);
  el("entry-image-file").addEventListener("change", handleImageFile);
  el("entry-camera-file").addEventListener("change", handleImageFile);
  el("page-editor").addEventListener("input", handlePageEditorInput);
  el("page-block-editor").addEventListener("click", handlePageBlockEditorClick);
  el("page-block-editor").addEventListener("focusout", handlePageBlockEditorFocusOut);
  el("discard-page-draft").addEventListener("click", discardRestoredPageDraft);
  bindConfirmPanelEvents();

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

  el("page-content").addEventListener("pointerup", rememberReadBlockFromPointer);
  el("page-content").addEventListener("click", async (event) => {
    const task = event.target.closest("input[data-task-index]");
    if (task && state.currentFile === state.appConfig.todoFile) {
      await markTodo(task.dataset.taskIndex);
      await fetchPage(state.appConfig.todoPath, "todo");
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

  if (!(await prepareToLeavePageEditor())) {
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
  startConnectionHeartbeat();
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
  if (state.connectionPingController) return;
  if (!canStartConnectivityPing()) return;
  void checkConnectivity({ sync: true });
}

function pauseConnectionMonitor() {
  abortConnectivityCheck();
  window.clearTimeout(state.connectionRetryTimer);
  state.connectionRetryTimer = 0;
}

function startConnectionHeartbeat() {
  window.clearInterval(state.connectionHeartbeatTimer);
  state.connectionHeartbeatTimer = window.setInterval(() => {
    if (!isForegroundPage()) return;
    if (state.connectionPingController) return;
    if (!canStartConnectivityPing()) return;
    void checkConnectivity({ sync: true });
  }, CONNECTION_HEARTBEAT_MS);
}

function scheduleConnectivityRetry(delay = CONNECTION_RETRY_MS) {
  window.clearTimeout(state.connectionRetryTimer);
  state.connectionRetryTimer = window.setTimeout(async () => {
    state.connectionRetryTimer = 0;
    if (!isForegroundPage()) return;
    if (!canStartConnectivityPing()) return;
    const online = await checkConnectivity({ sync: true });
    if (!online && isForegroundPage()) scheduleConnectivityRetry();
  }, delay);
}

function canStartConnectivityPing() {
  return Date.now() - state.connectionLastPingAt >= CONNECTION_MIN_PING_GAP_MS;
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
  state.connectionLastPingAt = Date.now();
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
    if (isForegroundPage()) {
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

  const items = readOutbox();
  const pending = items.length;
  const base = state.connectionOnline ? "Online" : "Offline";
  const text = pending ? `${base} · ${outboxSummaryLabel(items)}` : base;
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
  renderRecentPanel();
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
    renderRecentPanel();
    return;
  }
  pages[index] = {
    ...pages[index],
    source,
    savedAt: Date.now(),
  };
  writeRecentPages(pages);
  renderRecentPanel();
}

function readRecentEdits() {
  return readJson(RECENT_EDITS_KEY, []).filter((page) => page?.file);
}

function rememberRecentEdit(file) {
  if (!file || file === "NoPage") return;
  const edits = readRecentEdits();
  const cached = findCachedPage(file);
  const next = {
    file,
    savedAt: Date.now(),
    source: cached?.source || "",
  };
  writeJson(
    RECENT_EDITS_KEY,
    [next, ...edits.filter((page) => page.file !== file)].slice(0, RECENT_PAGE_LIMIT),
  );
  renderRecentPanel();
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
  schedulePagePrefetch(pages.map((page) => page.file));
}

function scheduleSearchResultPrefetch() {
  const paths = [...el("search-results").querySelectorAll("a[id]")]
    .slice(0, PAGE_PREFETCH_LIMIT)
    .map((link) => link.id);
  schedulePagePrefetch(paths);
}

function schedulePagePrefetch(paths) {
  const next = uniqueStrings(paths)
    .map((path) => String(path || "").trim())
    .filter(shouldPrefetchPage);
  if (!next.length) return;
  state.pagePrefetchQueue = uniqueStrings([...state.pagePrefetchQueue, ...next]);
  for (const path of next) state.pagePrefetchSeen.add(normalizePageAlias(path));
  schedulePrefetchRun();
}

function schedulePrefetchRun() {
  if (state.pagePrefetching || state.pagePrefetchScheduled) return;
  state.pagePrefetchScheduled = true;
  const run = () => {
    state.pagePrefetchScheduled = false;
    void prefetchQueuedPages();
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: PAGE_PREFETCH_IDLE_TIMEOUT_MS });
  } else {
    window.setTimeout(run, 240);
  }
}

function shouldPrefetchPage(path) {
  const normalized = normalizePageAlias(path);
  if (!normalized || normalized === "NoPage") return false;
  if (state.pagePrefetchSeen.has(normalized)) return false;
  return !findCachedPage(path)?.html;
}

async function prefetchQueuedPages() {
  if (state.pagePrefetching) return;
  state.pagePrefetching = true;
  try {
    const batch = state.pagePrefetchQueue.splice(0, PAGE_PREFETCH_LIMIT);
    for (const path of batch) {
      await prefetchPage(path);
    }
  } finally {
    state.pagePrefetching = false;
    if (state.pagePrefetchQueue.length) schedulePrefetchRun();
  }
}

async function prefetchPage(path) {
  try {
    const params = new URLSearchParams({ path });
    const response = await request(`/api/page?${params}`);
    if (!response.ok) return;
    const data = await response.json();
    if (data.file === "NoPage") return;
    rememberPage(data, path);
    void warmPageSource(data.file);
  } catch {
    // Best effort only; prefetch should never interrupt reading.
  }
}

function readSearchCache() {
  return readJson(SEARCH_CACHE_KEY, []).filter(
    (item) =>
      item &&
      typeof item.key === "string" &&
      typeof item.html === "string" &&
      Number.isInteger(item.page),
  );
}

function searchCacheKey(keyword, page) {
  return `${keyword.trim().toLowerCase()}\u0000${page}`;
}

function findCachedSearchResults(keyword, page) {
  const key = searchCacheKey(keyword, page);
  return readSearchCache().find((item) => item.key === key) || null;
}

function rememberSearchResults(keyword, page, html) {
  const key = searchCacheKey(keyword, page);
  const cache = readSearchCache();
  const next = {
    key,
    keyword: keyword.trim(),
    page,
    html,
    savedAt: Date.now(),
  };
  try {
    writeJson(
      SEARCH_CACHE_KEY,
      [next, ...cache.filter((item) => item.key !== key)].slice(0, SEARCH_CACHE_LIMIT),
    );
  } catch (error) {
    console.warn("Could not cache search results.", error);
  }
}

function readOutbox() {
  return readJson(OUTBOX_KEY, [])
    .filter((item) => item?.id && item?.type)
    .map(normalizeOutboxItem);
}

function normalizeOutboxItem(item) {
  const status = item.status === "syncing" && item.id !== state.outboxActiveItemId
    ? "pending"
    : item.status || (item.error ? "failed" : "pending");
  return {
    ...item,
    status,
    attempts: Number(item.attempts || 0),
    error: item.error || "",
  };
}

function writeOutbox(items) {
  writeJson(OUTBOX_KEY, items.map(normalizeOutboxItem));
  updateConnectionStatusLabel();
}

function newOutboxId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function queueOfflineMutation(type, payload) {
  const items = readOutbox();
  const id = payload.sync_id || newOutboxId();
  const queuedPayload =
    type === "entry" && !payload.sync_id ? { ...payload, sync_id: id } : payload;
  const item = {
    id,
    type,
    payload: queuedPayload,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attempts: 0,
    status: "pending",
    error: "",
  };
  if (type === "page") {
    const filtered = items.filter(
      (existing) =>
        existing.type !== "page" || existing.payload.file !== payload.file,
    );
    writeOutbox([...filtered, item]);
    scheduleOutboxSync();
    return item;
  }
  writeOutbox([...items, item]);
  scheduleOutboxSync();
  return item;
}

function updateOutboxItem(id, patch) {
  const items = readOutbox();
  const next = items.map((item) =>
    item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item,
  );
  writeOutbox(next);
}

function removeOutboxItem(id) {
  writeOutbox(readOutbox().filter((item) => item.id !== id));
}

function scheduleOutboxSync(delay = 250) {
  if (state.outboxSyncTimer) return;
  state.outboxSyncTimer = window.setTimeout(() => {
    state.outboxSyncTimer = 0;
    void syncOutbox();
  }, delay);
}

function resetFailedOutboxItems(id = "") {
  const items = readOutbox();
  writeOutbox(
    items.map((item) => {
      if (id && item.id !== id) return item;
      if (item.status !== "failed") return item;
      return { ...item, status: "pending", error: "", updatedAt: Date.now() };
    }),
  );
}

function pendingPageContent(file) {
  const item = [...readOutbox()]
    .reverse()
    .find((queued) => queued.type === "page" && queued.payload.file === file);
  return item?.payload.content ?? null;
}

async function syncOutbox() {
  if (state.syncingOutbox || !state.connectionOnline) return;
  if (!readOutbox().some((item) => item.status === "pending")) return;

  state.syncingOutbox = true;
  updateConnectionStatusLabel();
  try {
    while (state.connectionOnline) {
      const item = readOutbox().find((queued) => queued.status === "pending");
      if (!item) break;
      state.outboxActiveItemId = item.id;
      state.outboxAbortController = new AbortController();
      updateOutboxItem(item.id, {
        status: "syncing",
        error: "",
        attempts: item.attempts + 1,
        lastTriedAt: Date.now(),
      });
      try {
        await syncOutboxItem(item, { signal: state.outboxAbortController.signal });
        removeOutboxItem(item.id);
      } catch (error) {
        console.error(error);
        if (state.outboxCancelingIds.has(item.id)) {
          state.outboxCancelingIds.delete(item.id);
          removeOutboxItem(item.id);
          showToast("Sync item canceled.");
        } else {
          updateOutboxItem(item.id, {
            status: "failed",
            error: errorMessage(error),
          });
        }
        break;
      } finally {
        state.outboxAbortController = null;
        state.outboxActiveItemId = "";
      }
    }
  } finally {
    state.syncingOutbox = false;
    updateConnectionStatusLabel();
  }
}

function updateOutboxButton(pending = readOutbox().length) {
  const button = el("outbox-button");
  if (!button) return;
  const items = readOutbox();
  const failed = items.some((item) => item.status === "failed");
  const syncing = items.some((item) => item.status === "syncing");
  button.hidden = pending === 0;
  button.classList.toggle("has-error", failed);
  button.classList.toggle("is-syncing", syncing);
  setButtonIcon(button, "list-checks", String(pending));
  const label = outboxSummaryLabel(items);
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
  resetFailedOutboxItems();
  renderOutboxPanel();
  if (!readOutbox().length) return;
  showToast("Retrying sync.");
  const online = await checkConnectivity({ sync: false, allowHidden: true });
  if (online) scheduleOutboxSync(0);
  if (!online) showToast("Still offline.");
  renderOutboxPanel();
}

function handleOutboxListClick(event) {
  const retryButton = event.target.closest("button[data-outbox-retry]");
  if (retryButton) {
    resetFailedOutboxItems(retryButton.dataset.outboxRetry);
    renderOutboxPanel();
    scheduleOutboxSync(0);
    return;
  }
  const cancelButton = event.target.closest("button[data-outbox-cancel]");
  if (cancelButton) {
    cancelOutboxItem(cancelButton.dataset.outboxCancel);
    renderOutboxPanel();
    return;
  }
  const button = event.target.closest("button[data-outbox-delete]");
  if (!button) return;
  const id = button.dataset.outboxDelete;
  removeOutboxItem(id);
  renderOutboxPanel();
  showToast("Removed pending item.");
}

function renderOutboxPanel() {
  const items = readOutbox();
  el("outbox-count").textContent = outboxSummaryLabel(items);
  el("outbox-retry").disabled =
    !items.length ||
    state.syncingOutbox ||
    !items.some((item) => item.status === "pending" || item.status === "failed");
  if (!items.length) {
    el("outbox-list").innerHTML = '<p class="empty">Nothing waiting to sync.</p>';
    return;
  }
  el("outbox-list").innerHTML = items.map(outboxItemHtml).join("");
}

function outboxItemHtml(item) {
  const title = item.type === "page" ? "Page edit" : "Memo";
  const detail = outboxItemDetail(item);
  const status = outboxItemStatus(item);
  const error = item.error
    ? `<p class="outbox-item-error">${escapeHtml(item.error)}</p>`
    : "";
  const retry = status === "failed"
    ? `<button type="button" data-outbox-retry="${escapeHtmlAttr(item.id)}">${iconSvg("rotate-ccw")}<span>Retry</span></button>`
    : "";
  const cancel = status === "pending" || status === "syncing"
    ? `<button type="button" data-outbox-cancel="${escapeHtmlAttr(item.id)}">${iconSvg("x")}<span>Cancel</span></button>`
    : "";
  const del = status === "failed"
    ? `<button type="button" data-outbox-delete="${escapeHtmlAttr(item.id)}">${iconSvg("trash-2")}<span>Delete</span></button>`
    : "";
  return `
    <article class="outbox-item is-${escapeHtmlAttr(status)}">
      <div class="outbox-item-title">
        <span>${escapeHtml(title)}</span>
        <span>${escapeHtml(formatTime(item.createdAt))}</span>
      </div>
      <p class="outbox-item-status">${escapeHtml(outboxStatusLabel(item))}</p>
      <p class="outbox-item-detail">${escapeHtml(detail)}</p>
      ${error}
      <div class="outbox-item-actions">${retry}${cancel}${del}</div>
    </article>
  `;
}

function outboxSummaryLabel(items) {
  const pending = items.filter((item) => item.status === "pending").length;
  const syncing = items.filter((item) => item.status === "syncing").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const parts = [];
  if (syncing) parts.push(`${syncing} syncing`);
  if (pending) parts.push(`${pending} queued`);
  if (failed) parts.push(`${failed} failed`);
  if (!parts.length) return "0 pending";
  return parts.join(" · ");
}

function outboxItemStatus(item) {
  if (item.status === "syncing" && item.id !== state.outboxActiveItemId) {
    return "pending";
  }
  return item.status || "pending";
}

function outboxStatusLabel(item) {
  const status = outboxItemStatus(item);
  if (status === "syncing") return `Syncing${item.attempts ? ` · attempt ${item.attempts}` : ""}`;
  if (status === "failed") return `Failed${item.attempts ? ` · attempt ${item.attempts}` : ""}`;
  return item.attempts ? `Queued · ${item.attempts} tried` : "Queued";
}

function cancelOutboxItem(id) {
  if (state.outboxActiveItemId === id && state.outboxAbortController) {
    state.outboxCancelingIds.add(id);
    state.outboxAbortController.abort();
    return;
  }
  removeOutboxItem(id);
  showToast("Sync item canceled.");
}

function outboxItemDetail(item) {
  if (item.type === "page") {
    return item.payload?.file || "Untitled page";
  }
  const page = item.payload?.page?.trim() || state.appConfig.dailyDir;
  const text = firstLine(item.payload?.text || "");
  const image = item.payload?.image ? " + image" : "";
  return text ? `${page}: ${text}${image}` : `${page}${image}`;
}

function restoreAppConfig() {
  state.appConfig = normalizeAppConfig(readJson(APP_CONFIG_KEY, state.appConfig));
}

async function refreshAppConfig() {
  try {
    const response = await request("/api/app/config");
    if (!response.ok) throw new Error(await response.text());
    const config = normalizeAppConfig(await response.json());
    state.appConfig = config;
    localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.error(error);
  }
}

function normalizeAppConfig(config = {}) {
  const dailyDir = cleanRelPath(config.daily_dir || config.dailyDir || "Daily");
  const entryDir = cleanRelPath(config.entry_dir || config.entryDir || "Posts");
  const imageDir = cleanRelPath(config.image_dir || config.imageDir || "Pics");
  const todoFile = withMarkdownExtension(
    cleanRelPath(config.todo_file || config.todoFile || "Posts/todo.md"),
  );
  const todoPath = stripMarkdownExtension(
    cleanRelPath(config.todo_path || config.todoPath || todoFile),
  );
  return { dailyDir, entryDir, imageDir, todoPath, todoFile };
}

function cleanRelPath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
}

function withMarkdownExtension(value) {
  return value.endsWith(".md") ? value : `${value}.md`;
}

function stripMarkdownExtension(value) {
  return value.replace(/\.md$/, "");
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

async function syncOutboxItem(item, options = {}) {
  if (item.type === "entry") {
    const imageBlob = item.payload.image ? dataUrlToBlob(item.payload.image) : null;
    const response = imageBlob
      ? await request("/api/entry/multipart", {
          method: "POST",
          body: entryFormData(item.payload, imageBlob),
          signal: options.signal,
          timeoutMs: ENTRY_SYNC_TIMEOUT_MS,
        })
      : await request("/api/entry", {
          method: "POST",
          body: JSON.stringify(item.payload),
          signal: options.signal,
          timeoutMs: ENTRY_SYNC_TIMEOUT_MS,
        });
    const text = await response.text();
    if (text !== "ok") throw new Error(text);
    showToast(item.payload.image ? "Image memo synced." : "Memo synced.");
    if (item.payload.page === "todo" && state.view === "todo") {
      await loadTodo({ renderCache: false });
    }
    return;
  }

  if (item.type === "page") {
    const response = await request("/api/page", {
      method: "POST",
      body: JSON.stringify(item.payload),
      signal: options.signal,
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
  const { timeoutMs = 0, ...fetchOptions } = options;
  let timeout = 0;
  let timedOut = false;
  let signal = fetchOptions.signal;
  if (timeoutMs) {
    const controller = new AbortController();
    signal = controller.signal;
    if (fetchOptions.signal) {
      if (fetchOptions.signal.aborted) {
        controller.abort();
      } else {
        fetchOptions.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }
    }
    timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }
  let response;
  try {
    const headers = { ...(fetchOptions.headers || {}) };
    const hasContentType = Object.keys(headers).some(
      (key) => key.toLowerCase() === "content-type",
    );
    if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && !hasContentType) {
      headers["content-type"] = "application/json";
    }
    response = await fetch(path, {
      credentials: "same-origin",
      ...fetchOptions,
      headers,
      signal,
    });
    const fromOfflineCache = response.headers.get("x-obr-offline-cache") === "1";
    if (fromOfflineCache) {
      void checkConnectivity({ sync: true });
    } else if (response.ok) {
      setConnectionStatus(true);
    }
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error("Upload timed out. Draft kept.");
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    if (error?.name !== "AbortError") setConnectionStatus(false);
    throw error;
  } finally {
    if (timeout) window.clearTimeout(timeout);
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
  if (!(await prepareToLeavePageEditor())) return;
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
  if (!(await prepareToLeavePageEditor())) return;
  const { focusSearch = true, restoreScroll = true, updateHistory = true } = options;
  saveCurrentScrollPosition();
  state.view = name;
  for (const view of document.querySelectorAll(".view")) {
    view.hidden = true;
  }
  if (name === "todo") {
    clearPageOutline();
    updateReadingProgress();
    state.lastListView = "todo";
    el("todo-view").hidden = false;
    await loadTodo();
    if (restoreScroll) restoreViewScroll("todo");
    if (updateHistory) pushAppHistory({ view: "todo" });
    return;
  }
  if (name === "find") {
    clearPageOutline();
    updateReadingProgress();
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
  clearPageOutline();
  updateReadingProgress();
  el("day-view").hidden = false;
  renderRecentPanel();
  if (restoreScroll) restoreViewScroll("day");
  if (updateHistory) pushAppHistory({ view: "day" });
}

async function saveEntry() {
  if (!hasEntryContent()) {
    setEntryStatus("Empty post cannot be saved.");
    updateEntrySaveState();
    return;
  }
  const image = state.image;
  formatTextareaCjkSpacing(el("entry-text"));
  persistDraft();
  const payload = {
    sync_id: newOutboxId(),
    page: el("entry-page").value,
    links: el("entry-links").value,
    text: el("entry-text").value,
    image: "",
  };
  setEntrySaving(true);
  setEntryStatus("Saving locally...");
  try {
    if (image) payload.image = await blobToDataUrl(image);
    const item = queueOfflineMutation("entry", payload);
    resetEntry();
    setEntryStatus("");
    showToast(image ? "Saved locally. Image syncing..." : "Saved locally. Syncing...");
    scheduleOutboxSync(0);
    if (!item) throw new Error("Could not queue entry.");
  } catch (error) {
    console.error(error);
    const message = error.message ? `Local save failed: ${error.message}` : "Local save failed.";
    setEntryStatus(message);
  } finally {
    setEntrySaving(false);
  }
}

function entryFormData(payload, imageBlob = null) {
  const formData = new FormData();
  if (payload.sync_id) formData.append("sync_id", payload.sync_id);
  formData.append("page", payload.page);
  formData.append("links", payload.links);
  formData.append("text", payload.text);
  if (imageBlob) {
    formData.append("image", imageBlob, entryImageFileName(imageBlob));
  }
  return formData;
}

function entryImageFileName(blob) {
  const ext = blob.type === "image/png"
    ? "png"
    : blob.type === "image/gif"
      ? "gif"
      : blob.type === "image/webp"
        ? "webp"
        : blob.type === "image/heic"
          ? "heic"
          : blob.type === "image/heif"
            ? "heif"
            : "jpg";
  return `entry-image.${ext}`;
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

function handleEntryInput(event) {
  if (event?.target?.id === "entry-text") {
    formatTextareaCjkSpacing(event.target);
  }
  persistDraft();
  updateEntrySaveState();
  updateEntryMetaSummary();
}

function formatTextareaCjkSpacing(textarea) {
  if (!textarea) return false;
  const before = textarea.value;
  const after = addCjkSpacingToMarkdownText(before);
  if (after === before) return false;
  const selectionStart = textarea.selectionStart ?? before.length;
  const selectionEnd = textarea.selectionEnd ?? selectionStart;
  textarea.value = after;
  textarea.selectionStart = addCjkSpacingToMarkdownText(before.slice(0, selectionStart)).length;
  textarea.selectionEnd = addCjkSpacingToMarkdownText(before.slice(0, selectionEnd)).length;
  return true;
}

function addCjkSpacingToMarkdownText(text) {
  const source = String(text || "").replace(/\r\n?/g, "\n");
  const lines = source.split("\n");
  let inFence = false;
  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || /^\s*(?:>| {4}|\t)/.test(line)) return line;
      return addCjkSpacingToInlineText(line);
    })
    .join("\n");
}

function addCjkSpacingToInlineText(text) {
  const tokens = [];
  const protect = (value) => {
    const marker = `\u0000${tokens.length}\u0000`;
    tokens.push(value);
    return marker;
  };
  let value = String(text || "")
    .replace(/`[^`]*`/g, protect)
    .replace(/!\[\[[^\]]+\]\]/g, protect)
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, protect)
    .replace(/<(?:https?:\/\/|mailto:)[^>\s]+>/g, protect)
    .replace(/https?:\/\/\S+/g, protect);
  value = value
    .replace(/([\p{Script=Han}])([A-Za-z0-9])/gu, "$1 $2")
    .replace(/([A-Za-z0-9])([\p{Script=Han}])/gu, "$1 $2");
  tokens.forEach((token, index) => {
    value = value.replace(`\u0000${index}\u0000`, token);
  });
  return value;
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
  state.imageReadId += 1;
  state.image = "";
  clearEntryPreview();
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

function clearFileInputBeforePick(event) {
  event.currentTarget.value = "";
}

function handleImageFile(event) {
  const file = event.target.files[0];
  if (file) void readImage(file);
}

async function readImage(file) {
  if (!isLikelyImageFile(file)) {
    setEntryStatus("Selected file is not an image.");
    return;
  }
  const readId = state.imageReadId + 1;
  state.imageReadId = readId;
  state.image = "";
  clearEntryPreview();
  const previewUrl = setEntryPreviewBlob(file);
  state.entryImagePreparing = true;
  updateEntrySaveState();
  setEntryStatus("Preparing image...");
  try {
    const prepared = await prepareImage(file, previewUrl, (previewBlob) => {
      if (readId !== state.imageReadId) return;
      setEntryPreviewBlob(previewBlob);
    });
    if (readId !== state.imageReadId) return;
    state.image = prepared;
    setEntryPreviewBlob(prepared);
    updateEntrySaveState();
    setEntryStatus(imagePreparationStatus(file, state.image));
  } catch (error) {
    if (readId !== state.imageReadId) return;
    console.error(error);
    state.image = "";
    clearEntryPreview();
    updateEntrySaveState();
    setEntryStatus(error.message || "Could not prepare image.");
  } finally {
    if (readId !== state.imageReadId) return;
    state.entryImagePreparing = false;
    updateEntrySaveState();
  }
}

async function prepareImage(file, previewUrl, onPreview) {
  if (file.type === "image/gif") {
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error("GIF is too large to upload.");
    }
    return file;
  }

  let image;
  try {
    image = await loadImageForCompression(file, previewUrl);
  } catch (error) {
    if (!isHeicImage(file) && file.size <= MAX_ORIGINAL_IMAGE_UPLOAD_BYTES) {
      return file;
    }
    throw new Error("This image cannot be compressed here. Please choose a smaller JPEG/PNG image.");
  }

  try {
    let smallest = null;
    let previewSent = false;
    for (const maxDimension of MAX_IMAGE_DIMENSIONS) {
      const { width, height } = scaledDimensions(
        image.width,
        image.height,
        maxDimension,
      );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Could not process image.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      image.draw(context, width, height);

      for (const quality of IMAGE_JPEG_QUALITIES) {
        const compressed = await canvasToBlob(canvas, "image/jpeg", quality);
        if (!smallest || compressed.size < smallest.size) smallest = compressed;
        if (!previewSent && compressed.size <= MAX_IMAGE_UPLOAD_BYTES) {
          previewSent = true;
          onPreview?.(compressed);
        }
        if (compressed.size <= TARGET_IMAGE_UPLOAD_BYTES) {
          return compressed;
        }
      }
    }

    if (smallest && smallest.size <= MAX_IMAGE_UPLOAD_BYTES) {
      return smallest;
    }
    if (file.size <= MAX_ORIGINAL_IMAGE_UPLOAD_BYTES) {
      return file;
    }
    throw new Error("Image is too large after compression.");
  } finally {
    image.close?.();
  }
}

function scaledDimensions(width, height, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function isLikelyImageFile(file) {
  if (!file) return false;
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return (
    type.startsWith("image/") ||
    /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name) ||
    (!type && file.size > 0)
  );
}

function isHeicImage(file) {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return type === "image/heic" || type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

function imagePreparationStatus(file, prepared) {
  if (!prepared) return "";
  if (prepared === file) {
    if (file.type === "image/gif") {
      return `GIF ready: ${formatBytes(file.size)}.`;
    }
    return `Image ready: ${formatBytes(file.size)} original.`;
  }
  return `Image ready: ${formatBytes(prepared.size)} (was ${formatBytes(file.size)}).`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [meta, encoded] = String(dataUrl || "").split(",", 2);
  if (!meta?.startsWith("data:") || !encoded) {
    throw new Error("Queued image data is invalid.");
  }
  const mime = meta.slice(5).split(";", 1)[0] || "image/jpeg";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not process image."))),
      type,
      quality,
    );
  });
}

async function loadImageForCompression(file, previewUrl) {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmapForCompression(file);
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          width: bitmap.width,
          height: bitmap.height,
          draw: (context, width, height) => {
            context.drawImage(bitmap, 0, 0, width, height);
          },
          close: () => bitmap.close?.(),
        };
      }
      bitmap.close?.();
    } catch {
      // Fall back to HTMLImageElement decoding below.
    }
  }

  const image = await loadImage(previewUrl);
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error("This image format cannot be processed.");
  }
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    draw: (context, width, height) => {
      context.drawImage(image, 0, 0, width, height);
    },
    close: () => {},
  };
}

async function createImageBitmapForCompression(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return createImageBitmap(file);
  }
}

function clearEntryPreview() {
  state.imagePreviewLoadId += 1;
  if (state.imagePreviewUrl) {
    URL.revokeObjectURL(state.imagePreviewUrl);
    state.imagePreviewUrl = "";
  }
  const preview = el("entry-preview");
  preview.onload = null;
  preview.onerror = null;
  preview.removeAttribute("src");
  preview.hidden = true;
}

function setEntryPreviewBlob(blob) {
  const loadId = state.imagePreviewLoadId + 1;
  state.imagePreviewLoadId = loadId;
  if (state.imagePreviewUrl) {
    URL.revokeObjectURL(state.imagePreviewUrl);
  }
  const previewUrl = URL.createObjectURL(blob);
  state.imagePreviewUrl = previewUrl;
  const preview = el("entry-preview");
  preview.onload = null;
  preview.onerror = null;
  preview.removeAttribute("src");
  preview.alt = "Selected image preview";
  preview.hidden = true;
  void showEntryPreviewWhenReady(preview, blob, previewUrl, loadId);
  return previewUrl;
}

async function showEntryPreviewWhenReady(preview, blob, previewUrl, loadId) {
  let src = previewUrl;
  try {
    await loadImage(src);
  } catch {
    if (state.imagePreviewLoadId !== loadId) return;
    URL.revokeObjectURL(previewUrl);
    if (state.imagePreviewUrl === previewUrl) state.imagePreviewUrl = "";
    if (blob.size > MAX_IMAGE_UPLOAD_BYTES) return;
    try {
      src = await blobToDataUrl(blob);
      await loadImage(src);
    } catch {
      return;
    }
  }
  if (state.imagePreviewLoadId !== loadId) return;
  preview.src = src;
  preview.hidden = false;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("This image format cannot be processed."));
    image.src = url;
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
  const cached = append ? null : findCachedSearchResults(keyword, page);
  if (cached) renderSearchResults(cached.html);
  setSearchLoading(true);
  try {
    const response = await request(
      `/api/search?keyword=${encodeURIComponent(keyword)}&page=${page}`,
      { signal: controller.signal },
    );
    const html = await response.text();
    if (requestId !== state.searchRequestId) return;
    rememberSearchResults(keyword, page, html);
    if (!cached || cached.html !== html) {
      renderSearchResults(html, { append });
    }
    state.searchPage = page;
  } catch (error) {
    if (error?.name === "AbortError" || requestId !== state.searchRequestId) return;
    console.error(error);
    if (shouldQueueOffline(error)) {
      if (!cached) renderCachedSearchResults(keyword);
      return;
    }
    if (cached) {
      showToast("Showing cached search.");
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
      scheduleSearchResultPrefetch();
      return;
    }
  }
  results.innerHTML = `<ul>${html}</ul>`;
  scheduleSearchResultPrefetch();
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
  const todoPath = state.appConfig.todoPath;
  const cached = findCachedPage(todoPath);
  const cachedHtml = cachedPageHtml(cached);
  if (renderCache && cached) renderTodoHtml(cachedHtml, "No cached todos.");

  try {
    const response = await request("/api/page?query_type=todo");
    const data = await response.json();
    if (requestId !== state.todoRequestId) return;
    if (data.file !== "NoPage") {
      rememberPage(data, todoPath);
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

function renderRecentPanel() {
  const pages = readRecentPages().slice(0, 5);
  const edits = readRecentEdits().slice(0, 5);
  el("recent-pages").innerHTML = recentItemsHtml(pages, "No recent pages.");
  el("recent-edits").innerHTML = recentItemsHtml(edits, "No recent edits.");
  el("recent-panel").hidden = !pages.length && !edits.length;
  schedulePagePrefetch([...pages, ...edits].map((page) => page.file));
}

function recentItemsHtml(items, emptyMessage) {
  if (!items.length) return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  return items
    .map((item) => {
      const title = pageDisplayName(item.file);
      const meta = item.savedAt ? formatTime(item.savedAt) : "";
      return `<button class="recent-item" type="button" data-page="${escapeHtmlAttr(item.file)}" title="${escapeHtmlAttr(item.file)}"><span>${escapeHtml(title)}</span><small>${escapeHtml(meta)}</small></button>`;
    })
    .join("");
}

async function handleRecentPanelClick(event) {
  const button = event.target.closest("[data-page]");
  if (!button) return;
  event.preventDefault();
  await fetchPage(button.dataset.page, "find");
}

function pageDisplayName(file) {
  return String(file || "")
    .replace(/\.md$/, "")
    .split("/")
    .filter(Boolean)
    .pop() || file;
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
  if (!(await prepareToLeavePageEditor())) return;
  const { updateHistory = true, queryType = "", saveScroll = true } = options;
  if (saveScroll) saveCurrentScrollPosition();
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
        saveScroll: false,
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
    saveScroll: false,
    restoreReading: true,
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
    state.lastReadBlockIndex = -1;
    state.lastReadBlockFile = state.currentFile;
    state.currentContent = "";
    state.currentContentLoaded = true;
    showPage("NoPage", "No page yet.", sourceView, options);
    return;
  }
  state.currentFile = file;
  state.lastReadBlockIndex = -1;
  state.lastReadBlockFile = file;
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
  updatePageOutline();
  highlightPageContent(state.currentHighlightKeyword);
  el("page-content").hidden = false;
  el("page-editor").hidden = true;
  el("page-editor-shell").hidden = true;
  el("page-block-editor").innerHTML = "";
  setPageEditorStatus("");
  setButtonIcon(el("edit-button"), "pencil", "Edit");
  el("page-view").hidden = false;
  updateReadingProgress();
  if (title === "NoPage") {
    window.scrollTo(0, 0);
  } else if (restoreReading) {
    restoreReadingPosition(state.currentFile);
  }
  window.requestAnimationFrame(updateReadingProgress);
  if (updateHistory) {
    pushAppHistory({
      view: "page",
      file: state.currentFile || title,
      sourceView: state.lastListView,
      highlightKeyword: state.currentHighlightKeyword,
    });
  }
}

function clearPageOutline() {
  state.pageOutline = [];
  state.currentOutlineId = "";
  el("toc-button").hidden = true;
  closeTocPanel();
}

function updatePageOutline() {
  const content = el("page-content");
  const headings = [...content.querySelectorAll("h1, h2, h3")].filter((heading) =>
    heading.textContent.trim(),
  );
  const usedIds = new Set();
  state.pageOutline = headings.map((heading, index) => {
    let baseId = heading.id || `section-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    heading.id = id;
    usedIds.add(id);
    return {
      id: heading.id,
      level: Number(heading.tagName.slice(1)),
      text: heading.textContent.trim(),
    };
  });
  const show = state.pageOutline.length >= 2;
  el("toc-button").hidden = !show || state.view !== "page" || !el("page-editor").hidden;
  if (!show) closeTocPanel();
  updateActiveOutline();
}

function openTocPanel() {
  if (!state.pageOutline.length) return;
  updateActiveOutline();
  renderTocPanel();
  el("toc-panel").hidden = false;
}

function closeTocPanel() {
  const panel = el("toc-panel");
  if (panel) panel.hidden = true;
}

function renderTocPanel() {
  el("toc-list").innerHTML = state.pageOutline
    .map(
      (item) => `
        <button class="toc-item toc-level-${item.level}${item.id === state.currentOutlineId ? " is-active" : ""}" type="button" data-heading-id="${escapeHtmlAttr(item.id)}"${item.id === state.currentOutlineId ? ' aria-current="location"' : ""}>
          <span>${escapeHtml(item.text)}</span>
        </button>
      `,
    )
    .join("");
}

function updateActiveOutline() {
  if (state.view !== "page" || !state.pageOutline.length || !el("page-editor").hidden) {
    setActiveOutline("");
    return;
  }
  const markerY = stickyHeaderOffset() + 8;
  let activeId = state.pageOutline[0]?.id || "";
  for (const item of state.pageOutline) {
    const heading = document.getElementById(item.id);
    if (!heading) continue;
    if (heading.getBoundingClientRect().top <= markerY) {
      activeId = item.id;
    } else {
      break;
    }
  }
  setActiveOutline(activeId);
}

function setActiveOutline(id) {
  if (state.currentOutlineId === id) return;
  state.currentOutlineId = id;
  el("toc-list")
    ?.querySelectorAll("[data-heading-id]")
    .forEach((button) => {
      const active = button.dataset.headingId === id;
      button.classList.toggle("is-active", active);
      if (active) {
        button.setAttribute("aria-current", "location");
      } else {
        button.removeAttribute("aria-current");
      }
    });
}

function handleTocPanelClick(event) {
  if (event.target === el("toc-panel")) closeTocPanel();
}

function handleTocListClick(event) {
  const button = event.target.closest("[data-heading-id]");
  if (!button) return;
  const target = document.getElementById(button.dataset.headingId);
  if (!target) return;
  closeTocPanel();
  scrollToHeading(target);
}

function scrollToHeading(target) {
  const top =
    target.getBoundingClientRect().top + window.scrollY - stickyHeaderOffset();
  window.scrollTo({
    top: Math.max(0, top),
    behavior: "smooth",
  });
}

function stickyHeaderOffset() {
  const fixedTopElements = [document.querySelector(".topbar"), el("update-banner")];
  const bottom = fixedTopElements.reduce((max, element) => {
    if (!element || element.hidden) return max;
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return max;
    return Math.max(max, rect.bottom);
  }, 0);
  return Math.ceil(bottom + 12);
}

function rememberReadBlockFromPointer(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (el("page-content").hidden || !state.currentContent) return;
  const index = estimateEditorBlockIndexFromViewportY(event.clientY, state.currentContent);
  if (index < 0) return;
  state.lastReadBlockIndex = index;
  state.lastReadBlockFile = state.currentFile;
}

function initialEditorBlockIndex(source) {
  const blocks = splitMarkdownBlocks(source);
  if (!blocks.length) return 0;
  if (state.lastReadBlockFile === state.currentFile && state.lastReadBlockIndex >= 0) {
    return Math.min(state.lastReadBlockIndex, blocks.length - 1);
  }
  return estimateEditorBlockIndexFromViewportY(stickyHeaderOffset() + 24, source);
}

function estimateEditorBlockIndexFromViewportY(clientY, source) {
  const content = el("page-content");
  const blocks = splitMarkdownBlocks(source);
  if (!content || !blocks.length) return 0;
  const rect = content.getBoundingClientRect();
  const height = Math.max(rect.height, 1);
  const relativeY = clamp(clientY - rect.top, 0, height);
  const contentOffset = (relativeY / height) * String(source || "").length;
  let bestIndex = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (contentOffset >= block.start) bestIndex = index;
    if (contentOffset < block.end) return index;
  }
  return bestIndex;
}

async function toggleEdit() {
  const editor = el("page-editor");
  const editorShell = el("page-editor-shell");
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
    const initialBlockIndex = initialEditorBlockIndex(editor.value);
    editor.hidden = false;
    editorShell.hidden = false;
    renderBlockEditor({ activeIndex: initialBlockIndex });
    content.hidden = true;
    el("toc-button").hidden = true;
    closeTocPanel();
    updateReadingProgress();
    showPageDraftBanner(draft !== null);
    setPageEditorStatus("");
    setButtonIcon(button, "save", "Save");
    return;
  }
  commitActiveEditorBlock();
  editor.value = addCjkSpacingToMarkdownText(editor.value);
  persistPageDraft();
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
    rememberRecentEdit(state.currentFile);
    replaceAppHistory(currentAppHistoryEntry());
    clearPageDraft(state.currentFile);
    setDeferredMarkdownHtml(content, data.html || "");
    updatePageOutline();
    highlightPageContent(state.currentHighlightKeyword);
    editor.hidden = true;
    editorShell.hidden = true;
    el("page-block-editor").innerHTML = "";
    content.hidden = false;
    updateReadingProgress();
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
        rememberRecentEdit(state.currentFile);
        content.innerHTML = offlineSourcePreview(payload.content);
        updatePageOutline();
        editor.hidden = true;
        editorShell.hidden = true;
        el("page-block-editor").innerHTML = "";
        content.hidden = false;
        updateReadingProgress();
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

function handlePageEditorInput(event) {
  if (event?.target?.id === "page-editor") {
    formatTextareaCjkSpacing(event.target);
  }
  persistPageDraft();
  setPageEditorStatus(hasUnsavedPageEdit() ? "Unsaved draft." : "");
  renderBlockEditor({ activeIndex: state.activeEditorBlock });
}

function handlePageBlockEditorClick(event) {
  const block = event.target.closest(".editor-block");
  if (!block) return;
  activateEditorBlock(Number(block.dataset.blockIndex || 0));
}

function handlePageBlockEditorFocusOut(event) {
  const shell = el("page-editor-shell");
  if (shell.hidden || shell.contains(event.relatedTarget)) return;
  commitActiveEditorBlock();
}

function renderBlockEditor(options = {}) {
  const editor = el("page-editor");
  const blockEditor = el("page-block-editor");
  if (!editor || !blockEditor || editor.hidden) return;
  const blocks = splitMarkdownBlocks(editor.value);
  const activeIndex = Math.min(
    Math.max(Number(options.activeIndex ?? state.activeEditorBlock ?? -1), -1),
    blocks.length - 1,
  );
  state.activeEditorBlock = activeIndex;
  const activeBlock = blocks[activeIndex];
  state.activeEditorBlockStart = activeBlock ? activeBlock.start : -1;
  state.activeEditorBlockTextEnd = activeBlock ? activeBlock.textEnd : -1;
  blockEditor.innerHTML = blocks
    .map((block, index) => editorBlockHtml(block, index, index === activeIndex))
    .join("");
  enhanceMarkdownImages(blockEditor);
  if (activeIndex >= 0) {
    const active = blockEditor.querySelector(`[data-block-index="${activeIndex}"] textarea`);
    if (active && options.focus !== false) {
      active.addEventListener("input", () => updateActiveBlockFromTextarea(active));
      active.addEventListener("keydown", handleBlockTextareaKeydown);
      window.requestAnimationFrame(() => {
        active.focus();
        if (options.placeCursorAtEnd) {
          active.selectionStart = active.value.length;
          active.selectionEnd = active.value.length;
        }
        autoResizeBlockTextarea(active);
      });
    }
  }
}

function activateEditorBlock(index) {
  if (index === state.activeEditorBlock) return;
  commitActiveEditorBlock();
  renderBlockEditor({ activeIndex: index, placeCursorAtEnd: true });
}

function commitActiveEditorBlock() {
  const blockEditor = el("page-block-editor");
  const active = blockEditor?.querySelector(".editor-block.is-active textarea");
  if (!active) return;
  replaceSourceBlock(Number(active.dataset.blockIndex || 0), active.value);
  persistPageDraft();
  setPageEditorStatus(hasUnsavedPageEdit() ? "Unsaved draft." : "");
  state.activeEditorBlock = -1;
  renderBlockEditor({ activeIndex: -1, focus: false });
}

function updateActiveBlockFromTextarea(textarea) {
  formatTextareaCjkSpacing(textarea);
  replaceSourceBlock(Number(textarea.dataset.blockIndex || 0), textarea.value);
  persistPageDraft();
  setPageEditorStatus(hasUnsavedPageEdit() ? "Unsaved draft." : "");
  autoResizeBlockTextarea(textarea);
}

function replaceSourceBlock(index, value) {
  const editor = el("page-editor");
  const source = String(editor.value || "").replace(/\r\n?/g, "\n");
  const normalizedValue = String(value || "").replace(/\r\n?/g, "\n");
  let start = state.activeEditorBlockStart;
  let textEnd = state.activeEditorBlockTextEnd;

  if (index !== state.activeEditorBlock || start < 0 || textEnd < start || textEnd > source.length) {
    const blocks = splitMarkdownBlocks(source);
    const block = blocks[index];
    if (!block) return;
    start = block.start;
    textEnd = block.textEnd;
  }

  editor.value = `${source.slice(0, start)}${normalizedValue}${source.slice(textEnd)}`;
  state.activeEditorBlock = index;
  state.activeEditorBlockStart = start;
  state.activeEditorBlockTextEnd = start + normalizedValue.length;
}

function handleBlockTextareaKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    commitActiveEditorBlock();
  }
}

function autoResizeBlockTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(46, textarea.scrollHeight)}px`;
}

function splitMarkdownBlocks(source) {
  const text = String(source || "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return [{ text: "", separator: "", start: 0, textEnd: 0, end: 0 }];
  const blocks = [];
  const separatorPattern = /\n{2,}/g;
  let start = 0;
  let match;
  while ((match = separatorPattern.exec(text)) !== null) {
    const separatorStart = match.index;
    const separator = match[0];
    const firstSeparatorLength = separator.length >= 4 ? 2 : separator.length;
    blocks.push({
      text: text.slice(start, separatorStart),
      separator: separator.slice(0, firstSeparatorLength),
      start,
      textEnd: separatorStart,
      end: separatorStart + firstSeparatorLength,
    });

    let emptyStart = separatorStart + firstSeparatorLength;
    let remaining = separator.length - firstSeparatorLength;
    while (remaining >= 2) {
      const separatorLength = remaining === 3 ? 3 : 2;
      blocks.push({
        text: "",
        separator: separator.slice(
          emptyStart - separatorStart,
          emptyStart - separatorStart + separatorLength,
        ),
        start: emptyStart,
        textEnd: emptyStart,
        end: emptyStart + separatorLength,
      });
      emptyStart += separatorLength;
      remaining -= separatorLength;
    }
    start = separatorStart + separator.length;
  }
  blocks.push({
    text: text.slice(start),
    separator: "",
    start,
    textEnd: text.length,
    end: text.length,
  });
  return blocks.length ? blocks : [{ text: "", separator: "", start: 0, textEnd: 0, end: 0 }];
}

function joinMarkdownBlocks(blocks) {
  return blocks.map((block) => `${block.text}${block.separator || ""}`).join("");
}

function editorBlockHtml(block, index, active) {
  if (active) {
    return `<div class="editor-block is-active" data-block-index="${index}"><textarea class="editor-block-source" data-block-index="${index}" rows="1">${escapeTextarea(block.text)}</textarea></div>`;
  }
  const rendered = renderMarkdownBlock(block.text);
  return `<div class="editor-block" data-block-index="${index}" tabindex="0">${rendered}</div>`;
}

function escapeTextarea(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function renderMarkdownBlock(source) {
  const sourceText = String(source || "");
  if (!sourceText.trim()) {
    return '<p class="editor-preview-empty">Empty block</p>';
  }
  return renderMarkdownLines(sourceText);
}

function renderMarkdownLines(source) {
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listType = "";
  let listClass = "";
  let codeLines = null;

  const closeParagraph = () => {
    if (!paragraph.length) return;
    const renderedLines = paragraph
      .map((line) => renderInlineMarkdown(line.trim()))
      .filter((line) => line.length > 0);
    html.push(`<p>${renderedLines.join("<br>\n")}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = "";
    listClass = "";
  };
  const openList = (type, className = "") => {
    if (listType === type && listClass === className) return;
    closeParagraph();
    closeList();
    html.push(`<${type}${className ? ` class="${className}"` : ""}>`);
    listType = type;
    listClass = className;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    if (/^\s*```/.test(line)) {
      if (codeLines) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      } else {
        closeParagraph();
        closeList();
        codeLines = [];
      }
      continue;
    }
    if (codeLines) {
      codeLines.push(rawLine);
      continue;
    }
    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (task) {
      openList("ul", "editor-preview-task-list");
      const checked = task[1].toLowerCase() === "x" ? " checked" : "";
      html.push(`<li class="editor-preview-task"><input type="checkbox" disabled${checked}>${renderInlineMarkdown(task[2])}</li>`);
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      openList("ul");
      html.push(`<li>${renderInlineMarkdown(unordered[1])}</li>`);
      continue;
    }
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      openList("ol");
      html.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
      continue;
    }
    const quote = line.match(/^\s*>\s?(.+)$/);
    if (quote) {
      closeParagraph();
      closeList();
      html.push(`<blockquote><p>${renderInlineMarkdown(quote[1])}</p></blockquote>`);
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  closeParagraph();
  closeList();
  if (codeLines) html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  return html.join("\n");
}

function renderInlineMarkdown(text) {
  const tokens = [];
  const token = (html) => {
    const marker = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return marker;
  };
  let value = String(text || "")
    .replace(/`([^`]+)`/g, (_, code) => token(`<code>${escapeHtml(code)}</code>`))
    .replace(/!\[\[([^\]]+)\]\]/g, (_, raw) => token(renderEditorObsidianEmbed(raw)))
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
      token(renderEditorMarkdownImage(src, alt)),
    )
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => token(renderEditorMarkdownLink(label, href)))
    .replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, (_, href) => token(renderEditorMarkdownLink(href, href)))
    .replace(/\[\[([^\]]+)\]\]/g, (_, raw) => token(renderEditorWikiLink(raw)));
  value = escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
  tokens.forEach((html, index) => {
    value = value.replace(`\u0000${index}\u0000`, html);
  });
  return value;
}

function renderEditorMarkdownLink(label, href) {
  const cleanHref = sanitizeEditorLinkHref(href);
  if (!cleanHref) return escapeHtml(label);
  const external = /^(?:https?:)?\/\//i.test(cleanHref) || /^mailto:/i.test(cleanHref);
  const targetAttrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
  return `<a href="${escapeHtmlAttr(cleanHref)}"${targetAttrs}>${escapeHtml(label)}</a>`;
}

function renderEditorWikiLink(raw) {
  const [targetPart, labelPart] = String(raw || "").split("|");
  const target = targetPart.trim();
  if (!target) return escapeHtml(raw);
  const label = (labelPart || target).trim();
  return `<a href="#" data-page="${escapeHtmlAttr(target)}" class="editor-preview-wikilink">${escapeHtml(label)}</a>`;
}

function sanitizeEditorLinkHref(href) {
  const cleanHref = String(href || "").trim().replace(/^<|>$/g, "");
  if (!cleanHref) return "";
  if (/^(?:javascript|data|vbscript):/i.test(cleanHref)) return "";
  return cleanHref;
}

function renderEditorObsidianEmbed(raw) {
  const [targetPart, sizePart] = String(raw || "").split("|");
  const target = targetPart.trim();
  if (!target) return escapeHtml(raw);
  const fullSrc = `/images/${percentEncodePath(target)}`;
  if (isEditorPdfTarget(target)) {
    return `<span class="pdf-embed"><span class="pdf-icon" aria-hidden="true">PDF</span><span class="pdf-meta"><strong>${escapeHtml(target)}</strong><span>Open PDF</span></span><a class="pdf-link" href="${escapeHtmlAttr(fullSrc)}" target="_blank">Open PDF</a></span>`;
  }
  const previewSrc = `/image-preview/${percentEncodePath(target)}?w=900`;
  const attrs = editorImageSizeAttrs(sizePart);
  return `<img data-src="${escapeHtmlAttr(previewSrc)}" data-full-src="${escapeHtmlAttr(fullSrc)}" alt="${escapeHtmlAttr(target)}" loading="lazy" decoding="async" fetchpriority="low"${attrs}>`;
}

function renderEditorMarkdownImage(src, alt = "") {
  const cleanSrc = String(src || "").trim().replace(/^<|>$/g, "");
  if (!cleanSrc) return "";
  const attr = cleanSrc.startsWith("data:") ? "src" : "data-src";
  return `<img ${attr}="${escapeHtmlAttr(cleanSrc)}" alt="${escapeHtmlAttr(alt)}" loading="lazy" decoding="async" fetchpriority="low">`;
}

function isEditorPdfTarget(target) {
  return String(target || "")
    .split("#")[0]
    .split("?")[0]
    .toLowerCase()
    .endsWith(".pdf");
}

function editorImageSizeAttrs(size) {
  const value = String(size || "").trim();
  if (!value) return "";
  const [width, height] = value.split(/[xX]/).map((part) => part.trim());
  let attrs = "";
  if (/^\d+$/.test(width || "")) attrs += ` width="${width}"`;
  if (/^\d+$/.test(height || "")) attrs += ` height="${height}"`;
  return attrs;
}

function percentEncodePath(path) {
  return String(path || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function bindConfirmPanelEvents() {
  el("confirm-cancel").addEventListener("click", () => resolveConfirmPanel(false));
  el("confirm-ok").addEventListener("click", () => resolveConfirmPanel(true));
  el("confirm-panel").addEventListener("click", (event) => {
    if (event.target === el("confirm-panel")) resolveConfirmPanel(false);
  });
}

function showConfirmPanel({
  title,
  message,
  cancelText = "Cancel",
  confirmText = "OK",
  danger = false,
}) {
  if (state.confirmResolve) resolveConfirmPanel(false);
  el("confirm-title").textContent = title;
  el("confirm-message").textContent = message;
  el("confirm-cancel").textContent = cancelText;
  const ok = el("confirm-ok");
  ok.textContent = confirmText;
  ok.classList.toggle("danger", danger);
  el("confirm-panel").hidden = false;
  window.setTimeout(() => el("confirm-cancel").focus(), 0);
  return new Promise((resolve) => {
    state.confirmResolve = resolve;
  });
}

function resolveConfirmPanel(value) {
  const resolve = state.confirmResolve;
  if (!resolve) return;
  state.confirmResolve = null;
  el("confirm-panel").hidden = true;
  resolve(value);
}

function handleBeforeUnload(event) {
  saveCurrentScrollPosition();
  pauseConnectionMonitor();
  if (!hasUnsavedPageEdit()) return;
  event.preventDefault();
  event.returnValue = "";
}

async function prepareToLeavePageEditor() {
  if (!(await confirmDiscardUnsavedPageEdit())) return false;
  closePageEditor();
  return true;
}

async function confirmDiscardUnsavedPageEdit() {
  if (!hasUnsavedPageEdit()) return true;
  return showConfirmPanel({
    title: "Unsaved edits",
    message: "You have unsaved page edits. Leave without saving?",
    cancelText: "Keep editing",
    confirmText: "Leave",
  });
}

function hasUnsavedPageEdit() {
  const editor = el("page-editor");
  return !editor.hidden && editor.value !== state.currentContent;
}

function closePageEditor() {
  const editor = el("page-editor");
  if (editor.hidden) return;
  editor.hidden = true;
  el("page-editor-shell").hidden = true;
  el("page-block-editor").innerHTML = "";
  showPageDraftBanner(false);
  window.clearTimeout(state.editorPreviewTimer);
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

async function discardRestoredPageDraft() {
  if (!state.currentFile) return;
  const editor = el("page-editor");
  if (editor.hidden) return;
  const discard = await showConfirmPanel({
    title: "Discard draft?",
    message: "Discard this restored draft and reload the saved page source?",
    cancelText: "Keep draft",
    confirmText: "Discard draft",
    danger: true,
  });
  if (!discard) return;
  clearPageDraft(state.currentFile);
  editor.value = state.currentContent;
  showPageDraftBanner(false);
  setPageEditorStatus("");
  renderBlockEditor({ activeIndex: initialEditorBlockIndex(editor.value) });
  showToast("Draft discarded.");
}

function showPageDraftBanner(show) {
  el("page-draft-banner").hidden = !show;
}

function pageDraftKey(file) {
  return `obr.page-draft.${encodeURIComponent(file)}`;
}

function setPageEditorStatus(message) {
  el("page-editor-status").textContent = message;
  el("page-editor-status").hidden = !message;
}

function handleWindowScroll() {
  updateActiveOutline();
  updateReadingProgress();
  window.clearTimeout(state.scrollTimer);
  state.scrollTimer = window.setTimeout(saveCurrentScrollPosition, SCROLL_SAVE_MS);
}

function updateReadingProgress() {
  const progress = el("reading-progress");
  const bar = progress?.firstElementChild;
  if (!progress || !bar) return;
  if (state.view !== "page" || !el("page-editor").hidden) {
    progress.hidden = true;
    bar.style.transform = "scaleX(0)";
    return;
  }
  const scrollable =
    document.documentElement.scrollHeight - window.innerHeight;
  if (scrollable <= 24) {
    progress.hidden = true;
    bar.style.transform = "scaleX(0)";
    return;
  }
  const value = clamp(window.scrollY / scrollable, 0, 1);
  progress.hidden = false;
  bar.style.transform = `scaleX(${value})`;
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
  window.setTimeout(() => restorePageScroll(y), 800);
  window.setTimeout(() => restorePageScroll(y), 1600);
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
  if (!el("confirm-panel").hidden && event.key === "Escape") {
    event.preventDefault();
    resolveConfirmPanel(false);
    return;
  }
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
  if (isEditableTarget(event.target) || event.key !== "/" || event.altKey) return;
  event.preventDefault();
  void showView("find", { restoreScroll: false }).then(() =>
    focusSearchInput({ select: true }),
  );
}

function openRandomNote() {
  void fetchPage("", state.lastListView, "", { queryType: "rand" });
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
        enqueueMarkdownImage(deferredImageForObserverTarget(entry.target));
      }
    },
    { rootMargin: MARKDOWN_IMAGE_ROOT_MARGIN },
  );
  return state.imageObserver;
}

function observeDeferredMarkdownImage(img, observerTarget = img) {
  const observer = markdownImageObserver();
  if (observer) {
    observer.observe(observerTarget);
  } else {
    enqueueMarkdownImage(img);
  }
}

function deferredImageForObserverTarget(target) {
  if (target?.matches?.("img")) return target;
  return target?.querySelector?.("img[data-src]") || null;
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

function restoreLoadedImageUrls() {
  const urls = readJson(LOADED_IMAGE_URLS_KEY, []);
  state.loadedImageUrls = new Set(
    urls.filter((url) => typeof url === "string" && url).slice(-LOADED_IMAGE_URLS_LIMIT),
  );
}

function imageUrlWasLoaded(url) {
  return Boolean(url && state.loadedImageUrls.has(url));
}

function rememberLoadedImageUrl(url) {
  if (!url || state.loadedImageUrls.has(url)) return;
  state.loadedImageUrls.add(url);
  const urls = [...state.loadedImageUrls].slice(-LOADED_IMAGE_URLS_LIMIT);
  state.loadedImageUrls = new Set(urls);
  try {
    localStorage.setItem(LOADED_IMAGE_URLS_KEY, JSON.stringify(urls));
  } catch (error) {
    console.error(error);
  }
}

function enhanceMarkdownImages(root) {
  if (!root) return;
  for (const img of root.querySelectorAll("img")) {
    if (img.closest(".image-frame")) continue;
    const frame = document.createElement("span");
    const imageUrl = img.dataset.src || img.currentSrc || img.src;
    const seenBefore = imageUrlWasLoaded(imageUrl);
    frame.className = `image-frame image-loading${seenBefore ? " image-seen" : ""}`;
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
    placeholder.textContent = seenBefore ? "" : "Loading image";

    img.parentNode.insertBefore(frame, img);
    frame.append(placeholder, img);
    installImageLightboxTrigger(img);

    const finish = () => {
      finishMarkdownImageLoad(img);
      setLoadedImageFrameSize(frame, img);
      rememberLoadedImageUrl(img.dataset.src || img.currentSrc || img.src);
      frame.classList.remove("image-loading", "image-error", "image-seen");
      frame.classList.add("image-loaded");
      frame.removeAttribute("aria-busy");
    };
    const fail = () => {
      finishMarkdownImageLoad(img);
      frame.classList.remove("image-loading", "image-loaded", "image-seen");
      frame.classList.add("image-error");
      frame.removeAttribute("aria-busy");
      placeholder.textContent = "Image unavailable";
      scheduleConnectivityRetry(0);
    };

    img.addEventListener("load", finish, { once: true });
    img.addEventListener("error", fail, { once: true });
    if (img.dataset.src && !img.src) {
      observeDeferredMarkdownImage(img, frame);
    } else if (img.complete) {
      if (img.naturalWidth > 0 || img.naturalHeight > 0) {
        finish();
      } else {
        fail();
      }
    }
  }
}

function setLoadedImageFrameSize(frame, img) {
  if (!frame || !img) return;
  const hasWidth = Boolean(frame.style.getPropertyValue("--image-placeholder-width"));
  const hasHeight = Boolean(frame.style.getPropertyValue("--image-placeholder-height"));
  if (!hasWidth && img.naturalWidth > 0) {
    frame.style.setProperty("--image-placeholder-width", `${img.naturalWidth}px`);
  }
  if (!hasHeight && img.naturalHeight > 0) {
    frame.style.setProperty("--image-placeholder-height", `${img.naturalHeight}px`);
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
  const fullSrc = sourceImg.dataset.fullSrc || src;
  if (!src) return;
  const preview = el("image-lightbox-img");
  const loadId = state.imageLightboxLoadId + 1;
  state.imageLightboxLoadId = loadId;
  preview.src = src;
  preview.alt = sourceImg.alt || "Image preview";
  preview.classList.remove("is-dragging");
  preview.classList.toggle("is-loading-full", Boolean(fullSrc && fullSrc !== src));
  state.imageLightboxScale = 1;
  state.imageLightboxX = 0;
  state.imageLightboxY = 0;
  state.imageLightboxDrag = null;
  state.imageLightboxLastTap = null;
  state.imageLightboxSuppressZoomUntil = Date.now() + IMAGE_DOUBLE_TAP_MS;
  applyImageLightboxTransform();
  el("image-lightbox").hidden = false;
  document.body.classList.add("lightbox-open");
  if (fullSrc && fullSrc !== src) {
    loadFullLightboxImage(fullSrc, loadId);
  } else {
    setImageLightboxStatus("");
  }
  window.requestAnimationFrame(() => el("image-lightbox-close").focus());
}

function closeImageLightbox() {
  state.imageLightboxLoadId += 1;
  el("image-lightbox").hidden = true;
  document.body.classList.remove("lightbox-open");
  el("image-lightbox-img").removeAttribute("src");
  el("image-lightbox-img").classList.remove("is-loading-full");
  setImageLightboxStatus("");
  state.imageLightboxDrag = null;
}

function loadFullLightboxImage(src, loadId) {
  setImageLightboxStatus("Loading original...");
  const full = new Image();
  full.decoding = "async";
  full.onload = () => {
    if (state.imageLightboxLoadId !== loadId || el("image-lightbox").hidden) return;
    const preview = el("image-lightbox-img");
    preview.src = src;
    preview.classList.remove("is-loading-full");
    setImageLightboxStatus("");
    clampImageLightboxPan();
    applyImageLightboxTransform();
  };
  full.onerror = () => {
    if (state.imageLightboxLoadId !== loadId || el("image-lightbox").hidden) return;
    el("image-lightbox-img").classList.remove("is-loading-full");
    setImageLightboxStatus("Original unavailable. Showing preview.");
    scheduleConnectivityRetry(0);
  };
  full.src = src;
}

function setImageLightboxStatus(message) {
  const status = el("image-lightbox-status");
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
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
