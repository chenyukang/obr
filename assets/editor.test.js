const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const app = fs.readFileSync(require.resolve("./app.js"), "utf8");
const pageEditor = { value: "", hidden: false };
let activeBlockTextarea = null;
let rssListHtml = "";
let rssListWrites = 0;
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
const elements = {
  "page-editor": pageEditor,
  "page-block-editor": pageBlockEditor,
  "rss-list": rssList,
  "rss-search-input": { value: "" },
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
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(),
        className: "",
        title: "",
        attributes: {},
        srcdoc: "",
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        getAttribute(name) {
          return this.attributes[name] || null;
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
  window: {},
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
  loadRssItems,
  sameRssItemsPage,
  sameRssItemDetail,
  renderRssSandboxFrame,
  rssFrameDocumentHtml,
  RSS_IFRAME_SANDBOX,
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
  loadRssItems,
  sameRssItemsPage,
  sameRssItemDetail,
  renderRssSandboxFrame,
  rssFrameDocumentHtml,
  RSS_IFRAME_SANDBOX,
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
    html: "<p>A</p>",
  };
  assert.strictEqual(sameRssItemDetail(detail, { ...detail }), true);
  assert.strictEqual(sameRssItemDetail(detail, { ...detail, html: "<p>B</p>" }), false);
  assert.strictEqual(sameRssItemDetail(detail, { ...detail, read_at: "2026-05-25T00:00:01Z" }), false);
}

function assertRssSandboxFrame() {
  assert.strictEqual(RSS_IFRAME_SANDBOX, "allow-popups");
  assert(!RSS_IFRAME_SANDBOX.includes("allow-scripts"));
  assert(!RSS_IFRAME_SANDBOX.includes("allow-same-origin"));
  assert(!RSS_IFRAME_SANDBOX.includes("allow-forms"));

  const doc = rssFrameDocumentHtml("<p>Hello</p>");
  assert(doc.includes('<base target="_blank">'));
  assert(doc.includes('<link rel="stylesheet" href="/assets/style.css">'));
  assert(doc.includes("<p>Hello</p>"));

  let child = null;
  renderRssSandboxFrame(
    {
      replaceChildren(node) {
        child = node;
      },
    },
    "<p>Hello</p>",
    "Post",
  );

  assert(child);
  assert.strictEqual(child.tagName, "IFRAME");
  assert.strictEqual(child.className, "rss-detail-frame");
  assert.strictEqual(child.title, "Post");
  assert.strictEqual(child.getAttribute("sandbox"), "allow-popups");
  assert.strictEqual(child.getAttribute("referrerpolicy"), "no-referrer");
  assert(child.srcdoc.includes("<p>Hello</p>"));
}

(async () => {
  await assertRssMarkReadFromList();
  await assertRssPagination();
  await assertRssListCacheRefresh();
  assertRssCacheSignatures();
  assertRssSandboxFrame();
})()
  .then(() => {
    console.log("editor and RSS regression tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
