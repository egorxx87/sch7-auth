// index.js — dashboard (today + tomorrow + calendar events)

// ====== SCHEDULE (same as schedule.html) ======
const SCHEDULE_API_URL =
  "https://script.google.com/macros/s/AKfycbzagvHUuF_o3O8O6vnZbClW74R9QxKFfCsaGb2hHuSVtcD3uCbsjUwJm89MVdLJVELvYQ/exec";

// ====== RESERVATIONS (same as reservation.html) ======
const RESERVATION_API_URL =
  "https://script.google.com/macros/s/AKfycbwNlMF6GEshtn2-5C1n-EsaCRkNZa2xPOQ2mA2zfdYvZyEIl3JSk4evG2NgkCMQaUdqaA/exec";

// ====== TASKS + CALENDAR (gcal_events добавлен сюда) ======
const TASKS_API_URL =
  "https://script.google.com/macros/s/AKfycbzKxxknHm2WBYLRzNOAWaK66VGvUZMbT5tPjpTR6j2J_uYh838LRI5Nk0a2H4DPIkkG/exec";

// календарь берём из того же скрипта, где ты добавил action "gcal_events"
const CALENDAR_API_URL =
  "https://script.google.com/macros/s/AKfycbyQ4r7ZG3xdkyD30f0je-gFW2GZiQ4R7XApdN1R-tEc2WYy0md5TAz0-rTJd7M67P44Kw/exec";
  const HOME_HOLIDAY_API_URL =
  "https://script.google.com/macros/s/AKfycbw-yTbvyKAw8cO6j2dkopRYbGx5aHCB7nAxcG8M5yXAKGGLL8plNe9hUkiPO86LmZTD2A/exec";

const ADMIN_COLS = 3;
let _schedCache = null;

document.addEventListener("DOMContentLoaded", () => {
  loadDutyAdminsForOffset(0, "duty-admin-today");
  loadDutyAdminsForOffset(1, "duty-admin-tomorrow");

  loadReservationsSummary(0);
  loadReservationsSummary(1);

  loadScheduleSummary(0);
  loadScheduleSummary(1);

  loadTasksMini();

  // ✅ события на главной: сегодня/завтра/неделя
  initHomeEvents();
});
async function fetchJson(url) {
  const u = url + (url.includes("?") ? "&" : "?") + `_=${Date.now()}`;
  const res = await fetch(u, { method: "GET", cache: "no-store" });
  const txt = await res.text();
  return JSON.parse(txt);
}
/* =========================
   DUTY ADMINS
========================= */

async function loadDutyAdminsForOffset(dayOffset, targetId){
  const hostEl = document.getElementById(targetId);
  if (!hostEl) return;

  try {
    const targetDate = addDays(new Date(), dayOffset);
    const month = formatMonthParam(targetDate);

    // 🔹 загрузка и кэш расписания (fetch-only)
    if (!_schedCache || _schedCache.month !== month){
      const data = await fetchJson(`${SCHEDULE_API_URL}?action=list&month=${month}`);
      _schedCache = {
        month,
        rows: (data && Array.isArray(data.rows)) ? data.rows : []
      };
    }

    const rows = _schedCache.rows;
    const targetISO = toISODate(targetDate);

    const dayRows = rows
      .map(r => ({
        date: String(r.date || "").trim(),
        time: normalizeTime(r.time),
        admin: Array.isArray(r.admin) ? r.admin : [],
      }))
      .filter(r => r.date === targetISO && r.time)
      .sort((a,b) => (a.time || "").localeCompare(b.time || ""));

    if (!dayRows.length) {
      hostEl.textContent =
        (dayOffset === 0)
          ? "Немає чергового сьогодні"
          : "Немає чергового завтра";
      hideDutyNote();
      return;
    }

    // 🔹 собираем интервалы по администраторам
    const map = new Map();
    dayRows.forEach(r => {
      for (let i = 0; i < ADMIN_COLS; i++){
        const n = String(r.admin[i] || "").trim();
        if (!n) continue;
        if (!map.has(n)) map.set(n, []);
        map.get(n).push(r.time);
      }
    });

    if (!map.size) {
      hostEl.textContent =
        (dayOffset === 0)
          ? "Немає чергового сьогодні"
          : "Немає чергового завтра";
      hideDutyNote();
      return;
    }

    const lines = [];
    for (const [name, times] of map.entries()){
      times.sort((a,b)=>a.localeCompare(b));
      const intervals = buildIntervalsFromTimes(times);
      lines.push({ name, text: intervals.join(", ") });
    }

    // 🔹 рендер
    hostEl.innerHTML = lines.map(x => {
      const s = String(x.name || "");

      // фикс: один пробел между датой/временем и именем
      const fixedName = s.replace(
        /^(\d{2}\.\d{2}\s+\d{1,2}:\d{2})\s*(.*)$/,
        (m, prefix, rest) => rest ? `${prefix} ${rest}` : prefix
      );

      return `
        <div style="margin-bottom:8px;">
          <strong>${escapeHtml(fixedName)}</strong><br>
          <span>${escapeHtml(x.text)}</span>
        </div>
      `;
    }).join("");

    hideDutyNote();

  } catch (e) {
    console.error(e);
    hostEl.textContent = "Помилка завантаження";
    hideDutyNote();
  }
}

function hideDutyNote(){
  const adminCard = document.querySelector(".dashboard-module");
  if (!adminCard) return;
  const note = adminCard.querySelector(".module-note");
  if (note) note.style.display = "none";
}

/* =========================
   RESERVATIONS (today/tomorrow)
========================= */
applyHomeScheduleHolidayBadges_();



async function loadReservationsSummary(dayOffset){
  const guestsEl = document.getElementById(dayOffset === 0 ? "res-today-guests" : "res-tomorrow-guests");
  const timesEl  = document.getElementById(dayOffset === 0 ? "res-today-times"  : "res-tomorrow-times");
  if (!guestsEl || !timesEl) return;

  const toMin = (t) => {
    const m = String(t||"").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1])*60 + Number(m[2]);
  };

  const now = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  const nowStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

  try {
    const target = addDays(new Date(), dayOffset);
    const ddmmyyyy = toDDMMYYYY(target);

    const res = await fetch(`${RESERVATION_API_URL}?action=getByDate&date=${encodeURIComponent(ddmmyyyy)}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Reservation load error");

    const data = Array.isArray(json.data) ? json.data : [];

    const rows = data.map(it => {
      const time = String(it.time || "").trim();
      
      const min = toMin(time);
      const guests = parseInt(String(it.guests ?? "").replace(/[^\d]/g,""), 10) || 0;

      const src = String(it.source || it.Source || it.SOURCE || it.from || "").trim();
      const isQuandoo = /quandoo/i.test(src);
      const badge = isQuandoo ? "Quandoo" : "ручн.";

      // ✅ только столбец G (Меню)
      // ✅ только столбец G (Меню)
const menuRaw = String(it.menu ?? "").trim();
const menuKey = menuRaw.toLowerCase();

let menuHtml = "";

// показываем ТОЛЬКО для ручных
if (!isQuandoo) {

  // 1️⃣ пусто → Меню ?
  if (!menuRaw) {
    menuHtml = `<span class="mini-res-menu mini-res-menu--unknown">Меню ?</span>`;
  }

  // 2️⃣ любые варианты "немає / немае / нема / нет"
  else if (/^нем/i.test(menuKey) || ["нет","no","none"].includes(menuKey)) {
    menuHtml = "";
  }

  // 3️⃣ ЛЮБОЕ вхождение "меню"
  else if (/меню/i.test(menuKey)) {
    menuHtml = `<span class="mini-res-menu mini-res-menu--yes">Меню</span>`;
  }

  // 4️⃣ всё остальное — игнор
  else {
    menuHtml = "";
  }
}
      const status = String(it.status || it.STATUS || "").toLowerCase().trim();
      const cancelled =
        status === "cancelled" ||
        status === "canceled" ||
        String(it.cancelled || "").toLowerCase() === "true";

      return { time, min, guests, badge, isQuandoo, cancelled, menuHtml };
    }).filter(r => r.min !== null).sort((a,b)=>a.min-b.min);

    if (!rows.length){
      guestsEl.textContent = "0";
      timesEl.textContent = "Немає резервацій";
      return;
    }

    const active = rows.filter(r=>!r.cancelled);
    const totalGuests = active.reduce((s,r)=>s+r.guests,0);
    const manualCount = active.filter(r=>!r.isQuandoo).length;
    const quandooCount = active.filter(r=>r.isQuandoo).length;
    const manualGuests = active.filter(r=>!r.isQuandoo).reduce((s,r)=>s+r.guests,0);
    const quandooGuests = active.filter(r=>r.isQuandoo).reduce((s,r)=>s+r.guests,0);
    const cancelledCount = rows.filter(r=>r.cancelled).length;

    guestsEl.textContent = String(totalGuests);

    const renderRow = (r, past) => {
  const cls = ["mini-res-row", past ? "is-past" : "", r.cancelled ? "is-cancelled" : ""]
    .filter(Boolean).join(" ");

  const badgeCls = r.isQuandoo ? "bq" : "bm";
  const cancelTag = r.cancelled ? `<span class="mini-res-cancel">скасовано</span>` : "";

  return `
    <div class="${cls}">
      <span class="mini-res-time">${escapeHtml(r.time)}</span>
      <span class="mini-res-guests">${r.guests}</span>

      <span class="mini-res-right">
        ${r.menuHtml || ""}
        <span class="mini-res-badge ${badgeCls}">${r.badge}</span>
        ${cancelTag}
      </span>
    </div>
  `;
};

    const sub = `
      <div class="mini-sub">
        резервації: ${manualCount} ручн. / ${quandooCount} Quandoo · гості: ${manualGuests} / ${quandooGuests}
        ${cancelledCount ? `<span class="mini-sub--cancel"> · скасовано: ${cancelledCount}</span>` : ""}
      </div>
    `;

    const nowLine = `
      <div class="mini-now">
        <span class="mini-now-dot"></span><span class="mini-now-line"></span><span class="mini-now-time">${nowStr}</span>
      </div>
    `;

    const stateKey = dayOffset === 0 ? "expandedToday" : "expandedTomorrow";
    const initialExpanded = timesEl.dataset[stateKey] === "1";

    const buildFullTodayHtml = () => {
      const splitIdx = rows.findIndex(r => r.min > nowMin);
      if (splitIdx === -1) {
        return rows.map(r => renderRow(r, true)).join("") + nowLine;
      } else if (splitIdx === 0) {
        return nowLine + rows.map(r => renderRow(r, false)).join("");
      } else {
        return rows.slice(0, splitIdx).map(r => renderRow(r, true)).join("") +
               nowLine +
               rows.slice(splitIdx).map(r => renderRow(r, false)).join("");
      }
    };

    const buildCollapsedTodayHtml = () => {
      const past = rows.filter(r => r.min <= nowMin);
      const future = rows.filter(r => r.min > nowMin);

      const pastTop = past.slice(-2);
      const futureTop = future.slice(0, 5);

      return pastTop.map(r => renderRow(r, true)).join("") +
             nowLine +
             futureTop.map(r => renderRow(r, false)).join("");
    };

    const buildTomorrowHtml = (expanded) => {
      if (expanded) return rows.map(r => renderRow(r, false)).join("");
      return rows.slice(0, 6).map(r => renderRow(r, false)).join("");
    };

    const hasMore =
      (dayOffset === 0)
        ? rows.length > (rows.filter(r=>r.min<=nowMin).slice(-2).length + rows.filter(r=>r.min>nowMin).slice(0,5).length)
        : rows.length > 6;

    function render(expanded){
      let listHtml = "";
      if (dayOffset === 0) listHtml = expanded ? buildFullTodayHtml() : buildCollapsedTodayHtml();
      else listHtml = buildTomorrowHtml(expanded);

      const btn = hasMore ? `
        <button class="mini-res-btn mini-res-toggle" type="button">
          ${expanded ? "Згорнути" : "Показати всі"}
        </button>
      ` : "";

      timesEl.innerHTML = sub + listHtml + btn;

      const toggleBtn = timesEl.querySelector(".mini-res-toggle");
      if (!toggleBtn) return;

      toggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const nextExpanded = !expanded;
        timesEl.dataset[stateKey] = nextExpanded ? "1" : "0";
        render(nextExpanded);
      }, { passive:false });
    }

    render(initialExpanded);

  } catch (e) {
    console.error(e);
    guestsEl.textContent = "—";
    timesEl.textContent = "Помилка завантаження";
  }
}/* =========================
   SCHEDULE (today/tomorrow) — roles only
========================= */

async function loadScheduleSummary(dayOffset){
  const box = document.getElementById(dayOffset === 0 ? "schedule-today" : "schedule-tomorrow");
  if (!box) return;

  try {
    const targetDate = addDays(new Date(), dayOffset);
    const month = formatMonthParam(targetDate);

    if (!_schedCache || _schedCache.month !== month){
  const data = await fetchJson(`${SCHEDULE_API_URL}?action=list&month=${month}`);
  _schedCache = { month, rows: (data && data.rows) ? data.rows : [] };
}

    const rows = _schedCache.rows;
    const targetISO = toISODate(targetDate);

    const dayRows = rows
      .map(r => ({
        date: String(r.date || "").trim(),
        time: normalizeTime(r.time),
        kellner: Array.isArray(r.kellner) ? r.kellner : [],
        kueche: Array.isArray(r.kueche) ? r.kueche : [],
        reinigung: Array.isArray(r.reinigung) ? r.reinigung : [],
      }))
      .filter(r => r.date === targetISO && r.time)
      .sort((a,b) => a.time.localeCompare(b.time));

    const roleMaps = {
      Kellner: new Map(),
      "Küche": new Map(),
      Reinigung: new Map(),
    };

    for (const r of dayRows){
      pushRole(roleMaps.Kellner, r.kellner, r.time);
      pushRole(roleMaps["Küche"], r.kueche, r.time);
      pushRole(roleMaps.Reinigung, r.reinigung, r.time);
    }

    box.innerHTML = `
      ${renderRole("Kellner", roleMaps.Kellner)}
      ${renderRole("Küche", roleMaps["Küche"])}
      ${renderRole("Reinigung", roleMaps.Reinigung)}
    `;
  } catch (e) {
    console.error(e);
    box.textContent = "Помилка завантаження";
  }
}

function pushRole(map, arr, time){
  for (const n0 of arr){
    const n = String(n0 || "").trim();
    if (!n) continue;
    if (!map.has(n)) map.set(n, []);
    map.get(n).push(time);
  }
}

function renderRole(title, map){
  if (!map || map.size === 0) {
    return `<div class="role"><b>${title}</b><div>—</div></div>`;
  }
  const lines = [];
  for (const [name, times] of map.entries()){
    times.sort((a,b)=>a.localeCompare(b));
    const intervals = buildIntervalsFromTimes(times);
    lines.push(`${escapeHtml(name)}: ${escapeHtml(intervals.join(", "))}`);
  }
  return `<div class="role"><b>${title}</b><div>${lines.join("<br>")}</div></div>`;
}

/* =========================
   TASKS mini on dashboard
========================= */

async function loadTasksMini(){
  const list = document.getElementById("tasks-mini-list");
  const empty = document.getElementById("tasks-mini-empty");
  if (!list || !empty) return;

  try {
    // ⬇️ ТОЛЬКО fetch
    const json = await fetchJson(`${TASKS_API_URL}?action=tasks_list`);

    if (!json || !json.ok) {
      throw new Error((json && json.error) ? json.error : "tasks_list error");
    }

    const data = Array.isArray(json.data) ? json.data : [];
    const open = data.filter(t => (t.status || "open") === "open");

    if (!open.length){
      list.innerHTML = `<div class="task-empty">Немає активних завдань</div>`;
      return;
    }

    open.sort((a,b) => {
      const ap = (a.priority === "red") ? 0 : 1;
      const bp = (b.priority === "red") ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return String(b.createdAt||"").localeCompare(String(a.createdAt||""));
    });

    const top = open.slice(0, 3);
    const more = open.length - top.length;

    list.innerHTML =
      top.map(t => {
        const badgeClass = (t.priority === "red")
          ? "badge badge--red"
          : "badge badge--blue";

        const prText = (t.priority === "red")
          ? "🔴 Срочно"
          : "🔵 Звичайно";

        const dueStr = formatDueHuman_(t.due);
        const due = dueStr ? `⏳ ${escapeHtml(dueStr)}` : "⏳ без строку";
        const who = String(t.assignee || "").trim();

        return `
          <div class="task-row" style="padding:10px; cursor:pointer;" onclick="location.href='tasks.html'">
            <div class="task-left">
              <div class="task-title" style="font-size:14px;">
                ${escapeHtml(t.title || "")}
              </div>
              <div class="task-meta" style="margin-top:6px;">
                <span class="${badgeClass}">${prText}</span>
                <span class="task-due">${due}</span>
                ${who ? `<span class="task-due">👤 ${escapeHtml(who)}</span>` : ``}
              </div>
            </div>
          </div>
        `;
      }).join("") +
      (more > 0
        ? `<div style="margin-top:8px;color:#6b7280;font-weight:700;">Ще +${more}…</div>`
        : ""
      );

  } catch (e){
    console.error(e);
    list.innerHTML = `<div class="task-empty">Помилка завантаження задач</div>`;
  }
}

/* =========================
   HOME EVENTS (Today / Tomorrow / Next7)
   - Renders into #homeEventsToday / #homeEventsTomorrow / #homeEventsWeek
   - Uses the SAME markup/classes as mini_events ("mini-event")
   - Backend range: today | tomorrow | next7
========================= */

function initHomeEvents(){
  const t  = document.getElementById("homeEventsToday");
  const tm = document.getElementById("homeEventsTomorrow");
  const w  = document.getElementById("homeEventsWeek");

  // ✅ New layout (3 columns inside module)
  if (t && tm && w){
    loadHomeEventsTriple_();
    return;
  }

  // 🧯 Old layout (tabs + #eventsList) — keep only if it still exists somewhere
  const buttons = document.querySelectorAll(".btn-ev");
  if (!buttons.length) return;

  buttons.forEach(b => b.addEventListener("click", () => {
    buttons.forEach(x => x.classList.remove("btn--active"));
    b.classList.add("btn--active");
    loadHomeEventsLegacy_(b.dataset.range || "today");

    // обновляем бейджи при переключении (если нужно)
    initHomeHolidayBadges_();
  }));

  loadHomeEventsLegacy_("today");
  initHomeHolidayBadges_();
}

async function loadHomeEventsTriple_(){
  const boxToday = document.getElementById("homeEventsToday");
  const boxTomorrow = document.getElementById("homeEventsTomorrow");
  const boxWeek = document.getElementById("homeEventsWeek");
  if (!boxToday || !boxTomorrow || !boxWeek) return;

  boxToday.textContent = "Завантаження…";
  boxTomorrow.textContent = "Завантаження…";
  boxWeek.textContent = "Завантаження…";

  try{
    const [todayEvents, tomorrowEvents, next7Events] = await Promise.all([
      fetchHomeEvents_("today"),
      fetchHomeEvents_("tomorrow"),
      fetchHomeEvents_("next7"),
    ]);

    // Сьогодні / Завтра
    renderHomeEventsList_(todayEvents, "homeEventsToday", 6, true);
    renderHomeEventsList_(tomorrowEvents, "homeEventsTomorrow", 6, true);

    // next7 — без дублей today/tomorrow (на всякий)
    const shown = new Set();
    (todayEvents || []).forEach(e => shown.add(homeDedupKey_(e)));
    (tomorrowEvents || []).forEach(e => shown.add(homeDedupKey_(e)));

    const filteredNext7 = (next7Events || []).filter(e => e && !shown.has(homeDedupKey_(e)));
    renderHomeEventsList_(filteredNext7, "homeEventsWeek", 10, false);

  } catch(e){
    console.error(e);
    boxToday.innerHTML = `<div class="mini-events__empty">Помилка завантаження</div>`;
    boxTomorrow.innerHTML = `<div class="mini-events__empty">Помилка завантаження</div>`;
    boxWeek.innerHTML = `<div class="mini-events__empty">Помилка завантаження</div>`;
  }
}

async function fetchHomeEvents_(range){
  const res = await fetch(CALENDAR_API_URL + `?_=${Date.now()}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "gcal_events", range })
  });

  const json = await res.json();
  if (!json || !json.ok) throw new Error((json && json.error) ? json.error : "Помилка календаря");
  return Array.isArray(json.events) ? json.events : [];
}

function renderHomeEventsList_(events, elementId, limit, compactForDay){
  const box = document.getElementById(elementId);
  if (!box) return;

  const arr = Array.isArray(events) ? events : [];
  if (!arr.length){
    box.innerHTML = `<div class="mini-events__empty">Немає подій</div>`;
    return;
  }

  const top = arr.slice(0, limit);
  const more = arr.length - top.length;

  box.innerHTML =
    top.map(e => renderHomeEventItem_(e, compactForDay)).join("") +
    (more > 0 ? `<div class="mini-events__more">+ ще ${more}…</div>` : "");
}

function renderHomeEventItem_(e, compactForDay){
  const title = escapeHtml(e?.summary || "(без назви)");
  const time  = compactForDay ? formatHomePrefixCompact_(e) : formatHomePrefixFull_(e);

  return `
    <div class="mini-event">
      <div class="mini-event__time">${escapeHtml(time)}</div>
      <div class="mini-event__title">${title}</div>
    </div>
  `;
}

// dedup key: local day + cleaned title
function homeDedupKey_(e){
  const title = String(e?.summary || "")
    .replace(/\s+/g," ")
    .trim()
    .toLowerCase();

  let day = "";
  if (e && e.start){
    const d = new Date(e.start);
    if (!isNaN(d)) day = isoLocal_(d); // helper below
  }
  return `${day}|${title}`;
}

function formatHomePrefixCompact_(e){
  if (!e || !e.start) return "";
  if (e.allDay) return "весь день";

  const d = new Date(e.start);
  if (isNaN(d)) return "";
  const hh = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  return `${hh}:${mi}`;
}

function formatHomePrefixFull_(e){
  if (!e || !e.start) return "";
  const d = new Date(e.start);
  if (isNaN(d)) return "";

  const wdArr = ["Нд","Пн","Вт","Ср","Чт","Пт","Сб"];
  const wd = wdArr[d.getDay()] || "";
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");

  if (e.allDay) return `${wd} ${dd}.${mm}`;

  const hh = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  return `${wd} ${dd}.${mm} ${hh}:${mi}`;
}

/* ----- legacy (old #eventsList layout) ----- */

async function loadHomeEventsLegacy_(range){
  const list = document.getElementById("eventsList");
  if (!list) return;

  list.textContent = "Завантаження…";

  try{
    const res = await fetch(CALENDAR_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "gcal_events", range })
    });

    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Помилка календаря");

    const items = Array.isArray(json.events) ? json.events : [];
    if (!items.length){
      list.innerHTML = `<div style="color:#6b7280;font-weight:800;">Немає подій</div>`;
      return;
    }

    list.innerHTML = items.map(renderEventRow_).join("");
  } catch(e){
    console.error(e);
    list.innerHTML = `<div style="color:#b91c1c;font-weight:900;">Помилка: ${escapeHtml(e.message||String(e))}</div>`;
  }
}

function renderEventRow_(e){
  const title = escapeHtml(e.summary || "(без назви)");
  const time = formatEventTime_(e);
  const loc = e.location ? `<div class="event-meta">${escapeHtml(e.location)}</div>` : "";

  return `
    <div class="event-row">
      <div class="event-time">${escapeHtml(time)}</div>
      <div>
        <div class="event-title">${title}</div>
        ${loc}
      </div>
    </div>
  `;
}

function formatEventTime_(e){
  if (!e.start) return "";
  const d = new Date(e.start);
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");

  if (e.allDay) return `${dd}.${mm} (весь день)`;

  const hh = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  return `${dd}.${mm} ${hh}:${mi}`;
}


/* =========================
   Helpers
========================= */

function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function pad2(n){ return String(n).padStart(2,"0"); }

function toISODate(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function formatMonthParam(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
}
function toDDMMYYYY(d){
  return `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()}`;
}

function normalizeTime(raw){
  if (raw === null || raw === undefined) return "";
  if (raw instanceof Date) return `${pad2(raw.getHours())}:${pad2(raw.getMinutes())}`;
  if (typeof raw === "number" && isFinite(raw)) {
    const totalMinutes = Math.round(raw * 24 * 60);
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    return `${pad2(hh)}:${pad2(mm)}`;
  }
  const s = String(raw).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${pad2(parseInt(m[1],10))}:${m[2]}`;
  return s;
}

function buildIntervalsFromTimes(times){
  if (!times || !times.length) return [];
  const res = [];
  let start = times[0];
  let prev  = times[0];

  for (let i=1; i<times.length; i++){
    const cur = times[i];
    const prevH = parseInt(prev.slice(0,2),10);
    const curH  = parseInt(cur.slice(0,2),10);
    if (curH === prevH + 1) prev = cur;
    else { res.push(`${start}–${prev}`); start = cur; prev = cur; }
  }
  res.push(`${start}–${prev}`);
  return res;
}

function formatDueHuman_(due){
  if (!due) return "";
  const s = String(due).trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()}`;
  }
  return s;
}



function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function pad2_(n){ return String(n).padStart(2,"0"); }
function isoLocal_(d){
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2_(x.getMonth()+1)}-${pad2_(x.getDate())}`;
}
function addDays_(d, n){
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(0,0,0,0);
  return x;
}

async function fetchHolidaySetForWeek_(){
  try{
    // важно: берём week, чтобы покрыть и сегодня, и завтра, и переход года
    const res = await fetch(`${HOME_HOLIDAY_API_URL}?action=gcal_events&range=week&_=${Date.now()}`, { cache:"no-store" });
    const data = await res.json();
    const events = Array.isArray(data?.events) ? data.events : [];

    const set = new Set();
    for (const ev of events){
      if (String(ev?.calendarType || "").toLowerCase() !== "holiday") continue;

      // FIX: у allDay в ICS может быть start в UTC (например 2025-12-31T23:00Z),
      // поэтому берём ЛОКАЛЬНУЮ дату из Date().
      const dt = new Date(ev.start);
      if (isNaN(dt)) continue;
      set.add(isoLocal_(dt));
    }
    return set;
  } catch(e){
    console.warn("home holidays load failed:", e);
    return new Set();
  }
}

function setHolidayBadgeOnTitle_(titleEl, on){
  if (!titleEl) return;

  let b = titleEl.querySelector(":scope > .home-holiday-badge");
  if (on){
    if (!b){
      b = document.createElement("span");
      b.className = "home-holiday-badge";
      b.textContent = "Свято";
      titleEl.appendChild(b);
    }
  } else {
    if (b) b.remove();
  }
}

async function applyHomeScheduleHolidayBadges_(){
  const todayList = document.getElementById("schedule-today");
  const tomorrowList = document.getElementById("schedule-tomorrow");
  if (!todayList || !tomorrowList) return;

  const todayTitle = todayList.closest(".mini-card")?.querySelector(".mini-title");
  const tomorrowTitle = tomorrowList.closest(".mini-card")?.querySelector(".mini-title");

  const holidaySet = await fetchHolidaySetForWeek_();

  const todayISO = isoLocal_(new Date());
  const tomorrowISO = isoLocal_(addDays_(new Date(), 1));

  setHolidayBadgeOnTitle_(todayTitle, holidaySet.has(todayISO));
  setHolidayBadgeOnTitle_(tomorrowTitle, holidaySet.has(tomorrowISO));
}
