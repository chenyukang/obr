const state = {
  view: "day",
  lastListView: "day",
  currentFile: "",
  currentContent: "",
  currentBlocks: [],
  currentContentLoaded: false,
  currentHighlightKeyword: "",
  image: "",
  imagePreviewUrl: "",
  imagePreviewLoadId: 0,
  imageReadId: 0,
  searchTimer: 0,
  editorBlocks: [],
  editorMode: "closed",
  editorRenderRequestId: 0,
  activeEditorBlock: -1,
  lastReadBlockIndex: -1,
  lastReadBlockFile: "",
  searchController: null,
  searchRequestId: 0,
  searchPage: 0,
  rssSearchTimer: 0,
  pageController: null,
  pageRequestId: 0,
  todoRequestId: 0,
  rssFilter: "unread",
  rssItemsRequestId: 0,
  rssItemRequestId: 0,
  rssSummaryRequestId: 0,
  rssDetailRenderId: 0,
  rssItemsCache: new Map(),
  rssItemCache: new Map(),
  rssSelectedItemId: "",
  rssCurrentFeedId: "",
  rssCurrentFeedTitle: "",
  rssCurrentStarred: false,
  rssRefreshing: false,
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
  appHistoryIndex: 0,
  appHistoryMaxIndex: 0,
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
const RSS_ITEMS_PAGE_SIZE = 20;
const RSS_IFRAME_SANDBOX = "allow-popups";
const OUTBOX_KEY = "obr.offline.outbox";
const APP_CONFIG_KEY = "obr.app-config";
const CLIENT_ID_KEY = "obr.client-id";
const LOADED_IMAGE_URLS_KEY = "obr.loaded-image-urls";
const LOADED_IMAGE_URLS_LIMIT = 600;
const EMPTY_BLOCK_HTML = '<p class="editor-preview-empty">Empty block</p>';

const ICONS = {
  "arrow-left": '<path d="M19 12H5"></path><path d="m12 19-7-7 7-7"></path>',
  "book-open":
    '<path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path>',
  "calendar-days":
    '<path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path><path d="M8 18h.01"></path><path d="M12 18h.01"></path><path d="M16 18h.01"></path>',
  camera:
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"></path><circle cx="12" cy="13" r="3"></circle>',
  check: '<path d="M20 6 9 17l-5-5"></path>',
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
  rss: '<path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1"></circle>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M17 21v-7H7v7"></path><path d="M7 3v5h8"></path>',
  search:
    '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>',
  shuffle:
    '<path d="m18 14 4 4-4 4"></path><path d="m18 2 4 4-4 4"></path><path d="M2 18h1.9a6 6 0 0 0 5.2-3l5.8-10A6 6 0 0 1 20.1 2H22"></path><path d="M2 6h1.9a6 6 0 0 1 5.2 3l.7 1.2"></path><path d="M14.9 19a6 6 0 0 0 5.2 3H22"></path>',
  sparkles:
    '<path d="M11.5 2.5 13 8l5.5 1.5L13 11l-1.5 5.5L10 11 4.5 9.5 10 8z"></path><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"></path><path d="M5 14l.7 1.8L7.5 16.5l-1.8.7L5 19l-.7-1.8-1.8-.7 1.8-.7z"></path>',
  star:
    '<path d="M11.5 2.8a.55.55 0 0 1 1 0l2.3 4.7a2.1 2.1 0 0 0 1.6 1.2l5.2.8a.55.55 0 0 1 .3.9l-3.8 3.7a2.1 2.1 0 0 0-.6 1.9l.9 5.2a.55.55 0 0 1-.8.6L13 19.3a2.1 2.1 0 0 0-2 0l-4.6 2.4a.55.55 0 0 1-.8-.6l.9-5.2a2.1 2.1 0 0 0-.6-1.9L2.1 10.4a.55.55 0 0 1 .3-.9l5.2-.8a2.1 2.1 0 0 0 1.6-1.2z"></path>',
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
  el("entry-text").addEventListener("compositionstart", handleTextareaCompositionStart);
  el("entry-text").addEventListener("compositionend", handleEntryTextCompositionEnd);
  el("entry-page").addEventListener("input", handleEntryInput);
  el("entry-links").addEventListener("input", handleEntryInput);
  el("entry-meta").addEventListener("toggle", updateEntryMetaSummary);
  el("entry-text").addEventListener("paste", handlePaste);
  el("entry-image-file").addEventListener("click", clearFileInputBeforePick);
  el("entry-camera-file").addEventListener("click", clearFileInputBeforePick);
  el("entry-image-file").addEventListener("change", handleImageFile);
  el("entry-camera-file").addEventListener("change", handleImageFile);
  el("page-editor").addEventListener("input", handlePageEditorInput);
  el("page-editor").addEventListener("compositionstart", handleTextareaCompositionStart);
  el("page-editor").addEventListener("compositionend", handlePageEditorCompositionEnd);
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

  document.querySelectorAll("[data-rss-filter]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.rssFilter = button.dataset.rssFilter || "unread";
      updateRssFilterButtons();
      await loadRssItems({ preferCache: true });
    });
  });
  el("rss-search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    window.clearTimeout(state.rssSearchTimer);
    await loadRssItems({ preferCache: true });
  });
  el("rss-search-input").addEventListener("input", () => {
    updateRssSearchClear();
    window.clearTimeout(state.rssSearchTimer);
    state.rssSearchTimer = window.setTimeout(() => loadRssItems({ preferCache: true }), 180);
  });
  el("rss-search-input").addEventListener("keydown", async (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      await clearRssSearch();
    }
  });
  el("rss-search-clear").addEventListener("click", clearRssSearch);
  el("rss-refresh-button").addEventListener("click", refreshRss);
  el("rss-list").addEventListener("click", handleRssListClick);

  el("back-button").addEventListener("click", goBackToLastList);
  el("edit-button").addEventListener("click", toggleEdit);
  el("rss-star-button").addEventListener("click", toggleCurrentRssStar);
  el("rss-unsubscribe-button").addEventListener("click", unsubscribeCurrentRssFeed);
  el("page-new-block-button").addEventListener("click", openNewBlockAtEnd);

  el("page-content").addEventListener("pointerup", rememberReadBlockFromPointer);
  el("page-content").addEventListener("click", async (event) => {
    const blockEdit = event.target.closest("[data-page-block-action='edit']");
    if (blockEdit) {
      event.preventDefault();
      await openBlockEditorAt(Number(blockEdit.dataset.blockIndex || 0));
      return;
    }

    const rssSummary = event.target.closest("[data-rss-summary]");
    if (rssSummary) {
      event.preventDefault();
      await summarizeCurrentRssItem(rssSummary);
      return;
    }

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
    historyIndex: state.appHistoryIndex,
    ...entry,
  };
}

function replaceAppHistory(entry) {
  if (!state.historyReady) return;
  window.history.replaceState(appHistoryState(entry), "", location.href);
}

function pushAppHistory(entry) {
  if (!state.historyReady || state.applyingHistory) return;
  const nextIndex = state.appHistoryIndex + 1;
  const next = {
    ...appHistoryState(entry),
    historyIndex: nextIndex,
  };
  if (sameAppHistoryState(window.history.state, next)) return;
  state.appHistoryIndex = nextIndex;
  state.appHistoryMaxIndex = nextIndex;
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
    if (Number.isFinite(target.historyIndex)) {
      state.appHistoryIndex = target.historyIndex;
    }
    if (target.view === "page" && target.file) {
      if (target.file.startsWith("rss:")) {
        await openRssItem(target.file.slice(4), { updateHistory: false });
        return;
      }
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
    const pendingContent = pendingPageContent(recent.file);
    state.currentContent = pendingContent ?? recent.source ?? "";
    state.currentBlocks =
      pendingContent !== null
        ? []
        : normalizeEditorBlocks(recent.blocks || [], { fallback: false });
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
    source: source ?? data.source ?? existing?.source ?? "",
    blocks: normalizeEditorBlocks(data.blocks || existing?.blocks || [], { fallback: false }),
    aliases: uniqueStrings([...(existing?.aliases || []), ...aliases]),
    savedAt: Date.now(),
  };
  writeRecentPages([
    next,
    ...pages.filter((page) => page.file !== data.file),
  ]);
  renderRecentPanel();
}

function rememberPageSource(file, source, blocks = null) {
  if (!file || file === "NoPage") return;
  const pages = readRecentPages();
  const normalizedBlocks = Array.isArray(blocks) && blocks.length
    ? normalizeEditorBlocks(blocks, { fallback: false })
    : null;
  const index = pages.findIndex((page) => page.file === file);
  if (index === -1) {
    writeRecentPages([
      {
        file,
        html: "",
        source,
        blocks: normalizedBlocks || [],
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
    blocks: normalizedBlocks || pages[index].blocks || [],
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

function cachedPageBlocks(file) {
  const blocks = findCachedPage(file)?.blocks;
  return Array.isArray(blocks) && blocks.length
    ? normalizeEditorBlocks(blocks, { fallback: false })
    : [];
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
      state.currentBlocks = normalizeEditorBlocks(data.blocks || [], { fallback: false });
      state.currentContentLoaded = true;
      if (joinEditorBlocks(state.editorBlocks) === item.payload.content) {
        clearPageDraft(data.file);
      }
      if (el("page-editor").hidden) {
        setPageContentHtml(data.html || "");
        updatePageOutline();
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
  if (name === "rss") {
    clearPageOutline();
    updateReadingProgress();
    state.lastListView = "rss";
    el("rss-view").hidden = false;
    updateRssFilterButtons();
    updateRssSearchClear();
    await loadRssItems({ preferCache: true });
    if (restoreScroll) restoreViewScroll("rss");
    if (updateHistory) pushAppHistory({ view: "rss" });
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
    formatTextareaCjkSpacing(event.target, { event });
  }
  persistDraft();
  updateEntrySaveState();
  updateEntryMetaSummary();
}

function handleEntryTextCompositionEnd(event) {
  finishTextareaComposition(event);
  persistDraft();
  updateEntrySaveState();
}

function handleTextareaCompositionStart(event) {
  if (event?.target?.dataset) event.target.dataset.composing = "1";
}

function finishTextareaComposition(event) {
  const textarea = event?.target || event?.currentTarget;
  if (!textarea) return false;
  if (textarea.dataset) delete textarea.dataset.composing;
  return formatTextareaCjkSpacing(textarea, { force: true });
}

function formatTextareaCjkSpacing(textarea, options = {}) {
  if (!textarea) return false;
  if (!options.force && isTextareaComposing(textarea, options.event)) return false;
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

function isTextareaComposing(textarea, event = null) {
  return Boolean(
    event?.isComposing ||
      event?.inputType === "insertCompositionText" ||
      textarea?.dataset?.composing === "1",
  );
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

async function loadRssItems(options = {}) {
  const { force = false, preferCache = false, append = false } = options;
  const requestId = state.rssItemsRequestId + 1;
  state.rssItemsRequestId = requestId;
  const cacheKey = rssItemsCacheKey();
  const cachedPage = state.rssItemsCache.get(cacheKey);
  const renderedCache = Boolean(cachedPage && preferCache && !append);
  if (renderedCache) {
    renderRssItemsPage(cachedPage);
    setRssStatus("");
  }
  const offset = append ? cachedPage?.nextOffset : 0;
  if (append && offset == null) return;
  if (!renderedCache || append) {
    setRssStatus(append ? "Loading more RSS..." : "Loading RSS...", "loading");
  }
  try {
    const params = new URLSearchParams({
      state: state.rssFilter,
      limit: String(RSS_ITEMS_PAGE_SIZE),
      offset: String(offset || 0),
    });
    const query = rssSearchQuery();
    if (query) params.set("q", query);
    const response = await request(`/api/rss/items?${params}`);
    if (!response.ok) throw new Error(await response.text());
    const page = normalizeRssItemsPage(await response.json());
    if (requestId !== state.rssItemsRequestId) return;
    const nextPage = append
      ? {
          items: [...(cachedPage?.items || []), ...page.items],
          nextOffset: page.nextOffset,
      }
      : page;
    state.rssItemsCache.set(cacheKey, nextPage);
    const changed = append || !cachedPage || !sameRssItemsPage(cachedPage, nextPage);
    if (changed || !renderedCache || force) {
      renderRssItemsPage(nextPage);
    }
    setRssStatus("");
  } catch (error) {
    if (requestId !== state.rssItemsRequestId) return;
    console.error(error);
    if (renderedCache) {
      setRssStatus("");
      showToast(error.message || "RSS update failed.");
    } else {
      if (!cachedPage) renderRssItemsPage({ items: [], nextOffset: null });
      setRssStatus(error.message || "RSS loading failed.", "error");
    }
  }
}

function normalizeRssItemsPage(payload) {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      nextOffset: payload.length >= RSS_ITEMS_PAGE_SIZE ? payload.length : null,
    };
  }
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    nextOffset: Number.isInteger(payload?.next_offset) ? payload.next_offset : null,
  };
}

function sameRssItemsPage(left, right) {
  return rssItemsPageSignature(left) === rssItemsPageSignature(right);
}

function rssItemsPageSignature(page) {
  return JSON.stringify({
    items: page?.items || [],
    nextOffset: page?.nextOffset ?? null,
  });
}

function renderRssItemsPage(page) {
  renderRssItems(page.items, { nextOffset: page.nextOffset });
}

function renderRssItems(items, options = {}) {
  const list = el("rss-list");
  if (!items.length) {
    const empty = rssSearchQuery()
      ? "No RSS matches."
      : state.rssFilter === "unread"
        ? "No unread items."
        : "No RSS items.";
    list.innerHTML = `<p class="empty">${empty}</p>`;
    markSelectedRssItem();
    return;
  }
  list.innerHTML = `${items.map(rssItemHtml).join("")}${rssMoreHtml(options.nextOffset, items.length)}`;
  markSelectedRssItem();
}

function rssMoreHtml(nextOffset, shown) {
  if (nextOffset == null) return "";
  return `
    <div class="rss-more-row">
      <button class="rss-more" type="button" data-rss-more="${escapeHtmlAttr(nextOffset)}">
        More <span>${escapeHtml(shown)}</span>
      </button>
    </div>
  `;
}

function rssItemHtml(item) {
  const active = item.id === state.rssSelectedItemId ? " is-active" : "";
  const read = item.read_at ? " is-read" : "";
  const meta = [
    item.feed_title,
    formatTime(item.published_at || item.updated_at || item.first_seen_at),
  ]
    .filter(Boolean)
    .join(" · ");
  const summary = firstLine(item.summary_md || "");
  const readButton = item.read_at
    ? ""
    : `<button class="rss-item-read-button" type="button" data-rss-mark-read="${escapeHtmlAttr(item.id)}" aria-label="Mark read" title="Mark read">${iconSvg("check")}</button>`;
  return `
    <div class="rss-item${active}${read}" data-rss-row="${escapeHtmlAttr(item.id)}">
      <button class="rss-item-main" type="button" data-rss-item="${escapeHtmlAttr(item.id)}">
        <span class="rss-item-title">${escapeHtml(item.title || "Untitled")}</span>
        <span class="rss-item-meta">${escapeHtml(meta)}</span>
        ${summary ? `<span class="rss-item-summary">${escapeHtml(summary)}</span>` : ""}
      </button>
      ${readButton}
    </div>
  `;
}

function rssItemPreviewFromRow(row) {
  if (!row) return {};
  return {
    title: row.querySelector(".rss-item-title")?.textContent?.trim() || "",
    meta: row.querySelector(".rss-item-meta")?.textContent?.trim() || "",
  };
}

async function handleRssListClick(event) {
  const moreButton = event.target.closest("[data-rss-more]");
  if (moreButton) {
    event.preventDefault();
    moreButton.disabled = true;
    await loadRssItems({ append: true });
    return;
  }
  const readButton = event.target.closest("[data-rss-mark-read]");
  if (readButton) {
    event.preventDefault();
    await markRssItemReadFromList(readButton.dataset.rssMarkRead, readButton);
    return;
  }
  const button = event.target.closest("[data-rss-item]");
  if (!button) return;
  event.preventDefault();
  await openRssItem(button.dataset.rssItem, {
    preview: rssItemPreviewFromRow(button.closest("[data-rss-row]")),
  });
}

async function markRssItemReadFromList(id, button) {
  if (!id) return;
  button.disabled = true;
  try {
    const response = await request(`/api/rss/items/${encodeURIComponent(id)}/read`, {
      method: "POST",
      body: JSON.stringify({ read: true }),
    });
    if (!response.ok) throw new Error(await response.text());
    clearRssItemsCache();
    updateCachedRssItem(id, { read_at: new Date().toISOString() });
    if (state.rssFilter === "unread") {
      button.closest("[data-rss-row]")?.remove();
      if (!el("rss-list").querySelector("[data-rss-row]")) {
        await loadRssItems({ force: true });
      }
    } else {
      markRssRowRead(id);
    }
  } catch (error) {
    console.error(error);
    button.disabled = false;
    setRssStatus(error.message || "Mark read failed.", "error");
  }
}

async function openRssItem(id, options = {}) {
  if (!id) return;
  const { updateHistory = true, preview = {} } = options;
  const requestId = state.rssItemRequestId + 1;
  state.rssItemRequestId = requestId;
  state.rssSelectedItemId = id;
  markSelectedRssItem();
  const cachedItem = state.rssItemCache.get(id);
  const renderedCache = Boolean(cachedItem);
  if (cachedItem) {
    renderRssDetailPage(cachedItem, { updateHistory, saveScroll: false });
    markSelectedRssItem(Boolean(cachedItem.read_at));
    setRssStatus("");
  } else {
    renderRssDetailShell(id, preview, { updateHistory });
    setRssStatus("Opening RSS item...", "loading");
  }
  try {
    const response = await request(`/api/rss/items/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(await response.text());
    const item = await response.json();
    if (requestId !== state.rssItemRequestId) return;
    const changed = !cachedItem || !sameRssItemDetail(cachedItem, item);
    state.rssItemCache.set(id, item);
    if (changed || !renderedCache) {
      if (!renderedCache) setRssStatus("Rendering RSS item...", "loading");
      await nextFrame();
      if (requestId !== state.rssItemRequestId) return;
      renderRssDetailPage(item, { updateHistory: false, saveScroll: false });
    }
    markSelectedRssItem(true);
    setRssStatus("");
  } catch (error) {
    if (requestId !== state.rssItemRequestId) return;
    console.error(error);
    if (renderedCache) {
      setRssStatus("");
      showToast(error.message || "RSS item update failed.");
    } else {
      setRssStatus(error.message || "RSS item failed.", "error");
    }
  }
}

function sameRssItemDetail(left, right) {
  return rssItemDetailSignature(left) === rssItemDetailSignature(right);
}

function rssItemDetailSignature(item) {
  return JSON.stringify({
    id: item?.id || "",
    feed_id: item?.feed_id || "",
    feed_title: item?.feed_title || "",
    feed_url: item?.feed_url || "",
    title: item?.title || "",
    url: item?.url || "",
    author: item?.author || "",
    published_at: item?.published_at || "",
    updated_at: item?.updated_at || "",
    first_seen_at: item?.first_seen_at || "",
    fetched_at: item?.fetched_at || "",
    read_at: item?.read_at || "",
    starred_at: item?.starred_at || "",
    ai_summary_zh: item?.ai_summary_zh || "",
    ai_summary_model: item?.ai_summary_model || "",
    ai_summary_at: item?.ai_summary_at || "",
    content_source: item?.content_source || "",
    extraction_quality: item?.extraction_quality ?? null,
    html: item?.html || "",
  });
}

function renderRssDetailShell(id, preview = {}, options = {}) {
  state.rssSelectedItemId = id;
  state.rssCurrentFeedId = "";
  state.rssCurrentFeedTitle = "";
  state.rssCurrentStarred = false;
  state.currentFile = `rss:${id}`;
  state.currentContent = "";
  state.currentBlocks = [];
  state.currentContentLoaded = false;
  state.currentHighlightKeyword = "";
  const meta = preview.meta ? `<p class="rss-detail-meta">${escapeHtml(preview.meta)}</p>` : "";
  showPage(
    preview.title || "RSS item",
    `${meta}<div class="rss-detail-loading"><span></span><p>Loading item...</p></div>`,
    "rss",
    { ...options, editable: false, restoreReading: false, deferEnhancements: true },
  );
}

function renderRssDetailPage(item, options = {}) {
  const renderId = state.rssDetailRenderId + 1;
  state.rssDetailRenderId = renderId;
  state.rssSelectedItemId = item.id;
  state.rssCurrentFeedId = item.feed_id || "";
  state.rssCurrentFeedTitle = item.feed_title || item.feed_url || "";
  state.rssCurrentStarred = Boolean(item.starred_at);
  state.currentFile = `rss:${item.id}`;
  state.currentContent = item.content_markdown || "";
  state.currentBlocks = [];
  state.currentContentLoaded = true;
  state.currentHighlightKeyword = "";
  const publishedAt = formatTime(item.published_at || item.first_seen_at);
  const feedSource = item.feed_title || item.feed_url || "Unknown feed";
  const feedSourceHtml = item.feed_url
    ? `<span>Source: <a href="${escapeHtmlAttr(item.feed_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(feedSource)}</a></span>`
    : `<span>Source: ${escapeHtml(feedSource)}</span>`;
  const metaHtml = `
    <p class="rss-detail-meta">
      ${feedSourceHtml}
      ${publishedAt ? `<span>${escapeHtml(publishedAt)}</span>` : ""}
      ${item.url ? `<a href="${escapeHtmlAttr(item.url)}" target="_blank" rel="noopener noreferrer">Original</a>` : ""}
      ${rssSummaryActionHtml(item)}
    </p>
  `;
  const bodyHtml = item.html?.trim() ? item.html : '<p class="empty">No content.</p>';
  showPage(
    item.title || "Untitled",
    `${metaHtml}${rssAiSummaryHtml(item)}<div class="rss-detail-frame-shell" data-rss-frame-root></div>`,
    "rss",
    { ...options, editable: false, restoreReading: false, deferEnhancements: true },
  );
  renderRssSandboxFrame(
    el("page-content").querySelector("[data-rss-frame-root]"),
    bodyHtml,
    item.title || "RSS content",
  );
  scheduleRssDetailEnhancements(renderId);
  updateRssPageActions();
}

function rssAiSummaryHtml(item) {
  const summary = (item?.ai_summary_zh || "").trim();
  if (!summary) return "";
  const model = (item?.ai_summary_model || "").trim();
  const meta = model ? `<span>${escapeHtml(model)}</span>` : "";
  return `
    <details class="rss-ai-summary">
      <summary><strong>中文总结</strong>${meta}</summary>
      <p>${escapeHtml(summary).replace(/\n/g, "<br>")}</p>
    </details>
  `;
}

function rssSummaryActionHtml(item) {
  if ((item?.ai_summary_zh || "").trim()) return "";
  if (!item?.id) return "";
  return `<button class="rss-summary-button" type="button" data-rss-summary="${escapeHtmlAttr(item.id)}">${iconSvg("sparkles")}<span>Summary</span></button>`;
}

async function summarizeCurrentRssItem(button) {
  const id = button?.dataset?.rssSummary || state.rssSelectedItemId;
  if (!id) return;
  const requestId = state.rssSummaryRequestId + 1;
  state.rssSummaryRequestId = requestId;
  button.disabled = true;
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  button.innerHTML = `${iconSvg("loader")}<span>Summarizing</span>`;
  renderRssSummaryPending();
  setRssStatus("Summarizing RSS item...", "loading");
  try {
    const response = await request(`/api/rss/items/${encodeURIComponent(id)}/summary`, {
      method: "POST",
      body: JSON.stringify({}),
      timeoutMs: 120000,
    });
    if (!response.ok) throw new Error(await response.text());
    const item = await response.json();
    if (requestId !== state.rssSummaryRequestId) return;
    state.rssItemCache.set(id, item);
    renderRssDetailPage(item, { updateHistory: false, saveScroll: false });
    setRssStatus("");
    showToast("Summary ready.");
  } catch (error) {
    if (requestId !== state.rssSummaryRequestId) return;
    console.error(error);
    button.disabled = false;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
    button.innerHTML = `${iconSvg("sparkles")}<span>Summary</span>`;
    clearRssSummaryPending();
    setRssStatus(error.message || "Summary failed.", "error");
  }
}

function renderRssSummaryPending() {
  const content = el("page-content");
  if (!content || content.querySelector("[data-rss-summary-pending]")) return;
  const frameRoot = content.querySelector("[data-rss-frame-root]");
  const pending = document.createElement("div");
  pending.className = "rss-ai-summary rss-ai-summary-pending";
  pending.dataset.rssSummaryPending = "1";
  pending.setAttribute("role", "status");
  pending.setAttribute("aria-live", "polite");
  pending.innerHTML = `${iconSvg("loader")}<span>Generating summary...</span>`;
  content.insertBefore(pending, frameRoot || content.firstChild);
}

function clearRssSummaryPending() {
  el("page-content")?.querySelector("[data-rss-summary-pending]")?.remove();
}

function renderRssSandboxFrame(root, html, title = "RSS content") {
  if (!root) return;
  const iframe = document.createElement("iframe");
  iframe.className = "rss-detail-frame";
  iframe.title = title;
  iframe.setAttribute("sandbox", RSS_IFRAME_SANDBOX);
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("loading", "lazy");
  iframe.srcdoc = rssFrameDocumentHtml(html);
  root.replaceChildren(iframe);
}

function rssFrameDocumentHtml(html) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <base target="_blank">
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body class="markdown rss-frame-document">
  <main class="rss-frame-content">
    ${html || '<p class="empty">No content.</p>'}
  </main>
</body>
</html>`;
}

function scheduleRssDetailEnhancements(renderId) {
  scheduleIdleTask(() => {
    if (renderId !== state.rssDetailRenderId || state.view !== "page") return;
    updatePageOutline();
    updateReadingProgress();
  });
}

async function refreshRss() {
  if (state.rssRefreshing) return;
  state.rssRefreshing = true;
  setRssRefreshLoading(true);
  setRssStatus("Refreshing RSS...", "loading");
  try {
    const response = await request("/api/rss/refresh", {
      method: "POST",
      body: JSON.stringify({}),
      timeoutMs: 120000,
    });
    if (!response.ok) throw new Error(await response.text());
    const summary = await response.json();
    const removedItems = summary.removed_items || 0;
    const removedText = removedItems ? `, ${removedItems} removed` : "";
    const failedFeeds = summary.failed || 0;
    const failedText = failedFeeds ? `, ${failedFeeds} failed` : "";
    clearRssItemsCache();
    if (removedItems) clearRssItemCache();
    showToast(`RSS refreshed. ${summary.new_items || 0} new${removedText}${failedText}.`);
    await loadRssItems({ force: true });
    setRssStatus(
      failedFeeds
        ? `${failedFeeds} feed${failedFeeds === 1 ? "" : "s"} failed. Other feeds refreshed.`
        : "",
      failedFeeds ? "info" : "",
    );
  } catch (error) {
    console.error(error);
    setRssStatus(error.message || "RSS refresh failed.", "error");
  } finally {
    state.rssRefreshing = false;
    setRssRefreshLoading(false);
  }
}

async function toggleCurrentRssStar() {
  const id = state.rssSelectedItemId;
  if (!id) return;
  const starred = !state.rssCurrentStarred;
  try {
    const response = await request(`/api/rss/items/${encodeURIComponent(id)}/star`, {
      method: "POST",
      body: JSON.stringify({ starred }),
    });
    if (!response.ok) throw new Error(await response.text());
    state.rssCurrentStarred = starred;
    clearRssItemsCache();
    updateCachedRssItem(id, { starred_at: starred ? new Date().toISOString() : null });
    updateRssPageActions();
    showToast(starred ? "Starred." : "Unstarred.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Star failed.");
  }
}

async function unsubscribeCurrentRssFeed() {
  const feedId = state.rssCurrentFeedId;
  if (!feedId) return;
  const label = state.rssCurrentFeedTitle || "this feed";
  const confirmed = await showConfirmPanel({
    title: "Unsubscribe",
    message: `Unsubscribe from ${label}? This removes its RSS items.`,
    cancelText: "Cancel",
    confirmText: "Unsub",
    danger: true,
  });
  if (!confirmed) return;
  const button = el("rss-unsubscribe-button");
  button.disabled = true;
  try {
    const response = await request(`/api/rss/feeds/${encodeURIComponent(feedId)}/unsubscribe`, {
      method: "POST",
      body: JSON.stringify({}),
      timeoutMs: 120000,
    });
    if (!response.ok) throw new Error(await response.text());
    const summary = await response.json();
    state.rssSelectedItemId = "";
    state.rssCurrentFeedId = "";
    state.rssCurrentFeedTitle = "";
    clearRssCaches();
    showToast(`Unsubscribed. ${summary.removed_items || 0} items removed.`);
    await showView("rss", { restoreScroll: false });
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unsubscribe failed.");
  } finally {
    button.disabled = false;
  }
}

function updateRssPageActions() {
  const starButton = el("rss-star-button");
  const unsubscribeButton = el("rss-unsubscribe-button");
  starButton.hidden = false;
  unsubscribeButton.hidden = false;
  starButton.classList.toggle("is-starred", state.rssCurrentStarred);
  setButtonIcon(starButton, "star", state.rssCurrentStarred ? "Starred" : "Star");
}

function updateRssFilterButtons() {
  document.querySelectorAll("[data-rss-filter]").forEach((button) => {
    const active = button.dataset.rssFilter === state.rssFilter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function markSelectedRssItem(read = null) {
  document.querySelectorAll("[data-rss-row]").forEach((row) => {
    const active = row.dataset.rssRow === state.rssSelectedItemId;
    row.classList.toggle("is-active", active);
    if (active && read !== null) row.classList.toggle("is-read", read);
  });
}

function markRssRowRead(id) {
  const row = [...el("rss-list").querySelectorAll("[data-rss-row]")]
    .find((candidate) => candidate.dataset.rssRow === id);
  if (!row) return;
  row.classList.add("is-read");
  row.querySelector("[data-rss-mark-read]")?.remove();
}

function setRssRefreshLoading(loading) {
  const button = el("rss-refresh-button");
  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
  setButtonIcon(button, loading ? "loader" : "rotate-ccw", loading ? "Refreshing..." : "Refresh");
}

function setRssStatus(message, kind = "") {
  const status = el("rss-status");
  status.textContent = message;
  status.hidden = !message;
  status.classList?.toggle("is-loading", kind === "loading");
  status.classList?.toggle("is-error", kind === "error");
  status.classList?.toggle("is-info", kind === "info");
}

function rssSearchQuery() {
  return el("rss-search-input").value.trim();
}

function rssItemsCacheKey() {
  return `${state.rssFilter}\n${rssSearchQuery().toLowerCase()}`;
}

function clearRssItemsCache() {
  state.rssItemsCache.clear();
}

function clearRssItemCache(id = "") {
  if (id) {
    state.rssItemCache.delete(id);
  } else {
    state.rssItemCache.clear();
  }
}

function clearRssCaches() {
  clearRssItemsCache();
  clearRssItemCache();
}

function updateCachedRssItem(id, patch) {
  const cached = state.rssItemCache.get(id);
  if (!cached) return;
  state.rssItemCache.set(id, { ...cached, ...patch });
}

async function clearRssSearch() {
  window.clearTimeout(state.rssSearchTimer);
  if (!el("rss-search-input").value) return;
  el("rss-search-input").value = "";
  updateRssSearchClear();
  await loadRssItems({ preferCache: true });
  el("rss-search-input").focus();
}

function updateRssSearchClear() {
  el("rss-search-clear").hidden = !el("rss-search-input").value;
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
    state.currentBlocks = [];
    state.currentContentLoaded = true;
    showPage("NoPage", "No page yet.", sourceView, options);
    return;
  }
  state.currentFile = file;
  state.lastReadBlockIndex = -1;
  state.lastReadBlockFile = file;
  const pendingContent = pendingPageContent(file);
  state.currentContent = pendingContent ?? data.source ?? cachedPageSource(file) ?? "";
  state.currentBlocks =
    pendingContent !== null
      ? []
      : normalizeEditorBlocks(data.blocks || cachedPageBlocks(file) || [], { fallback: false });
  state.currentContentLoaded = Boolean(state.currentContent);
  const html = data.html || offlineSourcePreview(state.currentContent);
  showPage(file, html, sourceView, options);
}

function showPage(title, html, sourceView, options = {}) {
  const {
    editable = true,
    updateHistory = true,
    saveScroll = true,
    restoreReading = true,
    deferEnhancements = false,
  } = options;
  if (saveScroll) saveCurrentScrollPosition();
  if (sourceView === "todo" || sourceView === "find" || sourceView === "rss") {
    state.lastListView = sourceView;
  } else if (state.lastListView !== "todo" && state.lastListView !== "rss") {
    state.lastListView = "find";
  }
  state.view = "page";
  for (const view of document.querySelectorAll(".view")) {
    view.hidden = true;
  }
  el("page-title").textContent = title;
  setPageContentHtml(html, { deferImages: deferEnhancements });
  if (deferEnhancements) {
    clearPageOutline();
    if (state.currentHighlightKeyword) {
      scheduleIdleTask(() => highlightPageContent(state.currentHighlightKeyword));
    }
  } else {
    updatePageOutline();
    highlightPageContent(state.currentHighlightKeyword);
  }
  el("page-content").hidden = false;
  el("page-editor").hidden = true;
  el("page-editor-shell").hidden = true;
  setEditorMode("closed");
  el("page-block-editor").hidden = false;
  el("page-block-editor").innerHTML = "";
  el("edit-button").hidden = !editable;
  el("page-new-block-button").hidden = !editable || title === "NoPage";
  el("rss-star-button").hidden = true;
  el("rss-unsubscribe-button").hidden = true;
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

function setPageContentHtml(html, options = {}) {
  const blocks = normalizeEditorBlocks(state.currentBlocks, { fallback: false });
  if (!blocks.length) {
    setDeferredMarkdownHtml(el("page-content"), html, options);
    return;
  }
  setDeferredMarkdownHtml(el("page-content"), pageBlocksHtml(blocks), options);
}

function pageBlocksHtml(blocks) {
  return blocks
    .map((block, index) => {
      const source = editorBlockText(block);
      const emptyClass = source.trim() ? "" : " is-empty";
      const rendered = block.html || pendingEditorBlockHtml(source);
      return `
        <div class="page-render-block${emptyClass}" data-page-block-index="${index}">
          ${rendered}
          <button class="page-block-edit" type="button" data-page-block-action="edit" data-block-index="${index}" aria-label="Edit block ${index + 1}" title="Edit block">
            ${iconSvg("pencil")}
          </button>
        </div>
      `;
    })
    .join("");
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
  const index = estimateEditorBlockIndexFromViewportY(event.clientY);
  if (index < 0) return;
  state.lastReadBlockIndex = index;
  state.lastReadBlockFile = state.currentFile;
}

function initialEditorBlockIndex() {
  const blocks = state.editorBlocks;
  if (!blocks.length) return 0;
  if (state.lastReadBlockFile === state.currentFile && state.lastReadBlockIndex >= 0) {
    return Math.min(state.lastReadBlockIndex, blocks.length - 1);
  }
  return estimateEditorBlockIndexFromViewportY(stickyHeaderOffset() + 24);
}

function estimateEditorBlockIndexFromViewportY(clientY) {
  const content = el("page-content");
  const blocks = state.currentBlocks.length
    ? state.currentBlocks
    : normalizeEditorBlocks([{ source: state.currentContent, separator: "" }]);
  if (!content || !blocks.length) return 0;
  const rect = content.getBoundingClientRect();
  const height = Math.max(rect.height, 1);
  const relativeY = clamp(clientY - rect.top, 0, height);
  const totalLength = Math.max(joinEditorBlocks(blocks).length, 1);
  const contentOffset = (relativeY / height) * totalLength;
  let bestIndex = 0;
  let offset = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const end = offset + editorBlockText(block).length + editorBlockSeparator(block).length;
    if (contentOffset >= offset) bestIndex = index;
    if (contentOffset < end) return index;
    offset = end;
  }
  return bestIndex;
}

async function toggleEdit() {
  const editor = el("page-editor");
  if (editor.hidden) {
    await openPageEditor("source");
    return;
  }
  await savePageEditor();
}

async function openBlockEditorAt(index) {
  await openPageEditor("blocks", { activeIndex: index });
}

async function openNewBlockAtEnd() {
  await openPageEditor("blocks", { newBlockAtEnd: true });
}

async function openPageEditor(mode, options = {}) {
  const editor = el("page-editor");
  const editorShell = el("page-editor-shell");
  const blockEditor = el("page-block-editor");
  const content = el("page-content");
  const button = el("edit-button");
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
  const editSource = draft ?? state.currentContent;
  setEditorSource(editSource, draft === null ? state.currentBlocks : []);
  let activeIndex = Number.isFinite(Number(options.activeIndex))
    ? Number(options.activeIndex)
    : initialEditorBlockIndex();
  let insertedNewBlock = false;
  if (mode === "blocks" && options.newBlockAtEnd) {
    const onlyEmptyBlock =
      state.editorBlocks.length === 1 &&
      !editorBlockText(state.editorBlocks[0]) &&
      !editorBlockSeparator(state.editorBlocks[0]);
    if (onlyEmptyBlock) {
      activeIndex = 0;
    } else {
      insertEditorBlocks(state.editorBlocks.length, [
        { source: "", separator: "", html: EMPTY_BLOCK_HTML },
      ]);
      activeIndex = state.editorBlocks.length - 1;
      insertedNewBlock = true;
    }
  }
  editor.hidden = false;
  editorShell.hidden = false;
  setEditorMode(mode);
  blockEditor.hidden = mode !== "blocks";
  if (mode === "blocks") {
    renderBlockEditor({
      activeIndex,
      placeCursorAtEnd: Boolean(options.newBlockAtEnd || options.placeCursorAtEnd),
    });
  } else {
    blockEditor.innerHTML = "";
    state.activeEditorBlock = -1;
    syncPageEditorValue();
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.selectionStart = editor.value.length;
      editor.selectionEnd = editor.value.length;
    });
  }
  if (draft !== null) scheduleEditorBlockRender(editSource);
  content.hidden = true;
  el("page-new-block-button").hidden = true;
  el("toc-button").hidden = true;
  closeTocPanel();
  updateReadingProgress();
  showPageDraftBanner(draft !== null);
  if (insertedNewBlock) persistPageDraft();
  setPageEditorStatus(insertedNewBlock ? "Unsaved draft." : "");
  setButtonIcon(button, "save", "Save");
}

async function savePageEditor(options = {}) {
  const editor = el("page-editor");
  const editorShell = el("page-editor-shell");
  const content = el("page-content");
  const button = el("edit-button");
  syncEditorBlocksForSave(options);
  const currentEditorSource = joinEditorBlocks(state.editorBlocks);
  const spacedEditorSource = addCjkSpacingToMarkdownText(currentEditorSource);
  if (spacedEditorSource !== currentEditorSource) {
    replaceEditorBlocksFromSource(spacedEditorSource);
    if (state.editorMode === "blocks") renderBlockEditor({ activeIndex: -1, focus: false });
    scheduleEditorBlockRender(spacedEditorSource);
  }
  persistPageDraft();
  setPageEditorStatus("Local draft saved. Syncing...");
  button.disabled = true;
  setButtonIcon(button, "save", "Saving...");
  const payload = {
    file: state.currentFile,
    content: joinEditorBlocks(state.editorBlocks),
    blocks: editorBlocksPayload(),
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
    state.currentContent = payload.content;
    state.currentBlocks = normalizeEditorBlocks(data.blocks || [], { fallback: false });
    state.currentContentLoaded = true;
    state.currentFile = data.file || state.currentFile;
    rememberPage(data, state.currentFile, state.currentContent);
    rememberRecentEdit(state.currentFile);
    replaceAppHistory(currentAppHistoryEntry());
    clearPageDraft(state.currentFile);
    setPageContentHtml(data.html || "");
    updatePageOutline();
    highlightPageContent(state.currentHighlightKeyword);
    editor.hidden = true;
    editorShell.hidden = true;
    setEditorMode("closed");
    el("page-block-editor").innerHTML = "";
    el("page-block-editor").hidden = false;
    content.hidden = false;
    el("page-new-block-button").hidden = false;
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
        state.currentBlocks = [];
        state.currentContentLoaded = true;
        replaceAppHistory(currentAppHistoryEntry());
        clearPageDraft(state.currentFile);
        rememberPageSource(state.currentFile, payload.content);
        rememberRecentEdit(state.currentFile);
        content.innerHTML = offlineSourcePreview(payload.content);
        updatePageOutline();
        editor.hidden = true;
        editorShell.hidden = true;
        setEditorMode("closed");
        el("page-block-editor").innerHTML = "";
        el("page-block-editor").hidden = false;
        content.hidden = false;
        el("page-new-block-button").hidden = false;
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

function syncEditorBlocksForSave(options = {}) {
  if (state.editorMode === "blocks") {
    if (!options.skipActiveBlockCommit) commitActiveEditorBlockForSave();
    return;
  }
  replaceEditorBlocksFromSource(el("page-editor").value);
}

async function loadCurrentPageSource(options = {}) {
  const { forceNetwork = false } = options;
  const pending = pendingPageContent(state.currentFile);
  if (pending !== null) {
    state.currentContent = pending;
    state.currentBlocks = [];
    state.currentContentLoaded = true;
    return;
  }
  if (!forceNetwork && state.currentContentLoaded) return;
  if (!forceNetwork) {
    const cached = cachedPageSource(state.currentFile);
    if (cached) {
      state.currentContent = cached;
      state.currentBlocks = cachedPageBlocks(state.currentFile);
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
    state.currentBlocks = [];
    state.currentContentLoaded = true;
    return;
  }
  state.currentFile = data.file;
  state.currentContent = data.content || "";
  state.currentBlocks = normalizeEditorBlocks(data.blocks || [], { fallback: false });
  state.currentContentLoaded = true;
  rememberPageSource(state.currentFile, state.currentContent, data.blocks || []);
}

async function warmPageSource(file) {
  if (!file || cachedPageSource(file) || pendingPageContent(file) !== null) return;
  try {
    const response = await request(
      `/api/page/source?path=${encodeURIComponent(file)}`,
    );
    if (!response.ok) return;
    const data = await response.json();
    if (data.file !== "NoPage") rememberPageSource(data.file, data.content || "", data.blocks || []);
  } catch {
    // Best effort only.
  }
}

function handlePageEditorInput(event) {
  if (event?.target?.id === "page-editor") {
    formatTextareaCjkSpacing(event.target, { event });
    replaceEditorBlocksFromSource(event.target.value);
  }
  persistPageDraft();
  setPageEditorStatus(hasUnsavedPageEdit() ? "Unsaved draft." : "");
  if (state.editorMode === "blocks") {
    renderBlockEditor({ activeIndex: state.activeEditorBlock });
  }
}

function handlePageEditorCompositionEnd(event) {
  finishTextareaComposition(event);
  handlePageEditorInput({ target: event.target });
}

async function handlePageBlockEditorClick(event) {
  const action = event.target.closest("[data-editor-block-action]");
  if (action) {
    event.preventDefault();
    event.stopPropagation();
    const index = Number(action.dataset.blockIndex || 0);
    if (action.dataset.editorBlockAction === "delete-empty") {
      await deleteEmptyEditorBlock(index);
      return;
    }
    activateEditorBlock(index);
    return;
  }

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
  if (!editor || !blockEditor || editor.hidden || state.editorMode !== "blocks") return;
  const blocks = state.editorBlocks.length ? state.editorBlocks : normalizeEditorBlocks([]);
  const activeIndex = Math.min(
    Math.max(Number(options.activeIndex ?? state.activeEditorBlock ?? -1), -1),
    blocks.length - 1,
  );
  state.activeEditorBlock = activeIndex;
  blockEditor.innerHTML = blocks
    .map((block, index) => editorBlockHtml(block, index, index === activeIndex))
    .join("");
  enhanceMarkdownImages(blockEditor);
  if (activeIndex >= 0) {
    const active = blockEditor.querySelector(`[data-block-index="${activeIndex}"] textarea`);
    if (active && options.focus !== false) {
      active.addEventListener("input", (event) => updateActiveBlockFromTextarea(active, event));
      active.addEventListener("compositionstart", handleTextareaCompositionStart);
      active.addEventListener("compositionend", handleBlockTextareaCompositionEnd);
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
  replaceEditorBlock(Number(active.dataset.blockIndex || 0), active.value);
  persistPageDraft();
  setPageEditorStatus(hasUnsavedPageEdit() ? "Unsaved draft." : "");
  state.activeEditorBlock = -1;
  renderBlockEditor({ activeIndex: -1, focus: false });
  scheduleEditorBlockRender(joinEditorBlocks(state.editorBlocks));
}

function commitActiveEditorBlockForSave() {
  const blockEditor = el("page-block-editor");
  const active = blockEditor?.querySelector(".editor-block.is-active textarea");
  if (!active) return false;
  const index = Number(active.dataset.blockIndex || 0);
  if (normalizeEditorText(active.value).trim()) {
    commitActiveEditorBlock();
    return false;
  }
  deleteEditorBlocks(index, 1);
  state.activeEditorBlock = -1;
  renderBlockEditor({ activeIndex: -1, focus: false });
  scheduleEditorBlockRender(joinEditorBlocks(state.editorBlocks));
  return true;
}

function handleBlockTextareaCompositionEnd(event) {
  finishTextareaComposition(event);
  updateActiveBlockFromTextarea(event.currentTarget);
}

function updateActiveBlockFromTextarea(textarea, event = null) {
  formatTextareaCjkSpacing(textarea, { event });
  replaceEditorBlock(Number(textarea.dataset.blockIndex || 0), textarea.value);
  persistPageDraft();
  setPageEditorStatus(hasUnsavedPageEdit() ? "Unsaved draft." : "");
  autoResizeBlockTextarea(textarea);
}

function replaceEditorBlock(index, value) {
  if (!state.editorBlocks[index]) return;
  state.editorBlocks[index] = {
    ...state.editorBlocks[index],
    source: normalizeEditorText(value),
    html: pendingEditorBlockHtml(value),
  };
  syncPageEditorValue();
}

function handleBlockTextareaKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    commitActiveEditorBlock();
    return;
  }
  if (
    event.key === "Backspace" &&
    !event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    event.currentTarget.selectionStart === 0 &&
    event.currentTarget.selectionEnd === 0 &&
    !event.currentTarget.value &&
    state.editorBlocks.length > 1
  ) {
    event.preventDefault();
    const index = Number(event.currentTarget.dataset.blockIndex || 0);
    deleteEditorBlocks(index, 1);
    persistPageDraft();
    setPageEditorStatus(hasUnsavedPageEdit() ? "Unsaved draft." : "");
    renderBlockEditor({ activeIndex: Math.max(0, index - 1), placeCursorAtEnd: true });
    scheduleEditorBlockRender(joinEditorBlocks(state.editorBlocks));
  }
}

async function deleteEmptyEditorBlock(index) {
  const textarea = el("page-block-editor")?.querySelector(
    `.editor-block.is-active textarea[data-block-index="${index}"]`,
  );
  const value = textarea ? textarea.value : editorBlockText(state.editorBlocks[index]);
  if (normalizeEditorText(value).trim()) return;
  replaceEditorBlock(index, value);
  deleteEditorBlocks(index, 1);
  persistPageDraft();
  setPageEditorStatus("Deleting block...");
  state.activeEditorBlock = -1;
  renderBlockEditor({ activeIndex: -1, focus: false });
  scheduleEditorBlockRender(joinEditorBlocks(state.editorBlocks));
  await savePageEditor({ skipActiveBlockCommit: true });
}

function autoResizeBlockTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(46, textarea.scrollHeight)}px`;
}

function setEditorSource(source, blocks = []) {
  const normalizedSource = normalizeEditorText(source);
  const normalizedBlocks = Array.isArray(blocks) && blocks.length
    ? normalizeEditorBlocks(blocks)
    : [];
  state.editorBlocks = normalizedBlocks.length
    ? normalizedBlocks
    : [{ source: normalizedSource, separator: "", html: pendingEditorBlockHtml(normalizedSource) }];
  syncPageEditorValue();
}

function editorBlockHtml(block, index, active) {
  const source = editorBlockText(block);
  if (active) {
    const deleteButton = !source.trim() && state.editorBlocks.length > 1
      ? `<button class="editor-block-action editor-block-delete" type="button" data-editor-block-action="delete-empty" data-block-index="${index}" aria-label="Delete empty block ${index + 1}" title="Delete empty block">${iconSvg("trash-2")}</button>`
      : "";
    return `<div class="editor-block is-active" data-block-index="${index}"><textarea class="editor-block-source" data-block-index="${index}" rows="1">${escapeTextarea(source)}</textarea>${deleteButton}</div>`;
  }
  return `<div class="editor-block" data-block-index="${index}" tabindex="0">${editorBlockPreviewHtml(block, index)}</div>`;
}

function editorBlockPreviewHtml(block, index) {
  const source = editorBlockText(block);
  const rendered = block.html || pendingEditorBlockHtml(source);
  return `${rendered}<button class="editor-block-action editor-block-edit" type="button" data-editor-block-action="edit" data-block-index="${index}" aria-label="Edit block ${index + 1}" title="Edit block">${iconSvg("pencil")}</button>`;
}

function escapeTextarea(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function normalizeEditorBlocks(blocks, options = {}) {
  const normalized = Array.isArray(blocks)
    ? blocks.map((block) => ({
        source: normalizeEditorText(block?.source || ""),
        separator: normalizeEditorText(block?.separator || ""),
        html: typeof block?.html === "string" && block.html
          ? block.html
          : EMPTY_BLOCK_HTML,
      }))
    : [];
  if (normalized.length) return normalized;
  if (options.fallback === false) return [];
  return [{ source: "", separator: "", html: EMPTY_BLOCK_HTML }];
}

function editorBlockText(block) {
  return normalizeEditorText(block?.source || "");
}

function editorBlockSeparator(block) {
  return normalizeEditorText(block?.separator || "");
}

function joinEditorBlocks(blocks = state.editorBlocks) {
  return normalizeEditorBlocks(blocks)
    .map((block) => `${editorBlockText(block)}${editorBlockSeparator(block)}`)
    .join("");
}

function editorBlocksPayload() {
  return state.editorBlocks.map((block) => ({
    source: editorBlockText(block),
    separator: editorBlockSeparator(block),
  }));
}

function syncPageEditorValue() {
  const editor = el("page-editor");
  if (editor) editor.value = joinEditorBlocks(state.editorBlocks);
}

function replaceEditorBlocksFromSource(source) {
  const normalizedSource = normalizeEditorText(source);
  state.editorBlocks = [{
    source: normalizedSource,
    separator: "",
    html: pendingEditorBlockHtml(normalizedSource),
  }];
  syncPageEditorValue();
}

function pendingEditorBlockHtml(source) {
  return normalizeEditorText(source).trim()
    ? ""
    : EMPTY_BLOCK_HTML;
}

function insertEditorBlocks(index, blocks) {
  const insertAt = clamp(Number(index) || 0, 0, state.editorBlocks.length);
  const normalized = normalizeEditorBlocks(blocks);
  if (state.editorBlocks.length && insertAt === state.editorBlocks.length) {
    const previous = state.editorBlocks[state.editorBlocks.length - 1];
    if (!editorBlockSeparator(previous)) previous.separator = "\n\n";
  }
  if (state.editorBlocks.length && insertAt < state.editorBlocks.length) {
    const lastInserted = normalized[normalized.length - 1];
    if (!editorBlockSeparator(lastInserted)) lastInserted.separator = "\n\n";
  }
  state.editorBlocks.splice(insertAt, 0, ...normalized);
  syncPageEditorValue();
}

function deleteEditorBlocks(index, count = 1) {
  if (!state.editorBlocks.length) return;
  const start = clamp(Number(index) || 0, 0, state.editorBlocks.length - 1);
  const size = Math.max(1, Number(count) || 1);
  state.editorBlocks.splice(start, size);
  if (!state.editorBlocks.length) {
    state.editorBlocks.push({ source: "", separator: "", html: EMPTY_BLOCK_HTML });
  } else if (start >= state.editorBlocks.length) {
    state.editorBlocks[state.editorBlocks.length - 1].separator = "";
  }
  syncPageEditorValue();
}

function normalizeEditorText(value) {
  return String(value || "").replace(/\r\n?/g, "\n");
}

async function scheduleEditorBlockRender(source) {
  const editor = el("page-editor");
  if (!editor || editor.hidden) return;
  const expectedSource = normalizeEditorText(source);
  const requestId = state.editorRenderRequestId + 1;
  state.editorRenderRequestId = requestId;
  try {
    const response = await request("/api/markdown/blocks", {
      method: "POST",
      body: JSON.stringify({
        file: state.currentFile,
        content: expectedSource,
      }),
    });
    if (!response.ok) return;
    const data = await response.json();
    if (requestId !== state.editorRenderRequestId) return;
    if (editor.hidden) return;
    applyRenderedEditorBlocks(data.blocks || [], expectedSource);
  } catch (error) {
    if (!shouldQueueOffline(error)) console.error(error);
  }
}

function applyRenderedEditorBlocks(blocks, expectedSource) {
  const renderedBlocks = normalizeEditorBlocks(blocks, { fallback: false });
  if (!renderedBlocks.length) return false;
  if (joinEditorBlocks(state.editorBlocks) !== normalizeEditorText(expectedSource)) return false;

  const activeIndex = state.activeEditorBlock;
  if (activeIndex >= 0) {
    if (renderedBlocks.length !== state.editorBlocks.length) return false;
    state.editorBlocks = state.editorBlocks.map((block, index) =>
      index === activeIndex ? block : renderedBlocks[index],
    );
    syncPageEditorValue();
    refreshInactiveEditorBlockHtml(renderedBlocks, activeIndex);
    return true;
  }

  state.editorBlocks = renderedBlocks;
  syncPageEditorValue();
  renderBlockEditor({ activeIndex: -1, focus: false });
  return true;
}

function refreshInactiveEditorBlockHtml(renderedBlocks, activeIndex) {
  const blockEditor = el("page-block-editor");
  if (!blockEditor) return;
  renderedBlocks.forEach((block, index) => {
    if (index === activeIndex) return;
    const node = blockEditor.querySelector(
      `.editor-block[data-block-index="${index}"]:not(.is-active)`,
    );
    if (node) node.innerHTML = editorBlockPreviewHtml(block, index);
  });
  enhanceMarkdownImages(blockEditor);
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
  return !editor.hidden && joinEditorBlocks(state.editorBlocks) !== state.currentContent;
}

function closePageEditor() {
  const editor = el("page-editor");
  if (editor.hidden) return;
  editor.hidden = true;
  el("page-editor-shell").hidden = true;
  setEditorMode("closed");
  el("page-block-editor").hidden = false;
  el("page-block-editor").innerHTML = "";
  el("page-new-block-button").hidden = false;
  showPageDraftBanner(false);
  state.editorRenderRequestId += 1;
  el("page-content").hidden = false;
  setButtonIcon(el("edit-button"), "pencil", "Edit");
  setPageEditorStatus("");
}

function setEditorMode(mode) {
  state.editorMode = mode;
  const shell = el("page-editor-shell");
  if (!shell) return;
  shell.classList.toggle("is-block-mode", mode === "blocks");
  shell.classList.toggle("is-source-mode", mode === "source");
}

function persistPageDraft() {
  if (!state.currentFile) return;
  const editor = el("page-editor");
  if (editor.value === state.currentContent) {
    clearPageDraft(state.currentFile);
    return;
  }
  localStorage.setItem(pageDraftKey(state.currentFile), joinEditorBlocks(state.editorBlocks));
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
  setEditorSource(state.currentContent, state.currentBlocks);
  showPageDraftBanner(false);
  setPageEditorStatus("");
  renderBlockEditor({ activeIndex: initialEditorBlockIndex() });
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
    return;
  }
  if (handleHistoryKeydown(event)) {
    return;
  }
  if (isEditableTarget(event.target) || event.key !== "/" || event.altKey) return;
  event.preventDefault();
  void showView("find", { restoreScroll: false }).then(() =>
    focusSearchInput({ select: true }),
  );
}

function handleHistoryKeydown(event) {
  if (isEditableTarget(event.target) || isPageEditorOpen()) return false;
  if (event.repeat) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.key === "h" || event.key === "ArrowLeft") {
    event.preventDefault();
    navigateAppHistory(-1);
    return true;
  }
  if (event.key === "l" || event.key === "ArrowRight") {
    event.preventDefault();
    navigateAppHistory(1);
    return true;
  }
  return false;
}

function navigateAppHistory(direction) {
  if (!state.historyReady) return;
  if (direction < 0) {
    if (state.appHistoryIndex > 0) {
      window.history.back();
    } else if (state.view === "page") {
      void showView(state.lastListView, { focusSearch: false });
    }
    return;
  }
  if (direction > 0 && state.appHistoryIndex < state.appHistoryMaxIndex) {
    window.history.forward();
  }
}

function isPageEditorOpen() {
  return state.view === "page" && !el("page-editor-shell").hidden;
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

function setDeferredMarkdownHtml(root, html, options = {}) {
  if (!root) return;
  const { deferImages = false } = options;
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
  if (deferImages) {
    window.requestAnimationFrame(() => enhanceMarkdownImages(root));
  } else {
    enhanceMarkdownImages(root);
  }
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function scheduleIdleTask(callback) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 500 });
  } else {
    window.requestAnimationFrame(callback);
  }
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
