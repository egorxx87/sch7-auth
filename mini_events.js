// mini_events.js — 3 колонки: Сьогодні / Завтра / Цього тижня
// ✅ "Цього тижня" показывает только те события, которых НЕТ в "Сьогодні" и "Завтра" (без дублей)

const MINI_CALENDAR_API_URL =
  "https://script.google.com/macros/s/AKfycbw-yTbvyKAw8cO6j2dkopRYbGx5aHCB7nAxcG8M5yXAKGGLL8plNe9hUkiPO86LmZTD2A/exec";

document.addEventListener("DOMContentLoaded", () => {
  loadMiniEventsAll_();
});

async function loadMiniEventsAll_() {
  const boxToday = document.getElementById("miniEventsToday");
  const boxTomorrow = document.getElementById("miniEventsTomorrow");
  const boxWeek = document.getElementById("miniEventsWeek");

  if (boxToday) boxToday.textContent = "Завантаження…";
  if (boxTomorrow) boxTomorrow.textContent = "Завантаження…";
  if (boxWeek) boxWeek.textContent = "Завантаження…";

  try {
    const [todayEvents, tomorrowEvents, weekEvents] = await Promise.all([
      fetchMiniEvents_("today"),
      fetchMiniEvents_("tomorrow"),
      fetchMiniEvents_("week"),
    ]);

    // Сьогодні / Завтра — как есть
    renderMiniEventsList_(todayEvents, "miniEventsToday", 6, true);
    renderMiniEventsList_(tomorrowEvents, "miniEventsTomorrow", 6, true);

    // Ключи показанного (today + tomorrow)
    const shown = new Set();
    todayEvents.forEach((e) => shown.add(dedupKey_(e)));
    tomorrowEvents.forEach((e) => shown.add(dedupKey_(e)));

    // Цього тижня — без дублей
    const weekFiltered = weekEvents.filter((e) => !shown.has(dedupKey_(e)));
    renderMiniEventsList_(weekFiltered, "miniEventsWeek", 10, false);
  } catch (e) {
    console.error(e);
    if (boxToday) boxToday.innerHTML = `<span class="mini-events__error">Помилка завантаження</span>`;
    if (boxTomorrow) boxTomorrow.innerHTML = `<span class="mini-events__error">Помилка завантаження</span>`;
    if (boxWeek) boxWeek.innerHTML = `<span class="mini-events__error">Помилка завантаження</span>`;
  }
}

async function fetchMiniEvents_(range) {
  const url = `${MINI_CALENDAR_API_URL}?action=gcal_events&range=${encodeURIComponent(range)}&_=${Date.now()}`;

  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch (_) {
    console.error("Non-JSON response:", text.slice(0, 400));
    throw new Error("WebApp повернув не JSON (деплой/доступ/помилка).");
  }

  if (!json.ok) throw new Error(json.error || "calendar error");
  return Array.isArray(json.events) ? json.events : [];
}

function renderMiniEventsList_(events, elementId, limit, compactForDay) {
  const box = document.getElementById(elementId);
  if (!box) return;

  if (!events.length) {
    box.innerHTML = `<span class="mini-events__empty">Немає подій</span>`;
    return;
  }

  const top = events.slice(0, limit);
  const more = events.length - top.length;

  box.innerHTML =
    top.map((e) => renderMiniItem_(e, compactForDay)).join("") +
    (more > 0 ? `<div class="mini-events__more">+ ще ${more}…</div>` : "");
}

// dedup: тип + локальная дата + название
function dedupKey_(e) {
  const type = String(e?.calendarType || "").toLowerCase();
  const title = cleanTitle_(String(e?.summary || "(без назви)")).toLowerCase();

  let day = "";
  if (e && e.start) {
    const d = new Date(e.start);
    day = localISODate_(d); // YYYY-MM-DD local
  }

  return `${type}|${day}|${title}`;
}

function localISODate_(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function renderMiniItem_(e, compactForDay) {
  const type = String(e.calendarType || "").toLowerCase();
  const isBday = type === "birthday";

  const cls = isBday
    ? "mini-event mini-event--bday"
    : "mini-event mini-event--holiday";

  const title = cleanTitle_(String(e.summary || "(без назви)"));
  const prefix = compactForDay ? formatMiniPrefixCompact_(e) : formatMiniPrefixFull_(e);
  const badge = isBday ? "ДР" : "Свято";

  return `<div class="${cls}">
    <span class="mini-event__time">${escapeHtml_(prefix)}</span>
    <span class="mini-event__title">${escapeHtml_(title)}</span>
    <span class="mini-event__badge">${badge}</span>
  </div>`;
}

function cleanTitle_(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/^Geburtstag:\s*/i, "")
    .replace(/^Birthday:\s*/i, "")
    .trim();
}

function formatMiniPrefixCompact_(e) {
  if (!e || !e.start) return "";
  if (e.allDay) return "весь день";
  const d = new Date(e.start);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}

function formatMiniPrefixFull_(e) {
  if (!e || !e.start) return "";
  const d = new Date(e.start);

  const wdArr = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const wd = wdArr[d.getDay()] || "";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");

  if (e.allDay) return `${wd} ${dd}.${mm}`;

  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${wd} ${dd}.${mm} ${hh}:${mi}`;
}

function escapeHtml_(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}