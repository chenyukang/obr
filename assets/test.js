const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const app = fs.readFileSync(require.resolve("./app.js"), "utf8");
const pageEditor = { value: "", hidden: false };
let activeBlockTextarea = null;
let rssListHtml = "";
let rssListWrites = 0;
let pendingSummaryNode = null;
let scrolledTo = null;
const topbarNode = {
  hidden: false,
  getBoundingClientRect() {
    return { top: 0, bottom: 64 };
  },
};
const rssBodyNode = { dataset: { rssBody: "1" } };
const pageContent = {
  hidden: false,
  firstChild: rssBodyNode,
  insertedBefore: null,
  querySelector(selector) {
    if (selector === "[data-rss-summary-pending]") return pendingSummaryNode;
    if (selector === "[data-rss-body]") return rssBodyNode;
    return null;
  },
  insertBefore(node, referenceNode) {
    pendingSummaryNode = node;
    this.insertedBefore = referenceNode;
  },
};
const rssList = {
  get innerHTML() {
    return rssListHtml;
  },
  set innerHTML(value) {
    rssListHtml = value;
    rssListWrites += 1;
  },
  nextRow: null,
  querySelector(selector) {
    if (selector === "[data-rss-row]") return this.nextRow;
    return null;
  },
  querySelectorAll() {
    return [];
  },
};
const pageBlockEditor = {
  hidden: false,
  innerHTML: "",
  querySelector(selector) {
    if (selector === ".editor-block.is-active textarea") return activeBlockTextarea;
    return null;
  },
  querySelectorAll() {
    return [];
  },
};
const rssSearchInput = {
  value: "",
  focused: false,
  selected: false,
  focus() {
    this.focused = true;
  },
  select() {
    this.selected = true;
  },
};
const rssSearchForm = { hidden: true };
const rssSearchToggle = {
  attributes: {},
  focused: false,
  active: false,
  classList: {
    toggle(_name, active) {
      rssSearchToggle.active = active;
    },
  },
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  },
  focus() {
    this.focused = true;
  },
};
const elements = {
  "page-content": pageContent,
  "page-editor": pageEditor,
  "page-block-editor": pageBlockEditor,
  "rss-list": rssList,
  "rss-search-form": rssSearchForm,
  "rss-search-input": rssSearchInput,
  "rss-search-toggle": rssSearchToggle,
  "rss-search-clear": { hidden: true },
  "update-banner": { hidden: true },
  "rss-status": {
    textContent: "",
    hidden: true,
    classList: { toggle() {} },
  },
};
const fetchCalls = [];
const fetchJsonResponses = [];
const sandbox = {
  console,
  document: {
    addEventListener() {},
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector(selector) {
      if (selector === ".topbar") return topbarNode;
      return null;
    },
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(),
        className: "",
        dataset: {},
        innerHTML: "",
        title: "",
        attributes: {},
        srcdoc: "",
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        getAttribute(name) {
          return this.attributes[name] || null;
        },
        remove() {
          if (pendingSummaryNode === this) pendingSummaryNode = null;
        },
      };
    },
    querySelectorAll() {
      return [];
    },
  },
  fetch(path, options) {
    fetchCalls.push({ path, options });
    const json = fetchJsonResponses.length ? fetchJsonResponses.shift() : {};
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get() { return null; } },
      text: () => Promise.resolve(""),
      json: () => Promise.resolve(json),
    });
  },
  FormData: class FormData {},
  URLSearchParams,
  window: {
    innerHeight: 700,
    scrollY: 500,
    scrollTo(options) {
      scrolledTo = options;
    },
    requestAnimationFrame(callback) {
      callback();
    },
  },
  navigator: {},
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  },
  setTimeout() {},
  clearTimeout() {},
};

vm.runInNewContext(
  `${app}
this.__obrTest = {
  state,
  setEditorSource,
  joinEditorBlocks,
  replaceEditorBlock,
  insertEditorBlocks,
  deleteEditorBlocks,
  applyRenderedEditorBlocks,
  pendingEditorBlockHtml,
  editorBlocksPayload,
  editorBlockHtml,
  pageBlocksHtml,
  formatTextareaCjkSpacing,
  commitActiveEditorBlockForSave,
  syncEditorBlocksForSave,
  rssItemHtml,
  handleRssListClick,
  markRssItemReadFromList,
  markRssItemReadLocally,
  loadRssItems,
  sameRssItemsPage,
  sameRssItemDetail,
  normalizeAppConfig,
  parseClockMinutes,
  scheduledDarkMode,
  rssDetailExternalLinksHtml,
  rssDetailBodyHtml,
  rssAiSummaryHtml,
  renderRssSummaryPending,
  clearRssSummaryPending,
  focusRssSummaryTarget,
  setRssSearchOpen,
  toggleRssSearch,
  updateRssSearchClear,
};`,
  sandbox,
);

const {
  state,
  setEditorSource,
  joinEditorBlocks,
  replaceEditorBlock,
  insertEditorBlocks,
  deleteEditorBlocks,
  applyRenderedEditorBlocks,
  pendingEditorBlockHtml,
  editorBlocksPayload,
  editorBlockHtml,
  pageBlocksHtml,
  formatTextareaCjkSpacing,
  commitActiveEditorBlockForSave,
  syncEditorBlocksForSave,
  rssItemHtml,
  handleRssListClick,
  markRssItemReadFromList,
  markRssItemReadLocally,
  loadRssItems,
  sameRssItemsPage,
  sameRssItemDetail,
  normalizeAppConfig,
  parseClockMinutes,
  scheduledDarkMode,
  rssDetailExternalLinksHtml,
  rssDetailBodyHtml,
  rssAiSummaryHtml,
  renderRssSummaryPending,
  clearRssSummaryPending,
  focusRssSummaryTarget,
  setRssSearchOpen,
  toggleRssSearch,
  updateRssSearchClear,
} = sandbox.__obrTest;

function assertSource(expected) {
  assert.strictEqual(joinEditorBlocks(state.editorBlocks), expected);
  assert.strictEqual(pageEditor.value, expected);
}

setEditorSource("one\n\ntwo\n\nthree", [
  { source: "one", separator: "\n\n", html: "<p>one</p>" },
  { source: "two", separator: "\n\n", html: "<p>two</p>" },
  { source: "three", separator: "", html: "<p>three</p>" },
]);
assertSource("one\n\ntwo\n\nthree");

replaceEditorBlock(1, "");
assert.strictEqual(state.editorBlocks[1].html, '<p class="editor-preview-empty">Empty block</p>');
assertSource("one\n\n\n\nthree");
assert.deepStrictEqual(
  editorBlocksPayload().map((block) => block.source),
  ["one", "", "three"],
);

deleteEditorBlocks(1, 1);
assertSource("one\n\nthree");

insertEditorBlocks(0, [{ source: "zero", separator: "\n\n", html: "<p>zero</p>" }]);
assertSource("zero\n\none\n\nthree");

insertEditorBlocks(2, [
  { source: "middle-a", separator: "\n\n", html: "<p>middle-a</p>" },
  { source: "middle-b", separator: "\n\n", html: "<p>middle-b</p>" },
]);
assertSource("zero\n\none\n\nmiddle-a\n\nmiddle-b\n\nthree");

deleteEditorBlocks(2, 2);
assertSource("zero\n\none\n\nthree");

insertEditorBlocks(state.editorBlocks.length, [
  { source: "tail", separator: "", html: "<p>tail</p>" },
]);
assertSource("zero\n\none\n\nthree\n\ntail");

deleteEditorBlocks(state.editorBlocks.length - 1, 1);
assertSource("zero\n\none\n\nthree");

deleteEditorBlocks(0, state.editorBlocks.length);
assertSource("");
assert.strictEqual(state.editorBlocks.length, 1);

setEditorSource("one\n\ntwo\n\nthree", [
  { source: "one", separator: "\n\n", html: "<p>stale one</p>" },
  { source: "two", separator: "\n\n", html: "<p>stale two</p>" },
  { source: "three", separator: "", html: "<p>stale three</p>" },
]);
replaceEditorBlock(1, "two edited");
assert.strictEqual(state.editorBlocks[1].html, "");
assert.strictEqual(pendingEditorBlockHtml("two edited"), "");
assert(!JSON.stringify(state.editorBlocks).includes("Preview updates after editing"));
state.activeEditorBlock = 2;
assert.strictEqual(
  applyRenderedEditorBlocks(
    [
      { source: "one", separator: "\n\n", html: "<p>fresh one</p>" },
      { source: "two edited", separator: "\n\n", html: "<p>fresh two edited</p>" },
      { source: "three", separator: "", html: "<p>fresh three</p>" },
    ],
    "one\n\ntwo edited\n\nthree",
  ),
  true,
);
assertSource("one\n\ntwo edited\n\nthree");
assert.strictEqual(state.editorBlocks[0].html, "<p>fresh one</p>");
assert.strictEqual(state.editorBlocks[1].html, "<p>fresh two edited</p>");
assert.strictEqual(state.editorBlocks[2].html, "<p>stale three</p>");

assert(editorBlockHtml(state.editorBlocks[0], 0, false).includes('data-editor-block-action="edit"'));
replaceEditorBlock(1, "");
assert(editorBlockHtml(state.editorBlocks[1], 1, true).includes('data-editor-block-action="delete-empty"'));
const pageBlocks = pageBlocksHtml(state.editorBlocks);
assert(pageBlocks.includes('data-page-block-action="edit"'));
assert(pageBlocks.includes("page-render-block is-empty"));

const composingTextarea = {
  value: "中文abc",
  selectionStart: 5,
  selectionEnd: 5,
  dataset: { composing: "1" },
};
assert.strictEqual(formatTextareaCjkSpacing(composingTextarea), false);
assert.strictEqual(composingTextarea.value, "中文abc");

const inputComposingTextarea = {
  value: "中文123",
  selectionStart: 5,
  selectionEnd: 5,
  dataset: {},
};
assert.strictEqual(
  formatTextareaCjkSpacing(inputComposingTextarea, {
    event: { isComposing: true },
  }),
  false,
);
assert.strictEqual(inputComposingTextarea.value, "中文123");
assert.strictEqual(
  formatTextareaCjkSpacing(inputComposingTextarea, { force: true }),
  true,
);
assert.strictEqual(inputComposingTextarea.value, "中文 123");

setEditorSource("one\n\ntwo\n\nthree", [
  { source: "one", separator: "\n\n", html: "<p>one</p>" },
  { source: "two", separator: "\n\n", html: "<p>two</p>" },
  { source: "three", separator: "", html: "<p>three</p>" },
]);
state.editorMode = "blocks";
state.activeEditorBlock = 1;
activeBlockTextarea = {
  dataset: { blockIndex: "1" },
  value: "  ",
};
assert.strictEqual(commitActiveEditorBlockForSave(), true);
assertSource("one\n\nthree");

setEditorSource("one\n\ntwo\n\nthree", [
  { source: "one", separator: "\n\n", html: "<p>one</p>" },
  { source: "two", separator: "\n\n", html: "<p>two</p>" },
  { source: "three", separator: "", html: "<p>three</p>" },
]);
state.editorMode = "blocks";
syncEditorBlocksForSave({ skipActiveBlockCommit: true });
assert.deepStrictEqual(
  state.editorBlocks.map((block) => block.source),
  ["one", "two", "three"],
);
assertSource("one\n\ntwo\n\nthree");

async function assertRssMarkReadFromList() {
  const unreadHtml = rssItemHtml({
    id: "rss-1",
    title: "Title",
    feed_title: "Feed",
    published_at: "2026-05-24T00:00:00Z",
    summary_md: "Summary",
    read_at: null,
  });
  assert(unreadHtml.includes('data-rss-mark-read="rss-1"'));
  assert(unreadHtml.includes("Summary"));

  const hnHtml = rssItemHtml({
    id: "rss-hn",
    title: "HN item",
    feed_title: "Hacker News: Newest",
    published_at: "2026-05-24T00:00:00Z",
    summary_md: "Article URL: <https://example.test/post>\nComments URL: <https://news.ycombinator.com/item?id=1>\nPoints: 42\n# Comments: 7",
    read_at: null,
  });
  assert(!hnHtml.includes("Article URL"));
  assert(!hnHtml.includes("https://example.test/post"));
  assert(!hnHtml.includes("Points: 42"));

  const readHtml = rssItemHtml({
    id: "rss-2",
    title: "Read",
    feed_title: "Feed",
    read_at: "2026-05-24T00:00:00Z",
  });
  assert(!readHtml.includes("data-rss-mark-read"));

  let removed = false;
  let prevented = false;
  const row = {
    remove() {
      removed = true;
    },
  };
  const readButton = {
    dataset: { rssMarkRead: "rss-1" },
    disabled: false,
    closest(selector) {
      if (selector === "[data-rss-row]") return row;
      if (selector === "[data-rss-mark-read]") return readButton;
      return null;
    },
  };
  rssList.nextRow = {};
  state.rssFilter = "unread";
  fetchCalls.length = 0;

  await handleRssListClick({
    target: readButton,
    preventDefault() {
      prevented = true;
    },
  });

  assert.strictEqual(prevented, true);
  assert.strictEqual(removed, true);
  assert.strictEqual(fetchCalls.length, 1);
  assert.strictEqual(fetchCalls[0].path, "/api/rss/items/rss-1/read");
  assert.strictEqual(fetchCalls[0].options.method, "POST");
  assert.deepStrictEqual(JSON.parse(fetchCalls[0].options.body), { read: true });

  const directButton = {
    dataset: {},
    disabled: false,
    closest() {
      return row;
    },
  };
  await markRssItemReadFromList("", directButton);
  assert.strictEqual(fetchCalls.length, 1);
}

function assertRssMarkReadLocalCache() {
  state.rssItemsCache.clear();
  state.rssItemCache.clear();
  const unreadItem = {
    id: "rss-cache-read",
    title: "Read me",
    feed_title: "Feed",
    first_seen_at: "2026-05-25T00:00:00Z",
    read_at: null,
  };
  const otherItem = {
    id: "rss-cache-other",
    title: "Still unread",
    feed_title: "Feed",
    first_seen_at: "2026-05-25T00:00:01Z",
    read_at: null,
  };
  state.rssItemsCache.set("unread\n", {
    items: [unreadItem, otherItem],
    nextOffset: 20,
  });
  state.rssItemsCache.set("all\n", {
    items: [unreadItem],
    nextOffset: null,
  });
  state.rssItemCache.set("rss-cache-read", {
    id: "rss-cache-read",
    title: "Read me",
    read_at: null,
    html: "<p>Read me</p>",
  });

  const readAt = "2026-05-25T00:00:02.000Z";
  assert.strictEqual(markRssItemReadLocally("rss-cache-read", readAt), readAt);
  assert.strictEqual(
    state.rssItemsCache.get("unread\n").items.map((item) => item.id).join(","),
    "rss-cache-other",
  );
  assert.strictEqual(state.rssItemsCache.get("unread\n").nextOffset, 20);
  assert.strictEqual(state.rssItemsCache.get("all\n").items[0].read_at, readAt);
  assert.strictEqual(state.rssItemCache.get("rss-cache-read").read_at, readAt);
}

async function assertRssPagination() {
  state.rssFilter = "unread";
  state.rssItemsCache.clear();
  elements["rss-search-input"].value = "";
  fetchCalls.length = 0;
  rssListWrites = 0;
  fetchJsonResponses.push({
    items: [
      {
        id: "rss-page-1",
        title: "First",
        feed_title: "Feed",
        first_seen_at: "2026-05-25T00:00:00Z",
        read_at: null,
      },
    ],
    next_offset: 20,
  });

  await loadRssItems({ force: true });

  assert(fetchCalls[0].path.includes("limit=20"));
  assert(fetchCalls[0].path.includes("offset=0"));
  assert(rssList.innerHTML.includes('data-rss-row="rss-page-1"'));
  assert(rssList.innerHTML.includes('data-rss-more="20"'));
  assert.strictEqual(rssListWrites, 1);

  fetchJsonResponses.push({
    items: [
      {
        id: "rss-page-2",
        title: "Second",
        feed_title: "Feed",
        first_seen_at: "2026-05-25T00:00:01Z",
        read_at: null,
      },
    ],
    next_offset: null,
  });

  await loadRssItems({ append: true });

  assert(fetchCalls[1].path.includes("offset=20"));
  assert(rssList.innerHTML.includes('data-rss-row="rss-page-1"'));
  assert(rssList.innerHTML.includes('data-rss-row="rss-page-2"'));
  assert(!rssList.innerHTML.includes("data-rss-more"));
}

async function assertRssListCacheRefresh() {
  state.rssFilter = "unread";
  state.rssItemsCache.clear();
  elements["rss-search-input"].value = "";
  fetchCalls.length = 0;
  rssListWrites = 0;
  const firstPage = {
    items: [
      {
        id: "rss-cache-1",
        title: "Cached",
        feed_title: "Feed",
        first_seen_at: "2026-05-25T00:00:00Z",
        read_at: null,
      },
    ],
    next_offset: null,
  };

  fetchJsonResponses.push(firstPage);
  await loadRssItems({ preferCache: true });
  assert(rssList.innerHTML.includes("Cached"));
  assert.strictEqual(rssListWrites, 1);

  fetchJsonResponses.push(firstPage);
  await loadRssItems({ preferCache: true });
  assert(rssList.innerHTML.includes("Cached"));
  assert.strictEqual(rssListWrites, 2);

  fetchJsonResponses.push({
    items: [{ ...firstPage.items[0], title: "Updated" }],
    next_offset: null,
  });
  await loadRssItems({ preferCache: true });
  assert(rssList.innerHTML.includes("Updated"));
  assert.strictEqual(rssListWrites, 4);
}

function assertRssCacheSignatures() {
  const page = { items: [{ id: "rss-1", title: "A" }], nextOffset: null };
  assert.strictEqual(sameRssItemsPage(page, { items: [{ id: "rss-1", title: "A" }], nextOffset: null }), true);
  assert.strictEqual(sameRssItemsPage(page, { items: [{ id: "rss-1", title: "B" }], nextOffset: null }), false);

  const detail = {
    id: "rss-1",
    feed_id: "feed-1",
    feed_title: "Feed",
    feed_url: "https://example.test/feed.xml",
    title: "A",
    url: "https://example.test/a",
    first_seen_at: "2026-05-25T00:00:00Z",
    read_at: null,
    starred_at: null,
    ai_summary_zh: "中文总结",
    ai_summary_model: "deepseek-v4-flash",
    html: "<p>A</p>",
  };
  assert.strictEqual(sameRssItemDetail(detail, { ...detail }), true);
  assert.strictEqual(sameRssItemDetail(detail, { ...detail, html: "<p>B</p>" }), false);
  assert.strictEqual(sameRssItemDetail(detail, { ...detail, read_at: "2026-05-25T00:00:01Z" }), false);
  assert.strictEqual(sameRssItemDetail(detail, { ...detail, ai_summary_zh: "新的总结" }), false);
}

function assertThemeSchedule() {
  assert.strictEqual(parseClockMinutes("21:30"), 1290);
  assert.strictEqual(parseClockMinutes("7:30"), null);
  assert.strictEqual(parseClockMinutes("24:00"), null);
  assert.strictEqual(
    scheduledDarkMode(new Date("2026-05-25T22:00:00"), {
      darkModeStart: "21:00",
      darkModeEnd: "07:00",
    }),
    true,
  );
  assert.strictEqual(
    scheduledDarkMode(new Date("2026-05-25T12:00:00"), {
      darkModeStart: "21:00",
      darkModeEnd: "07:00",
    }),
    false,
  );
  assert.strictEqual(
    scheduledDarkMode(new Date("2026-05-25T08:00:00"), {
      darkModeStart: "07:00",
      darkModeEnd: "21:00",
    }),
    true,
  );
  assert.strictEqual(scheduledDarkMode(new Date(), {}), null);

  const config = normalizeAppConfig({
    dark_mode_start: "20:00",
    dark_mode_end: "08:00",
  });
  assert.strictEqual(config.darkModeStart, "20:00");
  assert.strictEqual(config.darkModeEnd, "08:00");
}

function assertRssAiSummaryHtml() {
  const bodyHtml = rssDetailBodyHtml({ html: "<p>Hello</p>" });
  assert(bodyHtml.includes('<article class="rss-detail-body" data-rss-body>'));
  assert(bodyHtml.includes("<p>Hello</p>"));
  assert.strictEqual(
    rssDetailBodyHtml({ html: "" }),
    '<article class="rss-detail-body" data-rss-body><p class="empty">No content.</p></article>',
  );

  assert.strictEqual(rssAiSummaryHtml({}), "");
  const html = rssAiSummaryHtml({
    ai_summary_zh: "第一行\n第二行 <script>",
    ai_summary_model: "deepseek-v4-flash",
  });

  assert(html.includes('<details class="rss-ai-summary">'));
  assert(!html.includes("<details open"));
  assert(html.includes("中文总结"));
  assert(html.includes("deepseek-v4-flash"));
  assert(html.includes("第一行<br>第二行 &lt;script&gt;"));

  const openHtml = rssAiSummaryHtml({ ai_summary_zh: "新生成总结" }, { open: true });
  assert(openHtml.includes('<details class="rss-ai-summary" open>'));

  const hnLinksHtml = rssDetailExternalLinksHtml({
    url: "https://example.test/post",
    hacker_news_url: "https://news.ycombinator.com/item?id=48260331",
  });
  assert(hnLinksHtml.includes('href="https://example.test/post"'));
  assert(hnLinksHtml.includes('href="https://news.ycombinator.com/item?id=48260331"'));
  assert(hnLinksHtml.indexOf(">Original<") < hnLinksHtml.indexOf(">HN<"));

  const duplicateHnLinksHtml = rssDetailExternalLinksHtml({
    url: "https://news.ycombinator.com/item?id=48260331",
    hacker_news_url: "https://news.ycombinator.com/item?id=48260331",
  });
  assert(!duplicateHnLinksHtml.includes(">HN<"));

  const translationHtml = rssDetailBodyHtml({
    html: "<p>English one</p><p>English two</p>",
    ai_translation_md: "English <one>\n\n> 中文 <一>",
    ai_translation_model: "deepseek-v4-flash",
  });
  assert(translationHtml.includes('class="rss-inline-translation"'));
  assert(translationHtml.includes("<p>中文 &lt;一&gt;</p>"));
  assert(!translationHtml.includes("全文翻译"));
  assert(
    translationHtml.indexOf("<p>English one</p>") <
      translationHtml.indexOf('class="rss-inline-translation"'),
  );
  assert(
    translationHtml.indexOf('class="rss-inline-translation"') <
      translationHtml.indexOf("<p>English two</p>"),
  );

  const nestedTranslationHtml = rssDetailBodyHtml({
    html: "<div><p>English one</p><p>English two</p></div>",
    ai_translation_md: "English one\n\n> 中文一\n\nEnglish two\n\n> 中文二",
  });
  const firstSourceIndex = nestedTranslationHtml.indexOf("<p>English one</p>");
  const firstTranslationIndex = nestedTranslationHtml.indexOf("<p>中文一</p>");
  const secondSourceIndex = nestedTranslationHtml.indexOf("<p>English two</p>");
  const secondTranslationIndex = nestedTranslationHtml.indexOf("<p>中文二</p>");
  assert(firstSourceIndex >= 0);
  assert(firstSourceIndex < firstTranslationIndex);
  assert(firstTranslationIndex < secondSourceIndex);
  assert(secondSourceIndex < secondTranslationIndex);
}

function assertRssSummaryLoadingState() {
  pendingSummaryNode = null;
  pageContent.insertedBefore = null;

  const pending = renderRssSummaryPending();

  assert(pendingSummaryNode);
  assert.strictEqual(pending, pendingSummaryNode);
  assert.strictEqual(pendingSummaryNode.className, "rss-ai-summary rss-ai-summary-pending");
  assert.strictEqual(pendingSummaryNode.dataset.rssSummaryPending, "1");
  assert.strictEqual(pendingSummaryNode.getAttribute("role"), "status");
  assert.strictEqual(pendingSummaryNode.getAttribute("aria-live"), "polite");
  assert(pendingSummaryNode.innerHTML.includes("Generating summary"));
  assert.strictEqual(pageContent.insertedBefore, rssBodyNode);

  const firstPendingNode = pendingSummaryNode;
  assert.strictEqual(renderRssSummaryPending(), firstPendingNode);
  assert.strictEqual(pendingSummaryNode, firstPendingNode);

  clearRssSummaryPending();
  assert.strictEqual(pendingSummaryNode, null);
}

function assertRssSummaryFocusUsesStickyOffset() {
  scrolledTo = null;
  const target = {
    attributes: {},
    focused: false,
    focusOptions: null,
    getBoundingClientRect() {
      return { top: 320 };
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    focus(options) {
      this.focused = true;
      this.focusOptions = options;
    },
  };

  focusRssSummaryTarget(target);

  assert.strictEqual(target.attributes.tabindex, "-1");
  assert.strictEqual(scrolledTo.top, 744);
  assert.strictEqual(scrolledTo.behavior, "smooth");
  assert.strictEqual(target.focused, true);
  assert.strictEqual(target.focusOptions.preventScroll, true);
}

function assertRssSearchDisclosure() {
  rssSearchInput.value = "";
  rssSearchInput.focused = false;
  rssSearchInput.selected = false;
  rssSearchToggle.focused = false;
  rssSearchForm.hidden = true;

  toggleRssSearch();

  assert.strictEqual(rssSearchForm.hidden, false);
  assert.strictEqual(rssSearchToggle.attributes["aria-expanded"], "true");
  assert.strictEqual(rssSearchToggle.active, true);
  assert.strictEqual(rssSearchInput.focused, true);
  assert.strictEqual(rssSearchInput.selected, true);

  rssSearchInput.value = "rust";
  updateRssSearchClear();
  assert.strictEqual(elements["rss-search-clear"].hidden, false);

  rssSearchInput.value = "";
  setRssSearchOpen(false, { focusToggle: true });
  assert.strictEqual(rssSearchForm.hidden, true);
  assert.strictEqual(rssSearchToggle.attributes["aria-expanded"], "false");
  assert.strictEqual(rssSearchToggle.active, false);
  assert.strictEqual(rssSearchToggle.focused, true);
}

(async () => {
  await assertRssMarkReadFromList();
  assertRssMarkReadLocalCache();
  await assertRssPagination();
  await assertRssListCacheRefresh();
  assertRssCacheSignatures();
  assertThemeSchedule();
  assertRssAiSummaryHtml();
  assertRssSummaryLoadingState();
  assertRssSummaryFocusUsesStickyOffset();
  assertRssSearchDisclosure();
})()
  .then(() => {
    console.log("editor and RSS regression tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
