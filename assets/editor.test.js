const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const app = fs.readFileSync(require.resolve("./app.js"), "utf8");
const pageEditor = { value: "", hidden: false };
let activeBlockTextarea = null;
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
};
const sandbox = {
  console,
  document: {
    addEventListener() {},
    getElementById(id) {
      return elements[id] || null;
    },
  },
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

console.log("editor block regression tests passed");
