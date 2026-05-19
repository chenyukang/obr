const state = {
  view: "day",
  lastListView: "day",
  currentFile: "",
  currentContent: "",
  image: "",
};

const el = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  restoreDraft();
  const ok = await verify();
  if (ok) {
    showApp();
    showView("day");
  } else {
    showLogin();
  }
});

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  el("logout-button").addEventListener("click", logout);

  el("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await login();
  });

  el("entry-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveEntry();
  });

  el("entry-reset").addEventListener("click", resetEntry);
  el("entry-text").addEventListener("input", persistDraft);
  el("entry-page").addEventListener("input", persistDraft);
  el("entry-links").addEventListener("input", persistDraft);
  el("entry-text").addEventListener("paste", handlePaste);
  el("entry-image-file").addEventListener("change", handleImageFile);

  el("search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await search();
  });

  el("search-results").addEventListener("click", async (event) => {
    const link = event.target.closest("a[id]");
    if (!link) return;
    event.preventDefault();
    await fetchPage(link.id);
  });

  el("back-button").addEventListener("click", () => showView(state.lastListView));
  el("edit-button").addEventListener("click", toggleEdit);

  el("page-content").addEventListener("click", async (event) => {
    const task = event.target.closest("input[data-task-index]");
    if (task && state.currentFile === "Unsort/todo.md") {
      await markTodo(task.dataset.taskIndex);
      await fetchPage("Unsort/todo", "todo");
      return;
    }

    const wiki = event.target.closest("a[data-page]");
    if (wiki) {
      event.preventDefault();
      await fetchPage(wiki.dataset.page);
    }
  });
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (response.status === 401) {
    showLogin();
    throw new Error("unauthorized");
  }
  return response;
}

async function verify() {
  try {
    const response = await fetch("/api/verify", { credentials: "same-origin" });
    return response.ok;
  } catch {
    return false;
  }
}

async function login() {
  el("login-error").hidden = true;
  const response = await fetch("/api/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: el("username").value,
      password: el("password").value,
    }),
  });
  if (!response.ok) {
    el("login-error").hidden = false;
    return;
  }
  el("password").value = "";
  showApp();
  showView("day");
}

async function logout() {
  await fetch("/api/logout", {
    method: "POST",
    credentials: "same-origin",
  });
  showLogin();
}

function showLogin() {
  el("app").hidden = true;
  el("login").hidden = false;
  el("password").value = "";
}

function showApp() {
  el("login").hidden = true;
  el("app").hidden = false;
}

async function showView(name) {
  state.view = name;
  for (const view of document.querySelectorAll(".view")) {
    view.hidden = true;
  }
  if (name === "todo") {
    state.lastListView = "todo";
    await fetchPage("Unsort/todo", "todo");
    return;
  }
  if (name === "rss") {
    el("rss-view").hidden = false;
    return;
  }
  if (name === "find") {
    state.lastListView = "find";
    el("find-view").hidden = false;
    if (!el("search-results").innerHTML.trim()) {
      await search();
    }
    return;
  }
  el("day-view").hidden = false;
}

async function saveEntry() {
  setEntryStatus("Saving...");
  try {
    const response = await request("/api/entry", {
      method: "POST",
      body: JSON.stringify({
        page: el("entry-page").value,
        links: el("entry-links").value,
        text: el("entry-text").value,
        image: state.image,
      }),
    });
    const text = await response.text();
    if (text !== "ok") throw new Error(text);
    resetEntry();
    setEntryStatus("Saved.");
  } catch (error) {
    console.error(error);
    setEntryStatus("Save failed.");
  }
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
  state.image = "";
  el("entry-preview").hidden = true;
  localStorage.removeItem("obr.entry.text");
  localStorage.removeItem("obr.entry.page");
  localStorage.removeItem("obr.entry.links");
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
}

function handlePaste(event) {
  const items = event.clipboardData?.items || [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      readImage(item.getAsFile());
      break;
    }
  }
}

function handleImageFile(event) {
  const file = event.target.files[0];
  if (file) readImage(file);
}

function readImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.image = reader.result;
    el("entry-preview").src = state.image;
    el("entry-preview").hidden = false;
  };
  reader.readAsDataURL(file);
}

async function search() {
  const keyword = el("search-input").value;
  const response = await request(`/api/search?keyword=${encodeURIComponent(keyword)}`);
  el("search-results").innerHTML = `<ul>${await response.text()}</ul>`;
}

async function fetchPage(path, sourceView = state.view) {
  const response = await request(`/api/page?path=${encodeURIComponent(path)}`);
  const data = await response.json();
  const file = data[0];
  const content = data[1] || "";
  if (file === "NoPage") {
    state.currentFile = path.endsWith(".md") ? path : `${path}.md`;
    state.currentContent = "";
    showPage("NoPage", "No page yet.", sourceView);
    return;
  }
  state.currentFile = file;
  state.currentContent = content;
  showPage(file, renderMarkdown(content), sourceView);
}

function showPage(title, html, sourceView) {
  state.lastListView = sourceView === "todo" ? "todo" : "find";
  for (const view of document.querySelectorAll(".view")) {
    view.hidden = true;
  }
  el("page-title").textContent = title;
  el("page-content").innerHTML = html;
  el("page-content").hidden = false;
  el("page-editor").hidden = true;
  el("edit-button").textContent = "Edit";
  el("page-view").hidden = false;
}

async function toggleEdit() {
  const editor = el("page-editor");
  const content = el("page-content");
  if (editor.hidden) {
    editor.value = state.currentContent;
    editor.hidden = false;
    content.hidden = true;
    el("edit-button").textContent = "Save";
    return;
  }
  const response = await request("/api/page", {
    method: "POST",
    body: JSON.stringify({
      file: state.currentFile,
      content: editor.value,
    }),
  });
  if (response.ok) {
    state.currentContent = editor.value;
    content.innerHTML = renderMarkdown(state.currentContent);
    editor.hidden = true;
    content.hidden = false;
    el("edit-button").textContent = "Edit";
  }
}

async function markTodo(index) {
  await request(`/api/mark?index=${encodeURIComponent(index)}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

function renderMarkdown(raw) {
  let inCode = false;
  let inList = false;
  let taskIndex = 0;
  const out = [];

  for (const line of raw.split(/\r?\n/)) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        out.push("</code></pre>");
      } else {
        closeList();
        out.push("<pre><code>");
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(line) + "\n");
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      out.push("");
      continue;
    }
    if (trimmed === "---") {
      closeList();
      out.push("<hr>");
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(6, heading[1].length + 1);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const task = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      openList();
      const checked = task[1].toLowerCase() === "x" ? " checked disabled" : "";
      const index = taskIndex++;
      out.push(`<li><label><input type="checkbox" data-task-index="${index}"${checked}> ${inline(task[2])}</label></li>`);
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      openList();
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");

  function openList() {
    if (!inList) {
      out.push("<ul>");
      inList = true;
    }
  }

  function closeList() {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  }
}

function inline(value) {
  return escapeHtml(value)
    .replace(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, (_match, name) => {
      return `<img src="/static/images/${encodeURIComponent(name.trim())}" alt="">`;
    })
    .replace(/\[\[([^\]]+)\]\]/g, (_match, name) => {
      const page = name.trim();
      return `<a href="#" data-page="${escapeHtml(page)}">${escapeHtml(page)}</a>`;
    })
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
