document.addEventListener("DOMContentLoaded", async () => {
  const SCHEDULE_API_URL =
    "https://script.google.com/macros/s/AKfycbxbbznamVwMb39TvLR5LpSE7bGk1uWn6Lw1HUH_WKwMboggPyYUXosMbgs-LUo9mRnSMg/exec";
// HOLIDAYS API (тот же, что на главной)
const MINI_CALENDAR_API_URL =
  "https://script.google.com/macros/s/AKfycbw-yTbvyKAw8cO6j2dkopRYbGx5aHCB7nAxcG8M5yXAKGGLL8plNe9hUkiPO86LmZTD2A/exec";
  const MODE_DAY = "day";
  const MODE_WEEK = "week";
  const MODE_MONTH = "month";

  // Роли + список имён (для пикера) — база. Дальше будет расширяться автоматически.
  const ROLE_OPTIONS = {
    admin: ["Egor", "Karina", "Maxym"],
    kellner: ["Jane", "Mykola", "Zeindi", "Dima", "Vladyslav", "Karina", "Michi", "Egor"],
    kueche: ["Pavlo", "Tymur", "Hlib", "Oleksandr", "Vsevolod", "Danja", "Artur"],
    reinigung: ["Inna", "Tymur", "Oleksandr"]
  };

  // Палитра цветов
  const COLOR_PRESETS = [
    "#34d399", "#22c55e", "#16a34a",
    "#60a5fa", "#3b82f6", "#2563eb",
    "#a78bfa", "#8b5cf6", "#7c3aed",
    "#f472b6", "#ec4899", "#db2777",
    "#fb923c", "#f97316", "#ea580c",
    "#fbbf24", "#f59e0b", "#d97706",
    "#94a3b8", "#64748b"
  ];

  // DOM
  const weekLabelEl = document.getElementById("schedule-week-label");
  const subLabelEl = document.getElementById("schedule-sub-label");
  const scheduleContentEl = document.getElementById("schedule-content");

  const prevBtn = document.getElementById("schedule-prev-period");
  const nextBtn = document.getElementById("schedule-next-period");
  const todayBtn = document.getElementById("schedule-today");

  const modeDayBtn = document.getElementById("mode-day");
  const modeWeekBtn = document.getElementById("mode-week");
  const modeMonthBtn = document.getElementById("mode-month");

  const openStatsBtn = document.getElementById("open-stats");
  const closeStatsBtn = document.getElementById("close-stats");
  const sectionSchedule = document.getElementById("section-schedule");
  const sectionStats = document.getElementById("section-stats");

  const loaderEl = document.getElementById("global-loader");
  const loaderTextEl = document.getElementById("global-loader-text");

  // Picker
  const pickerBackdrop = document.getElementById("picker-backdrop");
  const pickerRoleLabel = document.getElementById("picker-role-label");
  const pickerOptionsEl = document.getElementById("picker-options");
  const pickerClearBtn = document.getElementById("picker-clear");
  const pickerCustomBtn = document.getElementById("picker-custom");
  const pickerCancelBtn = document.getElementById("picker-cancel");

  // Stats
  const statsSummaryEl = document.getElementById("stats-summary");
  const statsTableEl = document.getElementById("stats-table");
  const statsMonthCurrentBtn = document.getElementById("stats-month-current");
  const statsMonthPrevBtn = document.getElementById("stats-month-prev");
  const statsRoleButtons = document.querySelectorAll("[data-stats-role]");

  // WEEK FILTER
  const weekFilterEl = document.getElementById("week-filter");
  const weekCompactEl = document.getElementById("week-compact-view");

  // MONTH FILTER (динамически)
  const monthFilterEl = document.createElement("div");
  monthFilterEl.id = "month-filter";
  monthFilterEl.className = "week-filter";
  monthFilterEl.style.display = "none";

  const monthRoleViewEl = document.createElement("div");
  monthRoleViewEl.id = "month-role-view";
  monthRoleViewEl.style.display = "none";

  // State
  let currentMode = MODE_DAY;
  let currentDate = new Date();
  let allRows = [];
  let currentRows = [];
  let pickerState = null;

  // Colors (shared)
  let NAME_COLORS = {};

  // meta poll
  let _lastMetaVer = null;

  // scroll anchor (mobile jump fix)
  let _scrollAnchorISO = null;

  const statsState = {
    activeSlot: "current",
    role: "all",
    data: null,
    monthLabels: {},
    slotMapping: { current: "current", previous: "previous" }
  };

  // ==============================
  // HELPERS
  // ==============================
  // ==============================
// HOLIDAYS (only "holiday")
// ==============================
// ==============================
// HOLIDAYS (only "holiday")
// ==============================
let HOLIDAY_SET = new Set();

// локальная YYYY-MM-DD (важно!)
function localISODate_(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

// нормализуем event.start -> YYYY-MM-DD в ЛОКАЛЬНОЙ дате
function eventStartISO_(ev){
  const raw = String(ev?.start || "").trim();
  if (!raw) return "";

  // если allDay и пришло чистое YYYY-MM-DD — используем напрямую
  if (ev?.allDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // иначе парсим Date и берём локальную дату
  const d = new Date(raw);
  if (isNaN(d)) {
    // fallback: хотя бы срез
    return raw.slice(0,10);
  }
  return localISODate_(d);
}
async function loadHolidaysForRange_(start, end) {
  HOLIDAY_SET = new Set();

  const startDay = getDayStart(start);
  const endDay = getDayStart(end);

  // ⚠️ ВАЖНО: to делаем EXCLUSIVE = end + 1 день
  const endExclusive = new Date(endDay);
  endExclusive.setDate(endExclusive.getDate() + 1);

  const fromISO = toISODate_(startDay);
  const toISO = toISODate_(endExclusive);

  try {
    // 1) Основной вариант: точный диапазон
    const url =
      `${MINI_CALENDAR_API_URL}?action=gcal_events` +
      `&from=${encodeURIComponent(fromISO)}` +
      `&to=${encodeURIComponent(toISO)}` +
      `&_=${Date.now()}`;

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    let data = null;
    try { data = JSON.parse(text); } catch (_) { data = null; }

    // Если backend не вернул events — пробуем fallback (но он НЕ спасёт январь, если backend не умеет from/to)
    if (!data || data.ok !== true || !Array.isArray(data.events)) {
      const fallbackUrl =
        `${MINI_CALENDAR_API_URL}?action=gcal_events&range=month&_=${Date.now()}`;
      const res2 = await fetch(fallbackUrl, { cache: "no-store" });
      data = await res2.json();
    }

    const events = Array.isArray(data?.events) ? data.events : [];

    const startMs = startDay.getTime();
    const endMs = endDay.getTime();

    for (const ev of events) {
      if (String(ev?.calendarType || "").toLowerCase() !== "holiday") continue;

      const iso = String(ev?.start || "").slice(0, 10);
      if (!iso) continue;

      const d = parseISODate(iso);
      if (!d) continue;

      const t = getDayStart(d).getTime();
      if (t >= startMs && t <= endMs) {
        HOLIDAY_SET.add(iso);
      }
    }
  } catch (e) {
    console.warn("holidays load failed:", e);
  }
}

function applyHolidayUI_() {
  const ensureBadge = (container) => {
    if (!container) return;
    let b = container.querySelector(":scope > .sch-holiday-badge");
    if (!b) {
      b = document.createElement("span");
      b.className = "sch-holiday-badge";
      b.textContent = "Свято";
      container.appendChild(b);
    }
  };

  const removeBadge = (container) => {
    if (!container) return;
    const b = container.querySelector(":scope > .sch-holiday-badge");
    if (b) b.remove();
  };

  // =========================
  // ✅ DAY: бейдж рядом с верхним заголовком "День ..."
  // =========================
  try {
    const isoDay = toISODate_(getDayStart(currentDate));
    const hasDayHoliday = HOLIDAY_SET.has(isoDay);

    if (weekLabelEl) {
      // чтобы бейдж красиво стоял рядом с текстом
      weekLabelEl.classList.add("week-day-title--flex");
      if (hasDayHoliday) ensureBadge(weekLabelEl);
      else removeBadge(weekLabelEl);
    }
  } catch (_) {}

  // =========================
  // Week/Month cards (заголовок дня)
  // =========================
  document.querySelectorAll(".week-day-card[data-iso]").forEach(card => {
    const iso = card.getAttribute("data-iso");
    const has = iso && HOLIDAY_SET.has(iso);

    card.classList.toggle("has-holiday", !!has);

    const title = card.querySelector(".week-day-title");
    if (!title) return;

    title.classList.add("week-day-title--flex");

    if (has) ensureBadge(title);
    else removeBadge(title);
  });

  // =========================
  // Role timeline headers
  // =========================
  document.querySelectorAll(".week-role-head--day[data-iso]").forEach(head => {
    const iso = head.getAttribute("data-iso");
    const has = iso && HOLIDAY_SET.has(iso);

    head.classList.toggle("has-holiday", !!has);
    head.classList.add("week-role-head--dayflex");

    if (has) ensureBadge(head);
    else removeBadge(head);
  });
}

  function setLoading(on, text = "Завантаження...") {
    if (!loaderEl) return;
    if (loaderTextEl) loaderTextEl.textContent = text;
    loaderEl.classList.toggle("global-loader--hidden", !on);

    if (prevBtn) prevBtn.disabled = on;
    if (nextBtn) nextBtn.disabled = on;
    if (todayBtn) todayBtn.disabled = on;
    if (modeDayBtn) modeDayBtn.disabled = on;
    if (modeWeekBtn) modeWeekBtn.disabled = on;
    if (modeMonthBtn) modeMonthBtn.disabled = on;
    if (openStatsBtn) openStatsBtn.disabled = on;
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function toISODate_(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function formatDate(d) {
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  }

  function formatMonthYear(d) {
    return `${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  }

  function getWeekdayName(d) {
    return d.toLocaleDateString("de-DE", { weekday: "long" });
  }

  function getDayStart(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function getWeekRange(d) {
    const start = getDayStart(d);
    const day = start.getDay();
    const diff = (day + 6) % 7; // Monday
    start.setDate(start.getDate() - diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }

  function getMonthRange(d) {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return { start, end };
  }

  function parseISODate(str) {
    if (!str) return null;
    if (str instanceof Date) return new Date(str.getFullYear(), str.getMonth(), str.getDate());

    const s = String(str).trim();

    // yyyy-mm-dd
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

    // dd.mm.yyyy
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

    const d = new Date(s);
    if (!isNaN(d)) return new Date(d.getFullYear(), d.getMonth(), d.getDate());

    return null;
  }

  function normalizeTime(raw) {
    if (raw === null || raw === undefined) return "";

    if (raw instanceof Date) {
      return `${pad2(raw.getHours())}:${pad2(raw.getMinutes())}`;
    }

    if (typeof raw === "number" && isFinite(raw)) {
      const totalMinutes = Math.round(raw * 24 * 60);
      const hh = Math.floor(totalMinutes / 60) % 24;
      const mm = totalMinutes % 60;
      return `${pad2(hh)}:${pad2(mm)}`;
    }

    const s = String(raw).trim();

    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const d = new Date(s);
      if (!isNaN(d)) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }

    const m = s.match(/(\d{1,2}):(\d{2})/);
    if (m) return `${pad2(parseInt(m[1], 10))}:${m[2]}`;

    return s;
  }

  function normalizeSlots(list, count) {
    const arr = Array.isArray(list) ? list.slice(0, count) : [];
    while (arr.length < count) arr.push("");
    return arr;
  }

  // GET (без JSONP)
  async function apiGet(url) {
    const u = url + (url.includes("?") ? "&" : "?") + `_=${Date.now()}`;
    const res = await fetch(u, { method: "GET", cache: "no-store" });
    const txt = await res.text();
    return JSON.parse(txt);
  }

  // POST (no-cors)
  function postNoCors(payload) {
    return fetch(SCHEDULE_API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
  }

  // fixed times 09..22
  function getFixedTimes_() {
    const times = [];
    for (let h = 9; h <= 22; h++) times.push(`${pad2(h)}:00`);
    return times;
  }

  function timePretty_(t) {
    const s = String(t || "");
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return s;
    return `${parseInt(m[1], 10)}:${m[2]}`;
  }

  function shortName_(name) {
    const n = String(name || "").trim();
    if (!n) return "";
    const first = n.split(/\s+/)[0];
    if (first.length >= 6) return first.slice(0, 4);
    return first;
  }

  // ==============================
  // COLORS
  // ==============================
  function hexToRgba_(hex, a) {
    const h = String(hex).replace("#", "").trim();
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(hash);
  }

  function getColorForName(name) {
    if (!name) return null;
    const key = String(name).trim();
    const saved = NAME_COLORS[key];
    if (saved) {
      return { bg: hexToRgba_(saved, 0.82), border: saved };
    }
    const hue = hashString(key) % 360;
    return { bg: `hsla(${hue}, 70%, 82%, 0.82)`, border: `hsl(${hue}, 55%, 45%)` };
  }

  function getPillStyleForName(name) {
    const c = getColorForName(name);
    if (!c) return "";
    return `background-color:${c.bg};color:#111827;--pill-border:${c.border};`;
  }

  async function loadNameColors() {
    try {
      const data = await apiGet(`${SCHEDULE_API_URL}?action=get_colors`);
      NAME_COLORS = (data && typeof data === "object") ? data : {};
    } catch (e) {
      console.warn("Неможливо завантажити кольори:", e);
      NAME_COLORS = {};
    }
  }

  async function saveNameColor(name, color) {
    const n = String(name || "").trim();
    const c = String(color || "").trim();
    if (!n) return;
    if (!/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(c)) return;

    try {
      await postNoCors({ action: "set_color", name: n, color: c });
    } catch (e) {
      console.warn("Не вдалося зберегти колір:", e);
    }
    NAME_COLORS[n] = c;
  }

  // ==============================
  // ROLE OPTIONS: dynamic + persistent
  // ==============================
  function loadCustomRoleOptions_() {
    try {
      const raw = localStorage.getItem("ROLE_OPTIONS_CUSTOM");
      const obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === "object") ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function saveCustomRoleOptions_(obj) {
    try { localStorage.setItem("ROLE_OPTIONS_CUSTOM", JSON.stringify(obj)); } catch (e) {}
  }

  function rebuildRoleOptionsFromRows_() {
    const roles = ["admin", "kellner", "kueche", "reinigung"];
    const sets = { admin: new Set(), kellner: new Set(), kueche: new Set(), reinigung: new Set() };

    for (const r of allRows) {
      for (const role of roles) {
        for (const name of (r[role] || [])) {
          const n = String(name || "").trim();
          if (n) sets[role].add(n);
        }
      }
    }

    const custom = loadCustomRoleOptions_();
    for (const role of roles) {
      const arr = Array.isArray(custom[role]) ? custom[role] : [];
      arr.forEach(n => sets[role].add(String(n || "").trim()));
    }

    for (const role of roles) {
      (ROLE_OPTIONS[role] || []).forEach(n => sets[role].add(String(n || "").trim()));
      ROLE_OPTIONS[role] = Array.from(sets[role]).filter(Boolean).sort((a, b) => a.localeCompare(b));
    }
  }

  // ==============================
  // Multi-month load for current period (fix week跨月)
  // ==============================
  function monthKey_(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  function monthsBetween_(start, end) {
    const out = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= last) {
      out.push(monthKey_(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }

  async function loadScheduleForPeriod_() {
    let start, end;

    if (currentMode === MODE_DAY) {
      const d = getDayStart(currentDate);
      start = d; end = d;
    } else if (currentMode === MODE_WEEK) {
      const r = getWeekRange(currentDate);
      start = r.start; end = r.end;
    } else {
      const r = getMonthRange(currentDate);
      start = r.start; end = r.end;
    }

    const monthList = monthsBetween_(start, end);
    setLoading(true, `Завантажую: ${monthList.join(", ")}…`);

    try {
      const merged = [];
      for (const m of monthList) {
        const data = await apiGet(`${SCHEDULE_API_URL}?action=list&month=${m}`);
        const rows = (data && data.rows) ? data.rows : [];
        merged.push(...rows);
      }

      allRows = merged.map((r) => {
        const rawDate = String(r.date || "").trim();
        const dObj = parseISODate(rawDate);
        const isoDay = dObj ? toISODate_(dObj) : "";

        return {
          row: Number(r.row),
          date: isoDay,
          dateObj: dObj,
          time: normalizeTime(r.time),
          admin: normalizeSlots(r.admin, 3),
          kellner: normalizeSlots(r.kellner, 4),
          kueche: normalizeSlots(r.kueche, 4),
          reinigung: normalizeSlots(r.reinigung, 2),
        };
      }).filter(r => r.dateObj && r.date);

      rebuildRoleOptionsFromRows_();
      renderForCurrentPeriod();
      computeAllStats();
      setLoading(false);
    } catch (e) {
      setLoading(false);
      weekLabelEl.textContent = "Помилка завантаження";
      subLabelEl.textContent = String(e && e.message ? e.message : e);
      scheduleContentEl.innerHTML = `<p style="color:#b91c1c;font-weight:800;">Помилка: ${subLabelEl.textContent}</p>`;
    }
  }

  // ==============================
  // META polling (auto refresh after manual sheet edits)
  // ==============================
  async function pollMeta_() {
    try {
      const meta = await apiGet(`${SCHEDULE_API_URL}?action=meta`);
      const v = Number(meta && meta.ver ? meta.ver : 0);

      if (_lastMetaVer === null) _lastMetaVer = v;

      if (v !== _lastMetaVer) {
        _lastMetaVer = v;
        await loadScheduleForPeriod_();
      }
    } catch (e) {}
  }

  setInterval(pollMeta_, 25000);

  // ==============================
  // Mobile scroll anchor (no jump to Monday)
  // ==============================
  function captureAnchorFromEl_(el) {
    const host =
      el.closest("[data-week-day]") ||
      el.closest("[data-month-day]") ||
      el.closest(".week-day-card");
    if (!host) return null;
    return host.getAttribute("data-week-day") || host.getAttribute("data-month-day") || null;
  }

  function restoreAnchorScroll_() {
    if (!_scrollAnchorISO) return;

    const target =
      document.querySelector(`[data-week-day="${_scrollAnchorISO}"]`) ||
      document.querySelector(`[data-month-day="${_scrollAnchorISO}"]`);

    if (target) {
      const card = target.closest(".week-day-card") || target;
      card.scrollIntoView({ block: "start", behavior: "instant" });
    }
    _scrollAnchorISO = null;
  }

  // ==============================
  // Dynamic label fitting
  // ==============================
  const _fitCanvas = document.createElement("canvas");
  const _fitCtx = _fitCanvas.getContext("2d");

  function _getFontForMeasure(el, fontSizePx) {
    const cs = window.getComputedStyle(el);
    const weight = cs.fontWeight || "700";
    const family = cs.fontFamily || "system-ui";
    return `${weight} ${fontSizePx}px ${family}`;
  }

  function _measureTextPx(el, text, fontSizePx) {
    _fitCtx.font = _getFontForMeasure(el, fontSizePx);
    return _fitCtx.measureText(text).width;
  }

  function fitLabelIntoEl(el, fullText, opts = {}) {
    const { maxFont = 13, minFont = 4, minChars = 4, padding = 6 } = opts;
    const text = String(fullText || "").trim();
    if (!text) { el.textContent = ""; return; }

    const w = Math.max(0, (el.clientWidth || 0) - padding);
    if (w <= 0) { el.textContent = text; return; }

    let lo = minFont, hi = maxFont, best = minFont;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const mw = _measureTextPx(el, text, mid);
      if (mw <= w) { best = mid; lo = mid + 1; }
      else { hi = mid - 1; }
    }

    el.style.fontSize = best + "px";
    el.textContent = text;

    if (_measureTextPx(el, text, best) > w) {
      const first = text.split(/\s+/)[0];
      let s = first;
      while (s.length > minChars && _measureTextPx(el, s, best) > w) s = s.slice(0, -1);
      if (_measureTextPx(el, s, best) > w) s = first.slice(0, minChars);
      el.textContent = s;
    }
  }

  function applyDynamicLabels(root) {
    const labels = root.querySelectorAll(".day-cell__label, .week-role-cell__label");
    labels.forEach(el => {
      const full = el.getAttribute("data-full") || el.getAttribute("title") || el.textContent || "";
      fitLabelIntoEl(el, full, { maxFont: 13, minFont: 4, minChars: 4, padding: 6 });
    });
  }

  // ==============================
  // Rendering helpers (cells)
  // ==============================
  function getCurrentCellNameFromState(row, role, slot) {
    const obj = allRows.find(r => r.row === row);
    if (!obj) return "";
    const arr = obj[role] || [];
    return String(arr?.[slot] || "").trim();
  }

  function renderDayGridCells(dayRows, targetEl = scheduleContentEl, roleFilter = "all") {
    const rows = dayRows.slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));

    if (!rows.length) {
      targetEl.innerHTML = "<p style='font-size:0.9rem;color:#6b7280;font-weight:700;'>На цей день немає змін.</p>";
      return;
    }

    const ALL_ROLES = [
      { key: "admin", title: "Admin", cols: 3 },
      { key: "kellner", title: "Kellner", cols: 4 },
      { key: "kueche", title: "Küche", cols: 4 },
      { key: "reinigung", title: "Reinigung", cols: 2 },
    ];

    const roles = (roleFilter && roleFilter !== "all")
      ? ALL_ROLES.filter(r => r.key === roleFilter)
      : ALL_ROLES;

    const withSeps = roles.length > 1;

    let gridCols = `70px `;
    roles.forEach((r, idx) => {
      gridCols += `repeat(${r.cols}, minmax(46px, 1fr)) `;
      if (withSeps && idx !== roles.length - 1) gridCols += `10px `;
    });

    let html = `<div class="day-compact"><div class="day-grid" style="grid-template-columns:${gridCols.trim()};">`;

    // header
    html += `<div class="day-head day-head--time">Zeit</div>`;
    roles.forEach((r, idx) => {
      html += `<div class="day-head day-head--role" style="grid-column: span ${r.cols};">${r.title}</div>`;
      if (withSeps && idx !== roles.length - 1) html += `<div class="day-head day-sep day-sep--head"></div>`;
    });

    rows.forEach((r, i) => {
      const gridRow = i + 2;
      const isShiftStartLine = (r.time || "").trim() === "16:00";
      const shiftCls = isShiftStartLine ? " day-row--shiftstart" : "";

      html += `<div class="day-time${shiftCls}" style="grid-row:${gridRow};grid-column:1;">${r.time || ""}</div>`;

      let col = 2;

      roles.forEach((role, ridx) => {
        for (let slot = 0; slot < role.cols; slot++) {
          const name = (r[role.key]?.[slot] || "").trim();
          const prev = i > 0 ? (rows[i - 1][role.key]?.[slot] || "").trim() : "";
          const next = i < rows.length - 1 ? (rows[i + 1][role.key]?.[slot] || "").trim() : "";

          const isStart = !!name && name !== prev;
          let isEnd = !!name && name !== next;

          if (name && !isStart) { col++; continue; }

          const styleStr = name ? getPillStyleForName(name) : "";
          const label = isStart ? name : "";

          let blockSpan = 1;
          let timeText = "";
          let addOverlay = false;
          let hideOverlay = false;

          if (name && isStart) {
            let e = i;
            while (e < rows.length - 1 && String(rows[e + 1][role.key]?.[slot] || "").trim() === name) e++;
            blockSpan = e - i + 1;

            if (blockSpan > 1) isEnd = true;

            if (blockSpan > 1) {
              timeText = `${timePretty_(rows[i].time)}–${timePretty_(rows[e].time)}`;
              addOverlay = true;
              hideOverlay = blockSpan <= 2;
            }
          }

          const rowsListAttr = (name && isStart && blockSpan > 1)
            ? ` data-rows="${rows.slice(i, i + blockSpan).map(x => x.row).join(',')}"`
            : "";

          html += `
            <div class="day-cell${shiftCls} ${name ? "day-cell--filled" : "day-cell--empty"} ${isStart ? "day-cell--start" : ""} ${isEnd ? "day-cell--end" : ""}"
                 style="grid-row:${gridRow}${name && isStart ? ` / span ${blockSpan}` : ""};grid-column:${col};${styleStr}"
                 data-row="${r.row}"
                 ${rowsListAttr}
                 data-role="${role.key}"
                 data-slot="${slot}">
              <span class="day-cell__label" title="${name}" data-full="${name}">${label}</span>
              ${addOverlay ? `
                <span class="block-time-overlay" data-len="${blockSpan}" ${hideOverlay ? 'data-hide="1"' : ""}>
                  <span class="block-time-vert">${timeText}</span>
                </span>
              ` : ""}
            </div>
          `;
          col++;
        }

        if (withSeps && ridx !== roles.length - 1) {
          html += `<div class="day-sep${shiftCls}" style="grid-row:${gridRow};grid-column:${col};"></div>`;
          col++;
        }
      });
    });

    html += `</div></div>`;
    targetEl.innerHTML = html;
    applyDynamicLabels(targetEl);
  }

  function renderWeekBlocks(roleFilter = "all") {
  const byDate = new Map();
  currentRows.forEach(r => {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  });

  const dates = Array.from(byDate.keys()).sort();
  if (!dates.length) {
    scheduleContentEl.innerHTML = "<p style='color:#6b7280;font-weight:700;'>Немає даних.</p>";
    return;
  }

  let html = `<div class="week-blocks">`;

  dates.forEach(dateStr => {
    // dateStr уже YYYY-MM-DD
    const d = parseISODate(dateStr) || new Date(dateStr);
    const title = `${getWeekdayName(d)} ${formatDate(d)}`;

    html += `
      <div class="week-day-card" data-iso="${dateStr}">
        <div class="week-day-title">${title}</div>
        <div class="week-day-body" data-week-day="${dateStr}"></div>
      </div>
    `;
  });

  html += `</div>`;
  scheduleContentEl.innerHTML = html;

  dates.forEach(dateStr => {
    const host = scheduleContentEl.querySelector(`[data-week-day="${dateStr}"]`);
    if (!host) return;
    renderDayGridCells(byDate.get(dateStr), host, roleFilter);
  });

  // если у тебя уже вставлены функции holidays — тут можно сразу применить (не обязательно)
  // applyHolidayUI_();
}
  function renderMonthDayList(roleFilter = "all") {
  const byDate = new Map();
  currentRows.forEach(r => {
    if (!r.date) return;
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  });

  const range = getMonthRange(currentDate);
  const days = [];
  for (let d = new Date(range.start); d <= range.end; d.setDate(d.getDate() + 1)) {
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    days.push(day);
  }

  let html = `<div class="week-blocks month-blocks">`;

  days.forEach(day => {
    const iso = toISODate_(day);
    const title = `${getWeekdayName(day)} ${formatDate(day)}`;

    html += `
      <div class="week-day-card" data-iso="${iso}">
        <div class="week-day-title">${title}</div>
        <div class="week-day-body" data-month-day="${iso}"></div>
      </div>
    `;
  });

  html += `</div>`;
  scheduleContentEl.innerHTML = html;

  days.forEach(day => {
    const iso = toISODate_(day);
    const host = scheduleContentEl.querySelector(`[data-month-day="${iso}"]`);
    if (!host) return;
    const rows = (byDate.get(iso) || []);
    renderDayGridCells(rows, host, roleFilter);
  });

  // если у тебя уже вставлены holidays-функции — можно сразу применить
  // applyHolidayUI_();
}

function renderWeekRoleTimeline(roleKey) {
  if (!weekCompactEl) return;

  scheduleContentEl.style.display = "none";
  weekCompactEl.style.display = "block";

  const range = getWeekRange(currentDate);
  const days = [];
  for (let d = new Date(range.start); d <= range.end; d.setDate(d.getDate() + 1)) {
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    days.push(day);
  }

  const roleCols =
    roleKey === "admin" ? 3 :
    roleKey === "kellner" ? 4 :
    roleKey === "kueche" ? 4 :
    2;

  const roleTitle =
    roleKey === "admin" ? "Адміни" :
    roleKey === "kellner" ? "Офіціанти" :
    roleKey === "kueche" ? "Кухня" :
    "Прибирання";

  const times = getFixedTimes_();

  const map = new Map();
  currentRows.forEach(r => {
    if (!r.date || !r.time) return;
    map.set(`${r.date}|${r.time}`, r);
  });

  let gridCols = `70px `;
  const cellMin = (roleCols === 4) ? 30 : (roleCols === 3) ? 40 : 48;
  const sepW = 8;

  days.forEach((_, idx) => {
    gridCols += `repeat(${roleCols}, minmax(${cellMin}px, 1fr)) `;
    if (idx !== days.length - 1) gridCols += `${sepW}px `;
  });

  let html = `
    <div class="week-role-wrap">
      <div class="week-role-title">${roleTitle}</div>
      <div class="week-role-grid" style="grid-template-columns:${gridCols.trim()};">
  `;

  html += `<div class="week-role-head week-role-head--time">Zeit</div>`;

  let colCursor = 2;
  days.forEach((day, idx) => {
    const dateISO = toISODate_(day);
    const head = day.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

    // ✅ ВАЖНО: data-iso для holiday badge
    html += `
      <div class="week-role-head week-role-head--day"
           data-iso="${dateISO}"
           style="grid-column:${colCursor} / span ${roleCols};">
        ${head}
      </div>
    `;

    colCursor += roleCols;

    if (idx !== days.length - 1) {
      html += `<div class="week-role-sep week-role-sep--head" style="grid-column:${colCursor};"></div>`;
      colCursor += 1;
    }
  });

  times.forEach((time, tIndex) => {
    const gridRow = tIndex + 2;
    html += `<div class="week-role-time" style="grid-row:${gridRow};grid-column:1;">${time}</div>`;

    let col = 2;

    days.forEach((day, dayIndex) => {
      const dateISO = toISODate_(day);

      for (let slot = 0; slot < roleCols; slot++) {
        const rowObj = map.get(`${dateISO}|${time}`) || null;
        const name = rowObj ? String(rowObj[roleKey]?.[slot] || "").trim() : "";

        const prevTime = times[tIndex - 1] || null;
        const nextTime = times[tIndex + 1] || null;

        const prevRow = prevTime ? (map.get(`${dateISO}|${prevTime}`) || null) : null;
        const nextRow = nextTime ? (map.get(`${dateISO}|${nextTime}`) || null) : null;

        const prevName = prevRow ? String(prevRow[roleKey]?.[slot] || "").trim() : "";
        const nextName = nextRow ? String(nextRow[roleKey]?.[slot] || "").trim() : "";

        const isStart = !!name && name !== prevName;
        let isEnd = !!name && name !== nextName;

        if (name && !isStart) { col++; continue; }

        const styleStr = name ? getPillStyleForName(name) : "";
        const label = isStart ? shortName_(name) : "";

        let blockSpan = 1;
        let timeText = "";
        let addOverlay = false;
        let hideOverlay = false;

        if (name && isStart) {
          let e = tIndex;
          while (e < times.length - 1) {
            const nr = map.get(`${dateISO}|${times[e + 1]}`) || null;
            const nn = nr ? String(nr[roleKey]?.[slot] || "").trim() : "";
            if (nn !== name) break;
            e++;
          }

          blockSpan = e - tIndex + 1;
          if (blockSpan > 1) isEnd = true;

          if (blockSpan > 1) {
            timeText = `${timePretty_(times[tIndex])}–${timePretty_(times[e])}`;
            addOverlay = true;
            hideOverlay = blockSpan <= 2;
          }
        }

        const clickable = rowObj ? "week-role-cell--click" : "week-role-cell--nocell";

        const rowsListAttr = (name && isStart && blockSpan > 1)
          ? ` data-rows="${times.slice(tIndex, tIndex + blockSpan)
              .map(t => (map.get(`${dateISO}|${t}`) || {}).row)
              .filter(Boolean)
              .join(',')}"`
          : "";

        html += `
          <div class="week-role-cell ${clickable} ${name ? "week-role-cell--filled" : "week-role-cell--empty"} ${isStart ? "week-role-cell--start" : ""} ${isEnd ? "week-role-cell--end" : ""}"
               style="grid-row:${gridRow}${name && isStart ? ` / span ${blockSpan}` : ""};grid-column:${col};${styleStr}"
               ${rowObj ? `data-row="${rowObj.row}"` : ""}
               ${rowsListAttr}
               data-role="${roleKey}"
               data-slot="${slot}">
            <span class="week-role-cell__label" title="${name}" data-full="${name}">${label}</span>
            ${addOverlay ? `
              <span class="block-time-overlay" data-len="${blockSpan}" ${hideOverlay ? 'data-hide="1"' : ""}>
                <span class="block-time-vert">${timeText}</span>
              </span>
            ` : ""}
          </div>
        `;
        col++;
      }

      if (dayIndex !== days.length - 1) {
        html += `<div class="week-role-sep" style="grid-row:${gridRow};grid-column:${col};"></div>`;
        col++;
      }
    });
  });

  html += `</div></div>`;
  weekCompactEl.innerHTML = html;
  applyDynamicLabels(weekCompactEl);
}

  // ==============================
  // Filters show/hide
  // ==============================
  function setWeekFilterVisible_(visible) {
    if (!weekFilterEl || !weekCompactEl) return;
    weekFilterEl.style.display = visible ? "flex" : "none";
    if (!visible) {
      weekCompactEl.style.display = "none";
      weekCompactEl.innerHTML = "";
      scheduleContentEl.style.display = "";
      weekFilterEl.querySelectorAll("[data-week-filter]").forEach(btn => {
        btn.classList.toggle("week-filter__pill--active", btn.dataset.weekFilter === "all");
      });
    }
  }

  function getActiveWeekFilter_() {
    if (!weekFilterEl) return "all";
    const active = weekFilterEl.querySelector(".week-filter__pill--active");
    return active ? (active.dataset.weekFilter || "all") : "all";
  }

  function setMonthFilterVisible_(visible) {
    monthFilterEl.style.display = visible ? "flex" : "none";
    if (!visible) {
      monthRoleViewEl.style.display = "none";
      monthRoleViewEl.innerHTML = "";
      monthFilterEl.querySelectorAll("[data-month-filter]").forEach(btn => {
        btn.classList.toggle("week-filter__pill--active", btn.dataset.monthFilter === "all");
      });
    }
  }

  function getActiveMonthFilter_() {
    const active = monthFilterEl.querySelector(".week-filter__pill--active");
    return active ? (active.dataset.monthFilter || "all") : "all";
  }

  // ==============================
  // Main render
  // ==============================
  function refreshHolidaysForCurrentRange_() {
  let start, end;

  if (currentMode === MODE_DAY) {
    const d = getDayStart(currentDate);
    start = d; end = d;
  } else if (currentMode === MODE_WEEK) {
    const r = getWeekRange(currentDate);
    start = r.start; end = r.end;
  } else {
    const r = getMonthRange(currentDate);
    start = r.start; end = r.end;
  }

  loadHolidaysForRange_(start, end).then(() => {
    setTimeout(applyHolidayUI_, 0);
  });
}
  function renderForCurrentPeriod() {
  if (!allRows.length) {
    weekLabelEl.textContent = "Немає даних";
    subLabelEl.textContent = " ";
    scheduleContentEl.innerHTML = "<p style='color:#6b7280;font-weight:700;'>Немає даних.</p>";
    setWeekFilterVisible_(false);
    setMonthFilterVisible_(false);
    return;
  }

  let start, end;

  if (currentMode === MODE_DAY) {
    const d = getDayStart(currentDate);
    start = d; end = d;
    weekLabelEl.textContent = `День ${formatDate(d)} (${getWeekdayName(d)})`;
    setWeekFilterVisible_(false);
    setMonthFilterVisible_(false);
  } else if (currentMode === MODE_WEEK) {
    const range = getWeekRange(currentDate);
    start = range.start; end = range.end;
    weekLabelEl.textContent = `Тиждень ${formatDate(range.start)} — ${formatDate(range.end)}`;
    setWeekFilterVisible_(true);
    setMonthFilterVisible_(false);
  } else {
    const range = getMonthRange(currentDate);
    start = range.start; end = range.end;
    weekLabelEl.textContent = `Місяць ${formatMonthYear(range.start)}`;
    setWeekFilterVisible_(false);
    setMonthFilterVisible_(true);
  }

  const startMs = start.getTime();
  const endMs = end.getTime();

  currentRows = allRows.filter((r) => {
    const t = r.dateObj.getTime();
    return t >= startMs && t <= endMs;
  });

  subLabelEl.textContent = `Змін: ${currentRows.length}`;

  // helper: обновить свята после рендера (даём DOM отрисоваться)
  const refreshHolidaysAfterRender_ = () => {
    if (typeof loadHolidaysForRange_ !== "function" || typeof applyHolidayUI_ !== "function") return;
    loadHolidaysForRange_(start, end).then(() => {
      // чуть позже, чтобы успели вставиться week/month cards или timeline grid
      setTimeout(() => applyHolidayUI_(), 0);
    });
  };

  // DAY
  if (currentMode === MODE_DAY) {
    if (weekCompactEl) { weekCompactEl.style.display = "none"; weekCompactEl.innerHTML = ""; }
    scheduleContentEl.style.display = "";
    renderDayGridCells(currentRows, scheduleContentEl, "all");

    restoreAnchorScroll_();
    refreshHolidaysAfterRender_();
    return;
  }

  // WEEK
  if (currentMode === MODE_WEEK) {
    const role = getActiveWeekFilter_();
    if (role === "all") {
      if (weekCompactEl) { weekCompactEl.style.display = "none"; weekCompactEl.innerHTML = ""; }
      scheduleContentEl.style.display = "";
      renderWeekBlocks("all");
    } else {
      renderWeekRoleTimeline(role);
    }

    restoreAnchorScroll_();
    refreshHolidaysAfterRender_();
    return;
  }

  // MONTH
  if (weekCompactEl) { weekCompactEl.style.display = "none"; weekCompactEl.innerHTML = ""; }

  const mRole = getActiveMonthFilter_();
  monthRoleViewEl.style.display = "none";
  monthRoleViewEl.innerHTML = "";
  scheduleContentEl.style.display = "";

  if (mRole === "all") {
    renderMonthDayList("all");
  } else {
    renderMonthDayList(mRole);
  }

  restoreAnchorScroll_();
  refreshHolidaysAfterRender_();
}

  async function setMode(mode) {
    if (mode === currentMode) return;
    currentMode = mode;

    modeDayBtn.classList.toggle("view-toggle__btn--active", currentMode === MODE_DAY);
    modeWeekBtn.classList.toggle("view-toggle__btn--active", currentMode === MODE_WEEK);
    modeMonthBtn.classList.toggle("view-toggle__btn--active", currentMode === MODE_MONTH);

    await loadScheduleForPeriod_();
  }

  async function changePeriod(delta) {
    if (currentMode === MODE_DAY) currentDate.setDate(currentDate.getDate() + delta);
    else if (currentMode === MODE_WEEK) currentDate.setDate(currentDate.getDate() + delta * 7);
    else currentDate.setMonth(currentDate.getMonth() + delta);

    await loadScheduleForPeriod_();
  }

  // ==============================
  // Picker UI
  // ==============================
  function renderColorPaletteUI_(currentName) {
    const wrap = document.createElement("div");
    wrap.style.width = "100%";
    wrap.style.marginBottom = "10px";

    const title = document.createElement("div");
    title.style.fontWeight = "900";
    title.style.marginBottom = "6px";
    title.textContent = currentName
      ? `🎨 Колір для: ${currentName}`
      : "🎨 Колір: виберіть ім'я";

    const grid = document.createElement("div");
    grid.style.display = "flex";
    grid.style.flexWrap = "wrap";
    grid.style.gap = "8px";

    const makeSwatch = (hex) => {
      const b = document.createElement("button");
      b.type = "button";
      b.title = hex;
      b.style.width = "28px";
      b.style.height = "28px";
      b.style.borderRadius = "10px";
      b.style.border = "2px solid rgba(17,24,39,0.15)";
      b.style.background = hex;
      b.style.cursor = currentName ? "pointer" : "not-allowed";
      b.style.opacity = currentName ? "1" : "0.35";

      b.addEventListener("click", async () => {
        if (!currentName) return;
        await saveNameColor(currentName, hex);
        renderForCurrentPeriod();
      });
      return b;
    };

    COLOR_PRESETS.forEach(hex => grid.appendChild(makeSwatch(hex)));

    const customBtn = document.createElement("button");
    customBtn.type = "button";
    customBtn.className = "picker-option-btn";
    customBtn.textContent = "Свой цвет…";
    customBtn.disabled = !currentName;
    customBtn.style.marginLeft = "auto";

    customBtn.addEventListener("click", async () => {
      if (!currentName) return;
      const cur = NAME_COLORS[currentName] || "#34d399";
      const hex = prompt(`HEX колір для "${currentName}"`, cur);
      if (!hex) return;
      await saveNameColor(currentName, hex.trim());
      renderForCurrentPeriod();
    });

    wrap.appendChild(title);
    wrap.appendChild(grid);
    wrap.appendChild(customBtn);

    pickerOptionsEl.prepend(wrap);
  }

  function openPicker(targetEl, row, role, slot) {
    _scrollAnchorISO = captureAnchorFromEl_(targetEl);

    const names = ROLE_OPTIONS[role] || [];
    pickerState = { el: targetEl, row, role, slot };

    const roleLabel =
      role === "admin" ? "Адміністратори (Admin)" :
      role === "kellner" ? "Офіціанти (Kellner)" :
      role === "kueche" ? "Кухня (Küche)" :
      "Прибирання (Reinigung)";
    pickerRoleLabel.textContent = roleLabel;

    const currentName = getCurrentCellNameFromState(row, role, slot);

    pickerOptionsEl.innerHTML = "";
    renderColorPaletteUI_(currentName || "");

    names.forEach((name) => {
      const btn = document.createElement("button");
      btn.className = "picker-option-btn";
      btn.type = "button";
      btn.textContent = name;
      btn.addEventListener("click", () => applySelection(name));
      pickerOptionsEl.appendChild(btn);
    });

    pickerBackdrop.classList.remove("picker-hidden");
  }

  function closePicker() {
    pickerBackdrop.classList.add("picker-hidden");
    pickerState = null;
  }

  function extendShift(name, startRowNum, role, slot, hoursToExtend) {
    const startRowObj = allRows.find((r) => r.row === startRowNum);
    if (!startRowObj) return;

    const dayTime = startRowObj.dateObj.getTime();
    const sameDayRows = allRows
      .filter((r) => r.dateObj.getTime() === dayTime)
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

    const startIndex = sameDayRows.findIndex((r) => r.row === startRowNum);
    if (startIndex === -1) return;

    for (let i = 1; i <= hoursToExtend; i++) {
      const target = sameDayRows[startIndex + i];
      if (!target) break;

      if (target[role] && typeof target[role][slot] !== "undefined") {
        target[role][slot] = name;
      }
      postNoCors({ action: "schedule_update", row: target.row, role, slot, value: name }).catch(console.error);
    }

    renderForCurrentPeriod();
  }

  function applySelection(name) {
    if (!pickerState) return;

    const { row, role, slot } = pickerState;
    const trimmed = (name || "").trim();

    postNoCors({ action: "schedule_update", row, role, slot, value: trimmed }).catch(console.error);

    const obj = allRows.find(r => r.row === row);
    if (obj && obj[role] && typeof obj[role][slot] !== "undefined") {
      obj[role][slot] = trimmed;
    }

    closePicker();
    renderForCurrentPeriod();

    if (trimmed) {
      const extendStr = prompt(
        "Продовжити зміну цим співробітником ще на скільки годин вниз по цьому дню?\nЗалишіть порожньо або 0, якщо ця година.",
        "0"
      );
      const extend = parseInt(extendStr, 10);
      if (!isNaN(extend) && extend > 0) extendShift(trimmed, row, role, slot, extend);
    }
  }

  pickerClearBtn.addEventListener("click", () => applySelection(""));
  pickerCustomBtn.addEventListener("click", () => {
    if (!pickerState) return;
    const { row, role, slot } = pickerState;
    const currentValue = getCurrentCellNameFromState(row, role, slot);
    const newValue = prompt("Введіть ім'я користувача", currentValue || "");
    if (newValue === null) return;

    const n = String(newValue || "").trim();
    if (n) {
      const custom = loadCustomRoleOptions_();
      if (!Array.isArray(custom[role])) custom[role] = [];
      if (!custom[role].includes(n)) custom[role].push(n);
      saveCustomRoleOptions_(custom);
    }

    applySelection(newValue);
  });
  pickerCancelBtn.addEventListener("click", closePicker);
  pickerBackdrop.addEventListener("click", (e) => { if (e.target === pickerBackdrop) closePicker(); });

  // resolve row inside spanned block
  function resolveRowFromSpannedCell_(cellEl, clientY) {
    if (!cellEl) return null;

    const rowsAttr = (cellEl.dataset && cellEl.dataset.rows) ? String(cellEl.dataset.rows).trim() : "";
    if (!rowsAttr) {
      const r = Number(cellEl.dataset.row || "");
      return r || null;
    }

    const ids = rowsAttr.split(",").map(s => Number(String(s).trim())).filter(n => Number.isFinite(n) && n > 0);
    if (!ids.length) {
      const r = Number(cellEl.dataset.row || "");
      return r || null;
    }

    const rect = cellEl.getBoundingClientRect();
    const relY = Math.min(Math.max(0, clientY - rect.top), rect.height - 1);
    const partH = rect.height / ids.length;
    let idx = Math.floor(relY / partH);
    if (idx < 0) idx = 0;
    if (idx >= ids.length) idx = ids.length - 1;
    return ids[idx] || ids[0] || null;
  }

  scheduleContentEl.addEventListener("click", (e) => {
    const cell = e.target.closest(".day-cell");
    if (cell) {
      const realRow = resolveRowFromSpannedCell_(cell, e.clientY);
      if (!realRow) return;
      openPicker(cell, realRow, cell.dataset.role, Number(cell.dataset.slot));
      return;
    }
  });

  if (weekCompactEl) {
    weekCompactEl.addEventListener("click", (e) => {
      const cell = e.target.closest(".week-role-cell");
      if (!cell) return;
      const realRow = resolveRowFromSpannedCell_(cell, e.clientY);
      if (!realRow) return;
      openPicker(cell, realRow, cell.dataset.role, Number(cell.dataset.slot));
    });
  }

  // ==============================
  // STATS
  // ==============================
  function computeStatsForRange(start, end) {
    const startMs = start.getTime();
    const endMs = end.getTime();
    const persons = {};
    const totals = { overall: 0, kellner: 0, kueche: 0, reinigung: 0 };
    const roles = ["kellner", "kueche", "reinigung"];
    const usedDaysSet = new Set();

    allRows.forEach((row) => {
      const t = row.dateObj.getTime();
      if (t < startMs || t > endMs) return;

      let rowHasAnyWork = false;

      roles.forEach((role) => {
        (row[role] || []).forEach((name) => {
          const trimmed = (name || "").trim();
          if (!trimmed) return;

          rowHasAnyWork = true;

          if (!persons[trimmed]) persons[trimmed] = { total: 0, kellner: 0, kueche: 0, reinigung: 0 };

          persons[trimmed][role] += 1;
          persons[trimmed].total += 1;
          totals[role] += 1;
          totals.overall += 1;
        });
      });

      if (rowHasAnyWork) usedDaysSet.add(getDayStart(row.dateObj).getTime());
    });

    return { persons, totals, usedDays: usedDaysSet.size, range: { start, end } };
  }

  // Ensure we have months needed for stats loaded into allRows
async function ensureMonthsLoaded_(monthKeys){
  const want = Array.from(new Set((monthKeys||[]).filter(Boolean)));
  if (!want.length) return;

  const have = new Set();
  for (const r of allRows){
    if (r && r.dateObj) have.add(monthKey_(r.dateObj));
  }

  const need = want.filter(m => !have.has(m));
  if (!need.length) return;

  for (const m of need){
    const data = await apiGet(`${SCHEDULE_API_URL}?action=list&month=${m}`);
    const rows = (data && data.rows) ? data.rows : [];
    const mapped = rows.map((r) => {
      const rawDate = String(r.date || "").trim();
      const dObj = parseISODate(rawDate);
      const isoDay = dObj ? toISODate_(dObj) : "";
      return {
        row: Number(r.row),
        date: isoDay,
        dateObj: dObj,
        time: normalizeTime(r.time),
        admin: normalizeSlots(r.admin, 3),
        kellner: normalizeSlots(r.kellner, 4),
        kueche: normalizeSlots(r.kueche, 4),
        reinigung: normalizeSlots(r.reinigung, 2),
      };
    }).filter(x => x.dateObj && x.date);

    // merge by unique sheet row id
    const byRow = new Map(allRows.map(x => [x.row, x]));
    mapped.forEach(x => byRow.set(x.row, x));
    allRows = Array.from(byRow.values());
  }

  rebuildRoleOptionsFromRows_();
}

function computeAllStats(baseDate = currentDate){
  if (!allRows || !allRows.length){
    statsState.data = null;
    renderStatsView();
    return;
  }

  const base = getDayStart(baseDate || new Date());

  const curRange = getMonthRange(base);
  const prevDate = new Date(base.getFullYear(), base.getMonth() - 1, 15);
  const prevPrevDate = new Date(base.getFullYear(), base.getMonth() - 2, 15);

  const prevRange = getMonthRange(prevDate);
  const prevPrevRange = getMonthRange(prevPrevDate);

  const curStats = computeStatsForRange(curRange.start, curRange.end);
  const prevStats = computeStatsForRange(prevRange.start, prevRange.end);
  const prevPrevStats = computeStatsForRange(prevPrevRange.start, prevPrevRange.end);

  statsState.data = { current: curStats, previous: prevStats, prevPrev: prevPrevStats };

  statsState.monthLabels = {
    current: formatMonthYear(curRange.start),
    previous: formatMonthYear(prevRange.start),
    prevPrev: formatMonthYear(prevPrevRange.start),
  };

  // как было: если первые 10 дней месяца — "Поточний" показывает прошлый
  statsState.slotMapping = (base.getDate() <= 10)
    ? { current: "previous", previous: "prevPrev" }
    : { current: "current", previous: "previous" };

  renderStatsView();
}

  function renderStatsView() {
    if (!statsState.data) {
      statsSummaryEl.innerHTML = "<p style='color:#6b7280;font-weight:800;'>Немає даних статистики.</p>";
      statsTableEl.innerHTML = "";
      return;
    }

    const key = (statsState.slotMapping || {})[statsState.activeSlot] || "current";
    const monthData = statsState.data[key];
    if (!monthData) {
      statsSummaryEl.innerHTML = "<p style='color:#6b7280;font-weight:800;'>Немає даних за цей місяць.</p>";
      statsTableEl.innerHTML = "";
      return;
    }

    const monthLabel = statsState.monthLabels[key] || "";
    const totals = monthData.totals;
    const personsMap = monthData.persons;

    const roleLabelMap = { all: "Усі ролі", kellner: "Kellner", kueche: "Küche", reinigung: "Reinigung" };

    statsSummaryEl.innerHTML = `
      <div class="stats-summary-grid">
        <div class="stats-summary-item">
          <div class="stats-summary-label">Місяць</div>
          <div class="stats-summary-value">${monthLabel}</div>
          <div class="stats-summary-days">${monthData.usedDays} днів</div>
        </div>
        <div class="stats-summary-item">
          <div class="stats-summary-label">Всього годин</div>
          <div class="stats-summary-value">${totals.overall}</div>
        </div>
        <div class="stats-summary-item">
          <div class="stats-summary-label">Фільтр</div>
          <div class="stats-summary-value">${roleLabelMap[statsState.role] || ""}</div>
        </div>
      </div>
    `;

    const entries = Object.entries(personsMap);
    if (!entries.length) {
      statsTableEl.innerHTML = "<p style='color:#6b7280;font-weight:800;'>Немає змін.</p>";
      return;
    }

    const roleFilter = statsState.role;
    let html = '<table class="stats-table"><thead>';

    if (roleFilter === "all") {
      html += "<tr><th>Mitarbeiter</th><th>Всего</th><th>Kellner</th><th>Küche</th><th>Reinigung</th></tr></thead><tbody>";
      const rows = entries
        .map(([name, p]) => ({ name, total: p.total, kellner: p.kellner, kueche: p.kueche, reinigung: p.reinigung }))
        .sort((a, b) => b.total - a.total);

      rows.forEach((r) => {
        html += `<tr><td>${r.name}</td><td>${r.total}</td><td>${r.kellner}</td><td>${r.kueche}</td><td>${r.reinigung}</td></tr>`;
      });

      html += "</tbody></table>";
    } else {
      const rKey = roleFilter;
      html += `<tr><th>Mitarbeiter</th><th>${roleLabelMap[rKey]}</th><th>Всего</th></tr></thead><tbody>`;
      const rows = entries
        .map(([name, p]) => ({ name, roleHours: p[rKey], total: p.total }))
        .filter((r) => r.roleHours > 0)
        .sort((a, b) => b.roleHours - a.roleHours);

      rows.forEach((r) => {
        html += `<tr><td>${r.name}</td><td>${r.roleHours}</td><td>${r.total}</td></tr>`;
      });

      html += "</tbody></table>";
    }

    statsTableEl.innerHTML = html;
  }

  if (statsMonthCurrentBtn && statsMonthPrevBtn) {
    statsMonthCurrentBtn.addEventListener("click", () => {
      statsState.activeSlot = "current";
      statsMonthCurrentBtn.classList.add("stats-toggle-btn--active");
      statsMonthPrevBtn.classList.remove("stats-toggle-btn--active");
      renderStatsView();
    });

    statsMonthPrevBtn.addEventListener("click", () => {
      statsState.activeSlot = "previous";
      statsMonthPrevBtn.classList.add("stats-toggle-btn--active");
      statsMonthCurrentBtn.classList.remove("stats-toggle-btn--active");
      renderStatsView();
    });
  }

  statsRoleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const role = btn.getAttribute("data-stats-role");
      statsState.role = role;
      statsRoleButtons.forEach((b) => b.classList.toggle("stats-toggle-pill--active", b === btn));
      renderStatsView();
    });
  });

  // ==============================
  // NAVIGATION + FILTER EVENTS
  // ==============================
  if (prevBtn) prevBtn.addEventListener("click", () => changePeriod(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => changePeriod(1));

  if (todayBtn) todayBtn.addEventListener("click", async () => {
    currentDate = new Date();
    await loadScheduleForPeriod_();
  });

  if (modeDayBtn) modeDayBtn.addEventListener("click", () => setMode(MODE_DAY));
  if (modeWeekBtn) modeWeekBtn.addEventListener("click", () => setMode(MODE_WEEK));
  if (modeMonthBtn) modeMonthBtn.addEventListener("click", () => setMode(MODE_MONTH));

  if (openStatsBtn && closeStatsBtn && sectionSchedule && sectionStats) {
    openStatsBtn.addEventListener("click", async () => {
      sectionSchedule.style.display = "none";
      sectionStats.style.display = "block";

      // load months needed for stats (currentDate month + previous 2 months)
      const base = getDayStart(currentDate || new Date());
      const m0 = monthKey_(base);
      const m1 = monthKey_(new Date(base.getFullYear(), base.getMonth()-1, 15));
      const m2 = monthKey_(new Date(base.getFullYear(), base.getMonth()-2, 15));

      showLoader(true, "Завантаження статистики…");
      try{
        await ensureMonthsLoaded_([m0,m1,m2]);
        computeAllStats(base);
      } finally {
        showLoader(false);
      }
    });

    closeStatsBtn.addEventListener("click", () => {
      sectionStats.style.display = "none";
      sectionSchedule.style.display = "block";
    });
  }

  // week filter clicks
 if (weekFilterEl) {
  weekFilterEl.querySelectorAll("[data-week-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      weekFilterEl.querySelectorAll("[data-week-filter]").forEach(b =>
        b.classList.remove("week-filter__pill--active")
      );
      btn.classList.add("week-filter__pill--active");

      const role = btn.dataset.weekFilter;
      if (currentMode !== MODE_WEEK) return;

      if (role === "all") {
        if (weekCompactEl) { weekCompactEl.style.display = "none"; weekCompactEl.innerHTML = ""; }
        scheduleContentEl.style.display = "";
        renderWeekBlocks("all");
      } else {
        renderWeekRoleTimeline(role);
      }

      // ✅ ВАЖНО: после перерендера вернуть бейджи
      refreshHolidaysForCurrentRange_();
    });
  });
}
  // month filter clicks
  monthFilterEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-month-filter]");
    if (!btn) return;
    monthFilterEl.querySelectorAll("[data-month-filter]").forEach(b => b.classList.remove("week-filter__pill--active"));
    btn.classList.add("week-filter__pill--active");
    if (currentMode !== MODE_MONTH) return;
    renderForCurrentPeriod();
  });

  // ==============================
  // Mount month filter UI (без правок HTML)
  // ==============================
  try {
    monthFilterEl.innerHTML = `
      <button class="week-filter__pill week-filter__pill--active" data-month-filter="all">Усі</button>
      <button class="week-filter__pill" data-month-filter="admin">Админы</button>
      <button class="week-filter__pill" data-month-filter="kellner">Официанты</button>
      <button class="week-filter__pill" data-month-filter="kueche">Кухня</button>
      <button class="week-filter__pill" data-month-filter="reinigung">Уборка</button>
    `;

    if (weekFilterEl) {
      weekFilterEl.insertAdjacentElement("afterend", monthFilterEl);
    } else if (sectionSchedule && scheduleContentEl) {
      sectionSchedule.insertBefore(monthFilterEl, scheduleContentEl);
    }

    if (scheduleContentEl) {
      scheduleContentEl.insertAdjacentElement("beforebegin", monthRoleViewEl);
    } else if (sectionSchedule) {
      sectionSchedule.appendChild(monthRoleViewEl);
    }
  } catch (e) {
    console.warn("month filter mount failed", e);
  }

  // ==============================
  // INIT
  // ==============================
  setLoading(true, "Завантажую розклад…");

  try {
    await loadNameColors();
  } catch (e) {
    console.warn("loadNameColors failed:", e);
  }

  await loadScheduleForPeriod_();
});