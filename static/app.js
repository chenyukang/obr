const state = {
  view: "day",
  lastListView: "day",
  currentFile: "",
  currentContent: "",
  image: "",
  searchTimer: 0,
};

const el = (id) => document.getElementById(id);

const ICONS = {
  "arrow-left": '<path d="M19 12H5"></path><path d="m12 19-7-7 7-7"></path>',
  "book-open": '<path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path>',
  "calendar-days": '<path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path><path d="M8 18h.01"></path><path d="M12 18h.01"></path><path d="M16 18h.01"></path>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"></path>',
  "list-checks": '<path d="m3 7 2 2 4-4"></path><path d="m3 17 2 2 4-4"></path><path d="M13 6h8"></path><path d="M13 12h8"></path><path d="M13 18h8"></path>',
  "log-in": '<path d="m10 17 5-5-5-5"></path><path d="M15 12H3"></path><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>',
  "log-out": '<path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>',
  key: '<path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-2.8-2.8L21 2"></path><path d="m15 5 4 4"></path><path d="m13 7 4 4"></path>',
  pencil: '<path d="M21.2 6.8a1 1 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8L2 21.4a.5.5 0 0 0 .6.6L7 20.7a2 2 0 0 0 .8-.5z"></path><path d="m15 5 4 4"></path>',
  plus: '<path d="M5 12h14"></path><path d="M12 5v14"></path>',
  "rotate-ccw": '<path d="M3 12a9 9 0 1 0 9-9 9.8 9.8 0 0 0-6.7 2.7L3 8"></path><path d="M3 3v5h5"></path>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M17 21v-7H7v7"></path><path d="M7 3v5h8"></path>',
  search: '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>',
  x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
};

document.addEventListener("DOMContentLoaded", async () => {
  installIcons();
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
  el("passkey-login-button").addEventListener("click", passkeyLogin);
  el("passkey-register-button").addEventListener("click", registerPasskey);

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
    await fetchPage(link.id);
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


async function passkeyLogin() {
  try {
    if (!window.PublicKeyCredential) throw new Error("This browser does not support passkeys.");
    setLoginError("Touch your passkey to log in.", false);
    const start = await fetch("/api/passkey/login/start", {
      method: "POST",
      credentials: "same-origin",
    });
    if (!start.ok) throw new Error(await start.text());
    const requestOptions = await start.json();
    requestOptions.publicKey.challenge = base64urlToUint8Array(requestOptions.publicKey.challenge);
    requestOptions.publicKey.allowCredentials?.forEach((credential) => {
      credential.id = base64urlToUint8Array(credential.id);
    });

    const assertion = await navigator.credentials.get({ publicKey: requestOptions.publicKey });
    const finish = await fetch("/api/passkey/login/finish", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: assertion.id,
        rawId: uint8ArrayToBase64url(new Uint8Array(assertion.rawId)),
        type: assertion.type,
        response: {
          authenticatorData: uint8ArrayToBase64url(new Uint8Array(assertion.response.authenticatorData)),
          clientDataJSON: uint8ArrayToBase64url(new Uint8Array(assertion.response.clientDataJSON)),
          signature: uint8ArrayToBase64url(new Uint8Array(assertion.response.signature)),
          userHandle: assertion.response.userHandle
            ? uint8ArrayToBase64url(new Uint8Array(assertion.response.userHandle))
            : null,
        },
      }),
    });
    if (!finish.ok) throw new Error(await finish.text());
    setLoginError("", true);
    showApp();
    showView("day");
  } catch (error) {
    console.error(error);
    setLoginError(error.message || "Passkey login failed.");
  }
}

async function registerPasskey() {
  try {
    if (!window.PublicKeyCredential) throw new Error("This browser does not support passkeys.");
    const start = await request("/api/passkey/register/start", { method: "POST" });
    if (!start.ok) throw new Error(await start.text());
    const creationOptions = await start.json();
    creationOptions.publicKey.challenge = base64urlToUint8Array(creationOptions.publicKey.challenge);
    creationOptions.publicKey.user.id = base64urlToUint8Array(creationOptions.publicKey.user.id);
    creationOptions.publicKey.excludeCredentials?.forEach((credential) => {
      credential.id = base64urlToUint8Array(credential.id);
    });

    const credential = await navigator.credentials.create({ publicKey: creationOptions.publicKey });
    const finish = await request("/api/passkey/register/finish", {
      method: "POST",
      body: JSON.stringify({
        id: credential.id,
        rawId: uint8ArrayToBase64url(new Uint8Array(credential.rawId)),
        type: credential.type,
        response: {
          attestationObject: uint8ArrayToBase64url(new Uint8Array(credential.response.attestationObject)),
          clientDataJSON: uint8ArrayToBase64url(new Uint8Array(credential.response.clientDataJSON)),
        },
      }),
    });
    if (!finish.ok) throw new Error(await finish.text());
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
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
  setLoginError("", true);
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
    el("todo-view").hidden = false;
    await loadTodo();
    return;
  }
  if (name === "find") {
    state.lastListView = "find";
    el("find-view").hidden = false;
    updateSearchClear();
    focusSearchInput();
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
  const keyword = el("search-input").value.trim();
  updateSearchClear();
  const response = await request(`/api/search?keyword=${encodeURIComponent(keyword)}`);
  el("search-results").innerHTML = `<ul>${await response.text()}</ul>`;
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

function focusSearchInput() {
  window.requestAnimationFrame(() => el("search-input").focus());
}

async function loadTodo() {
  const response = await request("/api/page?path=Unsort%2Ftodo");
  const data = await response.json();
  const content = data[0] === "NoPage" ? "" : data[1] || "";
  el("todo-list").innerHTML = content.trim()
    ? renderMarkdown(content)
    : '<p class="empty">No todos.</p>';
}

async function addTodo() {
  const text = el("todo-input").value.trim();
  if (!text) return;
  el("todo-status").textContent = "Saving...";
  el("todo-status").hidden = false;
  try {
    const response = await request("/api/entry", {
      method: "POST",
      body: JSON.stringify({
        page: "todo",
        links: "",
        text,
        image: "",
      }),
    });
    const result = await response.text();
    if (result !== "ok") throw new Error(result);
    el("todo-input").value = "";
    el("todo-status").hidden = true;
    await loadTodo();
  } catch (error) {
    console.error(error);
    el("todo-status").textContent = "Save failed.";
  }
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
  setButtonIcon(el("edit-button"), "pencil", "Edit");
  el("page-view").hidden = false;
}

async function toggleEdit() {
  const editor = el("page-editor");
  const content = el("page-content");
  if (editor.hidden) {
    editor.value = state.currentContent;
    editor.hidden = false;
    content.hidden = true;
    setButtonIcon(el("edit-button"), "save", "Save");
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
    setButtonIcon(el("edit-button"), "pencil", "Edit");
  }
}

function installIcons() {
  document.querySelectorAll("[data-icon]").forEach((element) => {
    addIcon(element, element.dataset.icon);
  });
}

function addIcon(element, iconName) {
  if (!ICONS[iconName] || element.firstElementChild?.classList.contains("icon")) return;
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
      const [target, label] = name.split("|", 2).map((part) => part.trim());
      const page = target || label || "";
      const text = label || target.split("#")[0] || target;
      return `<a href="#" data-page="${escapeHtml(page)}">${escapeHtml(text)}</a>`;
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

