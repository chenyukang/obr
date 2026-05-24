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

vm.runInNewContext(`${app}\nthis.__obrTest = { state, splitMarkdownBlocks, joinMarkdownBlocks, replaceSourceBlock };`, sandbox);
const { state, splitMarkdownBlocks, joinMarkdownBlocks, replaceSourceBlock } = sandbox.__obrTest;

function blockTexts(source) {
  return Array.from(splitMarkdownBlocks(source), (block) => block.text);
}

function assertTexts(actual, expected) {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
}

assertTexts(blockTexts("one\n\ntwo\n\nthree"), ["one", "two", "three"]);
assert.strictEqual(joinMarkdownBlocks(splitMarkdownBlocks("one\n\ntwo\n\nthree")), "one\n\ntwo\n\nthree");

// Regression: clearing a non-empty middle block creates a run of four newlines.
// That empty block must stay represented so following block indices do not shift
// and later edits/saves cannot accidentally target or hide the following content.
assertTexts(blockTexts("one\n\n\n\nthree\n\nfour"), ["one", "", "three", "four"]);
assert.strictEqual(joinMarkdownBlocks(splitMarkdownBlocks("one\n\n\n\nthree\n\nfour")), "one\n\n\n\nthree\n\nfour");

pageEditor.value = "one\n\ntwo\n\nthree\n\nfour";
state.activeEditorBlock = 1;
state.activeEditorBlockStart = 5;
state.activeEditorBlockTextEnd = 8;
replaceSourceBlock(1, "");
assert.strictEqual(pageEditor.value, "one\n\n\n\nthree\n\nfour");
assertTexts(blockTexts(pageEditor.value), ["one", "", "three", "four"]);

// The immediate following block is still index 2 after clearing block 1.
const following = splitMarkdownBlocks(pageEditor.value)[2];
assert.strictEqual(following.text, "three");
assert.strictEqual(pageEditor.value.slice(following.start, following.textEnd), "three");

console.log("editor block regression tests passed");
