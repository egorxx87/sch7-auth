//тутdocument.getElementByIdtasks.js

// TASKS WebApp URL (/exec)
const TASKS_API_URL =
  "https://script.google.com/macros/s/AKfycbzKxxknHm2WBYLRzNOAWaK66VGvUZMbT5tPjpTR6j2J_uYh838LRI5Nk0a2H4DPIkkG/exec";

// SCHEDULE WebApp URL (/exec) — чтобы брать список админов
const SCHEDULE_API_URL =
  "https://script.google.com/macros/s/AKfycbw_uswtYYaimbBJytiHAdcwjbvv2rujyBt2Rrc9jlBHoYQ358F7vi8OvvQEhTptODNZ8g/exec";

// tasks.js


let allTasks = [];     // active
let doneTasks = [];    // done (loads only when needed)

let activeFilter = "all"; // all | red | blue | done
let activePriority = "red";
let sortMode = "priority";
let editId = "";
let isSaving = false;
let assigneeFilter = "__all__";

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-add-task")?.addEventListener("click", openModalNew);
  document.getElementById("btn-cancel")?.addEventListener("click", closeModal);
  document.getElementById("btn-save")?.addEventListener("click", saveTask);

  document.getElementById("sortMode")?.addEventListener("change", (e) => {
    sortMode = e.target.value;
    render();
  });

  document.getElementById("assigneeFilter")?.addEventListener("change", (e) => {
    assigneeFilter = e.target.value;
    render();
  });

  document.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".pill").forEach((x) => x.classList.remove("pill--active"));
      btn.classList.add("pill--active");
      activeFilter = btn.getAttribute("data-filter") || "all";

      if (activeFilter === "done") await loadDone();
      render();
    });
  });

  document.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seg-btn").forEach((x) => x.classList.remove("seg-btn--active"));
      btn.classList.add("seg-btn--active");
      activePriority = btn.getAttribute("data-priority") === "blue" ? "blue" : "red";
    });
  });

  document.getElementById("taskModal")?.addEventListener("click", (e) => {
    if (e.target && e.target.id === "taskModal") closeModal();
  });

  loadAdminsForSelect();
  loadActive();
});

async function loadActive() {
  if (!TASKS_API_URL || TASKS_API_URL.includes("PASTE_")) {
    setListEmpty("Немає TASKS_API_URL");
    return;
  }

  setLoading(true, "Завантаження задач…");
  try {
    const json = await callTasksApi_("tasks_list");
    if (!json || !json.ok) throw new Error((json && json.error) ? json.error : "Load error");

    allTasks = Array.isArray(json.data) ? json.data : [];
    refreshAssigneeFilterOptions_();
    render();
  } catch (e) {
    console.error(e);
    setListEmpty("Помилка завантаження");
  } finally {
    setLoading(false);
  }
}

async function loadDone() {
  setLoading(true, "Завантаження виконаних…");
  try {
    const json = await callTasksApi_("tasks_done_list");
    if (!json || !json.ok) throw new Error((json && json.error) ? json.error : "Load done error");
    doneTasks = Array.isArray(json.data) ? json.data : [];
  } catch (e) {
    console.error(e);
    doneTasks = [];
    alert("Помилка: не вдалося завантажити виконані");
  } finally {
    setLoading(false);
  }
}

function render() {
  const list = document.getElementById("taskList");
  const counter = document.getElementById("taskCounter");
  const titleEl = document.getElementById("tasksBlockTitle");
  const addBtn = document.getElementById("btn-add-task");
  if (!list) return;

  const isDoneView = activeFilter === "done";
  if (titleEl) titleEl.textContent = isDoneView ? "Виконані завдання" : "Вхідні завдання";
  if (addBtn) addBtn.style.display = isDoneView ? "none" : "";

  let items = isDoneView ? [...doneTasks] : [...allTasks];

  if (!isDoneView) {
    if (activeFilter === "red") items = items.filter((t) => (t.priority || "blue") === "red");
    if (activeFilter === "blue") items = items.filter((t) => (t.priority || "blue") === "blue");
  }

  // assignee filter (both lists)
  if (assigneeFilter === "__none__") {
    items = items.filter((t) => !String(t.assignee || "").trim());
  } else if (assigneeFilter !== "__all__") {
    items = items.filter((t) => String(t.assignee || "").trim() === assigneeFilter);
  }

  // sort
  items.sort((a, b) => {
    if (sortMode === "new") return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    if (sortMode === "due") {
      const ad = toSortableDate_(formatDueHuman_(a.due));
      const bd = toSortableDate_(formatDueHuman_(b.due));
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return ad.localeCompare(bd);
    }
    const ap = (a.priority === "red") ? 0 : 1;
    const bp = (b.priority === "red") ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });

  if (counter) {
    counter.textContent = isDoneView
      ? `Показано: ${items.length} виконаних`
      : `Показано: ${items.length} із ${allTasks.length}`;
  }

  if (!items.length) {
    setListEmpty(isDoneView ? "Немає виконаних завдань" : "Немає активних завдань");
    return;
  }

  list.innerHTML = items.map((t) => {
    const pr = t.priority === "red" ? "Срочно" : "Звичайно";
    const badgeClass = t.priority === "red" ? "badge badge--red" : "badge badge--blue";
    const dueStr = formatDueHuman_(t.due);
    const due = dueStr ? escapeHtml(dueStr) : "без строку";
    const who = String(t.assignee || "").trim();
    const comment = String(t.comment || "").trim();
    const doneAt = String(t.doneAt || "").trim();

    return `
      <div class="task-row" data-edit="${escapeHtml(t.id)}">
        <div class="task-left">
          <div class="task-title">${escapeHtml(t.title || "")}</div>

          <div class="task-meta">
            <span class="${badgeClass}">${escapeHtml(pr)}</span>
            <span class="task-due">⏳ ${due}</span>
            ${who ? `<span class="task-due">👤 ${escapeHtml(who)}</span>` : `<span class="task-due">👤 без відповідального</span>`}
            ${isDoneView && doneAt ? `<span class="task-due">✔ ${escapeHtml(doneAt)}</span>` : ``}
          </div>

          ${comment ? `<div class="task-comment">${escapeHtml(comment)}</div>` : ``}
        </div>

        <div class="task-actions">
          ${
            isDoneView
              ? `<button class="act-btn act-btn--restore" data-restore="${escapeHtml(t.id)}" type="button">Повернути</button>`
              : `<button class="act-btn act-btn--done" data-done="${escapeHtml(t.id)}" type="button">Готово</button>`
          }
          <button class="act-btn act-btn--del" data-del="${escapeHtml(t.id)}" type="button">Видалити</button>
        </div>
      </div>
    `;
  }).join("");

  // delete
  list.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-del");
      if (!id) return;
      if (!confirm("Видалити задачу?")) return;
      await deleteTask(id);
    });
  });

  // done
  list.querySelectorAll("[data-done]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-done");
      if (!id) return;
      await markDone(id);
    });
  });

  // restore
  list.querySelectorAll("[data-restore]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-restore");
      if (!id) return;
      await restoreTask(id);
    });
  });

  // edit row click (only active list)
  list.querySelectorAll("[data-edit]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target && e.target.closest("[data-del],[data-done],[data-restore]")) return;
      if (activeFilter === "done") return;
      const id = row.getAttribute("data-edit");
      if (!id) return;
      openModalEdit(id);
    });
  });
}

async function markDone(id) {
  setLoading(true, "Позначаю виконано…");
  try {
    const json = await callTasksApi_("tasks_done", { id });
    if (!json || !json.ok) throw new Error(json?.error || "Done error");

    // локально убираем из active
    allTasks = allTasks.filter(t => t.id !== id);
    refreshAssigneeFilterOptions_();
    render();
  } catch (e) {
    console.error(e);
    alert("Помилка: не вдалося позначити виконано");
  } finally {
    setLoading(false);
  }
}

async function restoreTask(id) {
  setLoading(true, "Повертаю задачу…");
  try {
    const json = await callTasksApi_("tasks_open", { id });
    if (!json || !json.ok) throw new Error(json?.error || "Open error");

    doneTasks = doneTasks.filter(t => t.id !== id);
    await loadActive(); // чтобы вернулось сразу
    if (activeFilter === "done") render();
  } catch (e) {
    console.error(e);
    alert("Помилка: не вдалося повернути");
  } finally {
    setLoading(false);
  }
}

async function deleteTask(id) {
  setLoading(true, "Видалення…");
  try {
    const json = await callTasksApi_("tasks_delete", { id });
    if (!json || !json.ok) throw new Error(json?.error || "Delete error");

    allTasks = allTasks.filter(t => t.id !== id);
    doneTasks = doneTasks.filter(t => t.id !== id);
    refreshAssigneeFilterOptions_();
    render();
  } catch (e) {
    console.error(e);
    alert("Помилка: не вдалося видалити");
  } finally {
    setLoading(false);
  }
}

/* ===== modal ===== */

function openModalNew() {
  editId = "";
  document.getElementById("taskModalTitle").textContent = "Нова задача";

  document.getElementById("taskTitle").value = "";
  document.getElementById("taskDue").value = "";
  document.getElementById("taskComment").value = "";

  activePriority = "red";
  document.querySelectorAll(".seg-btn").forEach((x) => x.classList.remove("seg-btn--active"));
  document.querySelector('.seg-btn[data-priority="red"]')?.classList.add("seg-btn--active");

  const sel = document.getElementById("taskAssignee");
  if (sel) sel.value = "";

  document.getElementById("taskModal")?.classList.remove("modal-hidden");
    document.body.classList.add("modal-open");
}

function openModalEdit(id) {
  const t = allTasks.find(x => x.id === id);
  if (!t) return;

  editId = id;
  document.getElementById("taskModalTitle").textContent = "Редагувати задачу";

  document.getElementById("taskTitle").value = t.title || "";
  document.getElementById("taskDue").value = formatDueHuman_(t.due) || "";
  document.getElementById("taskComment").value = String(t.comment || "");

  activePriority = t.priority === "blue" ? "blue" : "red";
  document.querySelectorAll(".seg-btn").forEach((x) => x.classList.remove("seg-btn--active"));
  document.querySelector(`.seg-btn[data-priority="${activePriority}"]`)?.classList.add("seg-btn--active");

  const sel = document.getElementById("taskAssignee");
  if (sel) sel.value = t.assignee || "";

  document.getElementById("taskModal")?.classList.remove("modal-hidden");
    document.body.classList.add("modal-open");
}

function closeModal(force = false) {
  if (isSaving && !force) return;

  const modal = document.getElementById("taskModal");
  if (modal) modal.classList.add("modal-hidden");

  document.body.classList.remove("modal-open");
}

async function saveTask() {
  if (isSaving) return;

  const btnSave = document.getElementById("btn-save");
  const btnCancel = document.getElementById("btn-cancel");

  const title = String(document.getElementById("taskTitle")?.value || "").trim();
  const due = String(document.getElementById("taskDue")?.value || "").trim();
  const assignee = String(document.getElementById("taskAssignee")?.value || "").trim();
  const comment = String(document.getElementById("taskComment")?.value || "").trim();

  if (!title) return alert("Введи текст задачі");
  if (due && !/^\d{2}\.\d{2}\.\d{4}$/.test(due)) {
    return alert("Строк має бути DD.MM.YYYY або пусто");
  }

  isSaving = true;
  if (btnSave) { btnSave.disabled = true; btnSave.textContent = "Збереження…"; }
  if (btnCancel) btnCancel.disabled = true;

  setLoading(true, editId ? "Збереження…" : "Додавання…");

  try {
    const payload = editId
      ? { id: editId, data: { title, priority: activePriority, due, assignee, comment } }
      : { data: { title, priority: activePriority, due, assignee, comment } };

    const json = await callTasksApi_(editId ? "tasks_update" : "tasks_add", payload);
    if (!json || !json.ok) throw new Error(json?.error || "Save error");

    editId = "";
    await loadActive();

    // закрываем модалку ПРИНУДИТЕЛЬНО (пока isSaving ещё true)
    closeModal(true);
  } catch (e) {
    console.error(e);
    alert("Помилка збереження");
  } finally {
    setLoading(false);
    isSaving = false;

    if (btnSave) { btnSave.disabled = false; btnSave.textContent = "Зберегти"; }
    if (btnCancel) btnCancel.disabled = false;
  }
}

/* ===== API ===== */

async function callTasksApi_(action, payload = null) {
  if (!payload) {
    const url = `${TASKS_API_URL}?action=${encodeURIComponent(action)}`;
    const res = await fetch(url, { method: "GET" });
    return await res.json();
  }

  const res = await fetch(TASKS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  return await res.json();
}

/* ===== Admins dropdown (optional) ===== */

async function loadAdminsForSelect() {
  const modalSel = document.getElementById("taskAssignee");
  const filterSel = document.getElementById("assigneeFilter");

  if (!modalSel || !filterSel) return;
  if (!SCHEDULE_API_URL || SCHEDULE_API_URL.includes("PASTE_")) return;

  try {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const url = `${SCHEDULE_API_URL}?action=list&month=${encodeURIComponent(month)}`;
    const res = await fetch(url, { method: "GET" });
    const data = await res.json();

    const names = new Set();
    (data?.rows || []).forEach((r) => {
      (r.admin || []).forEach((a) => {
        const n = String(a || "").trim();
        if (n) names.add(n);
      });
    });

    const sorted = [...names].sort((a, b) => a.localeCompare(b));

    // select в модалці
    modalSel.innerHTML = "";
    modalSel.appendChild(new Option("— не вибрано —", ""));
    sorted.forEach((n) => modalSel.appendChild(new Option(n, n)));

    // select-фільтр
    filterSel.innerHTML = "";
    filterSel.appendChild(new Option("Відповідальний: Усі", "__all__"));
    filterSel.appendChild(new Option("Відповідальний: Без відповідального", "__none__"));
    sorted.forEach((n) => filterSel.appendChild(new Option(`Відповідальний: ${n}`, n)));

    filterSel.value = "__all__";
    assigneeFilter = "__all__";
  } catch (e) {
    console.error("Admins load error", e);
  }
}

function refreshAssigneeFilterOptions_() {
  const filterSel = document.getElementById("assigneeFilter");
  if (!filterSel) return;

  const existing = new Set([...filterSel.options].map((o) => o.value));
  const names = new Set(
    allTasks.map(t => String(t.assignee || "").trim()).filter(Boolean)
  );

  [...names].sort((a, b) => a.localeCompare(b)).forEach((n) => {
    if (!existing.has(n)) filterSel.appendChild(new Option(`Відповідальний: ${n}`, n));
  });

  if ([...filterSel.options].some(o => o.value === assigneeFilter)) filterSel.value = assigneeFilter;
  else { assigneeFilter = "__all__"; filterSel.value = "__all__"; }
}

/* ===== helpers ===== */

function setListEmpty(text) {
  const list = document.getElementById("taskList");
  const counter = document.getElementById("taskCounter");
  if (counter) counter.textContent = "";
  if (list) list.innerHTML = `<div class="task-empty">${escapeHtml(text)}</div>`;
}

function toSortableDate_(ddmmyyyy) {
  const s = String(ddmmyyyy || "").trim();
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function setLoading(on, text) {
  const el = document.getElementById("global-loader");
  const t = document.getElementById("global-loader-text");
  if (!el) return;
  if (t && text) t.textContent = text;
  el.classList.toggle("global-loader--hidden", !on);
}

function formatDueHuman_(due) {
  if (!due) return "";
  const s = String(due).trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }
  return s;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function setVhUnit(){
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setVhUnit();
window.addEventListener('resize', setVhUnit);
window.addEventListener('orientationchange', setVhUnit);