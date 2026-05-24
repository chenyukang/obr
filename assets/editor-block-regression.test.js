const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const app = fs.readFileSync(require.resolve("./app.js"), "utf8");
const pageEditor = { value: "", hidden: false };
const elements = {
  "page-editor": pageEditor,
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

console.log("editor block regression tests passed");
