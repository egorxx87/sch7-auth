const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwNlMF6GEshtn2-5C1n-EsaCRkNZa2xPOQ2mA2zfdYvZyEIl3JSk4evG2NgkCMQaUdqaA/exec";

// оставь свой реальный URL как был у тебя в файле
const ACTIVE_MINUTES = 10; // бронь "активна" ещё 10 минут после времени

/* ================== DOM ================== */
const elDays   = document.getElementById("res-days");
const elStatus = document.getElementById("res-status-text");
const elError  = document.getElementById("res-error-text");
const elToast  = document.getElementById("toast");
const nowLine  = document.getElementById("res-nowline");

const loaderEl     = document.getElementById("global-loader");
const loaderTextEl = document.getElementById("global-loader-text");

const tabToday    = document.getElementById("tab-today");
const tabTomorrow = document.getElementById("tab-tomorrow");
const tabWeek     = document.getElementById("tab-week");
const tabMonth    = document.getElementById("tab-month");
// ✅ НОВОЕ
const tabAll      = document.getElementById("tab-all");

const dateWrap    = document.getElementById("res-date-wrap");
const dateInput   = document.getElementById("res-date-input");
const dateClear   = document.getElementById("res-date-clear");

const btnAdd = document.getElementById("res-add");
const nConfirmed = document.getElementById("new-confirmed");
const nDate = document.getElementById("new-date");
const nTime = document.getElementById("new-time");
const nGuests = document.getElementById("new-guests");

// ✅ НОВОЕ: место/стол (manual)
const nTable = document.getElementById("new-table");

const nFrom = document.getElementById("new-from");
const nEmail = document.getElementById("new-email");
const nPhone = document.getElementById("new-phone");
const nNote = document.getElementById("new-note");

// modal
const modal = document.getElementById("edit-modal");
const mClose = document.getElementById("edit-close");
const mCancel = document.getElementById("edit-cancel");
const mSave = document.getElementById("edit-save");
const eConfirmed = document.getElementById("edit-confirmed");
const eDate = document.getElementById("edit-date");
const eTime = document.getElementById("edit-time");
const eGuests = document.getElementById("edit-guests");

// ✅ НОВОЕ: место/стол (manual)
const eTable = document.getElementById("edit-table");

const eFrom = document.getElementById("edit-from");
const eEmail = document.getElementById("edit-email");
const ePhone = document.getElementById("edit-phone");
const eNote = document.getElementById("edit-note");

let cache = [];
let mode = "today";
let editRowId = null;
let pickedDateISO = ""; // YYYY-MM-DD

/* ================== INIT ================== */
init();

function init(){
  tabToday?.addEventListener("click", ()=> setMode("today", tabToday));
  tabTomorrow?.addEventListener("click", ()=> setMode("tomorrow", tabTomorrow));
  tabWeek?.addEventListener("click", ()=> setMode("week", tabWeek));
  tabMonth?.addEventListener("click", ()=> setMode("month", tabMonth));
  tabAll?.addEventListener("click", ()=> setMode("all", tabAll));

  // ✅ Дата всегда видна → кнопки tabDate больше нет
  // При выборе даты включаем режим "date" и перерисовываем
  dateInput?.addEventListener("change", ()=>{
    pickedDateISO = String(dateInput.value || "").trim();
    if(pickedDateISO){
      // setMode вызовет render()
      setMode("date", null);
    }
  });

  // ✅ "Скинути" → очистить дату и вернуть "Сьогодні"
  dateClear?.addEventListener("click", ()=>{
    pickedDateISO = "";
    if(dateInput) dateInput.value = "";
    setMode("today", tabToday);
  });

  btnAdd?.addEventListener("click", addManual);

  // enter = add
  [nDate,nTime,nGuests,nTable,nFrom,nEmail,nPhone,nNote].forEach(inp=>{
    inp?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") addManual(); });
  });

  mClose?.addEventListener("click", closeModal);
  mCancel?.addEventListener("click", closeModal);
  modal?.querySelector(".res-modal__backdrop")?.addEventListener("click", closeModal);

  // ✅ если даты ещё нет — поставим сегодня (чтобы сразу видно было дату)
  if(dateInput && !dateInput.value){
    pickedDateISO = toISODate_(new Date());
    dateInput.value = pickedDateISO;
  }

  setMode("today", tabToday);
  fetchAll();
}

/* ================== MODE ================== */
function setMode(m, btn){
  mode = m;
  [tabToday, tabTomorrow, tabWeek, tabMonth, tabAll]
  .forEach(b=>b?.classList.remove("is-active"));

  // показываем/скрываем блок выбора даты

  render();
}



/* ================== LOAD ================== */
async function fetchAll(){
  setError("");
  setLoading(true, "Завантажую резервації…");
  try{
    const res = await fetch(WEBAPP_URL + "?action=getAll");
    const json = await res.json();
    if(!json.ok) throw new Error(json.error || "Помилка завантаження");
    cache = Array.isArray(json.data) ? json.data : [];
    render();
  }catch(err){
    setError(String(err.message || err));
    elStatus.textContent = "Помилка завантаження";
  }finally{
    setLoading(false);
  }
}

/* ================== FIX MANUAL FIELD MAPPING ================== */
function looksLikeEmail_(s){
  return /@/.test(String(s||"").trim());
}
function looksLikePhone_(s){
  const v = String(s||"").trim();
  if(!v) return false;
  if(/^\+?\d[\d\s\-()]{5,}$/.test(v)) return true;
  const digits = v.replace(/[^\d]/g,"");
  return digits.length >= 6;
}

/**
 * ✅ Чиним ТОЛЬКО manual:
 * - место/стол должно быть отдельным полем (table)
 * - имя должно быть в from
 * - email в email
 * - телефон в phone
 *
 * Ловим твой кейс со скрина:
 * from = "Stuberl" (это стол)
 * email = "Weingant" (это имя)
 * note = "6644341520" (это телефон)
 */
function fixManualFields_(x){
  if (isQuandoo(x)) return x;
  const out = { ...x };

  // 1) стол/место: у тебя часто это колонка "Стіл" => stil
  const tableCandidate =
    out.table ?? out.place ?? out.area ?? out.room ?? out.steel ?? out.stil ?? out.style;

  if (tableCandidate != null && String(tableCandidate).trim() !== "") {
    out.table = String(tableCandidate).trim();
  } else {
    out.table = String(out.table || "").trim();
  }

  // нормализуем строки
  out.from  = String(out.from  || "").trim();
  out.email = String(out.email || "").trim();
  out.phone = String(out.phone || "").trim();
  out.note  = String(out.note  || "").trim();

  // 2) если телефон по ошибке попал в note — переносим в phone
  if (!out.phone && looksLikePhone_(out.note)) {
    out.phone = out.note;
    out.note = "";
  }

  // 3) если "email" на самом деле имя (нет @),
  // и "from" равен столу (или from пустой) — переносим "email" -> from
  if (out.email && !looksLikeEmail_(out.email)) {
    const fromLooksLikeTable = !!out.table && out.from && out.from === out.table;
    const fromEmpty = !out.from;

    if (fromLooksLikeTable || fromEmpty) {
      out.from = out.email;   // имя
      out.email = "";         // email пусто
    }
  }

  return out;
}

/* ================== FILTER RULES ================== */
/**
 * Нормализация:
 * - оставляем только записи с корректной датой dd.mm.yyyy
 * - и временем HH:MM
 *
 * Важно: фильтр "от сегодня" делаем в render() по режимам.
 * Для режима "Дата" можно смотреть любой выбранный день.
 */
function normalizeAndKeep(x){
  // ✅ сначала чинить manual поля
  x = fixManualFields_(x);

  const date = String(x?.date||"").trim();
  const time = String(x?.time||"").trim();

  if(!isDDMMYYYY(date)) return null;
  if(!isHHMM(time)) return null;

  const dt = toDateTime(date, time);
  if(!dt) return null;

  return { ...x, _dt: dt };
}

function rangeForMode(){
  const start = new Date();
  start.setHours(0,0,0,0);

  const end = new Date(start);
  if(mode==="today"){
    end.setDate(end.getDate());
    end.setHours(23,59,59,999);
  }else if(mode==="tomorrow"){
    start.setDate(start.getDate()+1);
    end.setDate(end.getDate()+1);
    end.setHours(23,59,59,999);
  }else if(mode==="week"){
    end.setDate(end.getDate()+6);
    end.setHours(23,59,59,999);
  }else{ // month
    end.setDate(end.getDate()+29);
    end.setHours(23,59,59,999);
  }
  return { start, end };
}

function rangeForAll_(){
  const start = new Date();
  start.setHours(0,0,0,0);
  const end = new Date(start);
  // «всі від сьогодні» — покажем на 12 месяцев вперёд
  end.setDate(end.getDate() + 365);
  end.setHours(23,59,59,999);
  return { start, end };
}

function rangeForPickedDate_(){
  // pickedDateISO: YYYY-MM-DD
  if(!pickedDateISO){
    const today = new Date();
    today.setHours(0,0,0,0);
    const e = new Date(today);
    e.setHours(23,59,59,999);
    return { start: today, end: e };
  }
  const m = String(pickedDateISO).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m){
    const today = new Date();
    today.setHours(0,0,0,0);
    const e = new Date(today);
    e.setHours(23,59,59,999);
    return { start: today, end: e };
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const start = new Date(y, mo, d, 0, 0, 0, 0);
  const end = new Date(y, mo, d, 23, 59, 59, 999);
  return { start, end };
}

/* ================== RENDER ================== */
function render(){
  if(!elDays) return;

  const { start, end } =
    (mode === "all")  ? rangeForAll_() :
    (mode === "date") ? rangeForPickedDate_() :
    rangeForMode();

  const startToday = new Date();
  startToday.setHours(0,0,0,0);

  // normalize + filter
  const rows = cache
    .map(normalizeAndKeep)
    .filter(Boolean)
    .filter(x => x._dt >= start && x._dt <= end)
    // ✅ по всем режимам КРОМЕ "date" скрываем прошлые даты
    .filter(x => mode === "date" ? true : (x._dt >= startToday))
    .sort((a,b)=> a._dt - b._dt);

  // group by day
  const byDay = new Map();
  for(const r of rows){
    const key = ddmmyyyyFromDate(r._dt);
    if(!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(r);
  }

  // status text
  const active = rows.filter(r => !isCancelled(r));
  const manual = active.filter(r => !isQuandoo(r)).length;
  const quandoo = active.filter(r => isQuandoo(r)).length;

  const label =
    mode==="today" ? "Сьогодні" :
    mode==="tomorrow" ? "Завтра" :
    mode==="week" ? "Тиждень" : "Місяць";

  const label2 =
    mode==="all" ? "Всі" :
    mode==="date" ? `Дата: ${pickedDateISO ? isoToDDMMYYYY_(pickedDateISO) : ddmmyyyyFromDate(new Date())}` :
    label;

  elStatus.textContent = `${label2}: ${active.length} (ручн. ${manual} / Quandoo ${quandoo})`;

  // render days
  elDays.innerHTML = "";

  if(byDay.size === 0){
    elDays.innerHTML = `<div style="color:#6b7280;padding:10px;">Немає резервацій</div>`;
    setNowLine(false);
    return;
  }

  for(const [day, list] of byDay.entries()){
    const activeDay = list.filter(r => !isCancelled(r));
    const sumGuests = activeDay.reduce((acc,r)=> acc + (toInt(r.guests)||0), 0);
    const manualDay = activeDay.filter(r=>!isQuandoo(r)).length;
    const quandooDay = activeDay.filter(r=>isQuandoo(r)).length;

    const dayEl = document.createElement("div");
    dayEl.className = "res-day";

    dayEl.innerHTML = `
      <div class="res-day__head">
        <div class="res-day__title">${escapeHtml(day)}</div>
        <div class="res-day__totals">Гостей: ${sumGuests} · ручн. ${manualDay} · Quandoo ${quandooDay}</div>
      </div>
      <div class="res-list"></div>
    `;

    const listEl = dayEl.querySelector(".res-list");

    for(const item of list){
      listEl.appendChild(renderItem(item));
    }

    elDays.appendChild(dayEl);
  }

  // now line only in today mode
  if(mode==="today"){
    positionNowLine();
  }else{
    setNowLine(false);
  }
}

/* ================== NOW LINE ================== */
function setNowLine(show){
  if(!nowLine) return;
  nowLine.style.display = show ? "block" : "none";
}

function positionNowLine(){
  // Линию ставим по текущему времени среди сегодняшних элементов
  setNowLine(true);

  // если сегодня нет списка — спрячем
  const firstDay = elDays?.querySelector(".res-day");
  if(!firstDay){ setNowLine(false); return; }

  // линия должна быть внутри board (absolute)
  const boardRect = document.querySelector(".res-board")?.getBoundingClientRect();
  if(!boardRect){ setNowLine(false); return; }

  const now = new Date();
  const items = [...document.querySelectorAll(".res-day:first-child .res-item")];
  if(items.length === 0){ setNowLine(false); return; }

  // найдём первый элемент, который позже now
  let target = null;
  for(const el of items){
    const timeText = el.querySelector(".res-time")?.textContent || "";
    const dt = toDateTime(ddmmyyyyFromDate(now), timeText.trim());
    if(dt && dt >= now){ target = el; break; }
  }

  const boardTop = boardRect.top + window.scrollY;

  let y;
  if(!target){
    // если все раньше — линия внизу списка
    const last = items[items.length-1].getBoundingClientRect();
    y = (last.bottom + window.scrollY) - boardTop;
  }else{
    const r = target.getBoundingClientRect();
    y = (r.top + window.scrollY) - boardTop;
  }

  nowLine.style.top = `${Math.max(10, y)}px`;
}

window.addEventListener("scroll", ()=> { if(mode==="today") positionNowLine(); }, { passive:true });
window.addEventListener("resize", ()=> { if(mode==="today") positionNowLine(); });

/* ================== EDIT MODAL (manual) ================== */
function openEdit(item){
  // ✅ чинить на всякий случай прямо тут
  item = fixManualFields_(item);

  editRowId = item.row;

  eConfirmed.checked = !!item.confirmed;
  eDate.value = String(item.date||"");
  eTime.value = String(item.time||"");
  eGuests.value = String(item.guests||"");

  // ✅ место/стол
  eTable.value = String(item.table || item.area || "").trim();

  eFrom.value = String(item.from||"");
  eEmail.value = String(item.email||"");
  ePhone.value = String(item.phone||"");

  // note/menu2 как было
  eNote.value = String(item.note||item.menu2||"");

modal.classList.remove("res-modal--hidden");
modal.setAttribute("aria-hidden", "false");
document.body.classList.add("res-modal-open");

  mSave.onclick = async ()=>{
    const patch = {
      confirmed: !!eConfirmed.checked,
      date: (eDate.value||"").trim(),
      time: (eTime.value||"").trim(),
      guests: (eGuests.value||"").trim(),

      // ✅ сохраняем место/стол в table + дублируем в area (если backend ждёт area)
      table: (eTable.value||"").trim(),
      area:  (eTable.value||"").trim(),

      from: (eFrom.value||"").trim(),
      email: (eEmail.value||"").trim(),
      phone: (ePhone.value||"").trim(),
      note: (eNote.value||"").trim(),
    };
    await updateRow(editRowId, patch, mSave);
    closeModal();
    await fetchAll();
  };
}

function closeModal(){
  editRowId = null;
  modal.classList.add("res-modal--hidden");
modal.setAttribute("aria-hidden", "true");
document.body.classList.remove("res-modal-open");
}

/* ================== WRITE API ================== */
async function updateRow(row, patch, el){
  if(!row) return;
  try{
    setLoading(true, "Зберігаю…");
    const res = await fetch(WEBAPP_URL, {
      method:"POST",
      headers:{ "Content-Type":"text/plain;charset=utf-8" },
      body: JSON.stringify({ action:"updateRow", row, data: patch })
    });
    const json = await res.json();
    if(!json.ok) throw new Error(json.error || "Помилка оновлення");
    toast("Збережено ✅");
  }catch(err){
    console.error(err);
    toast("Помилка ❌");
  }finally{
    setLoading(false);
  }
}

async function addManual(){
  const data = {
    confirmed: !!nConfirmed.checked,
    date: (nDate.value||"").trim(),
    time: (nTime.value||"").trim(),
    guests: (nGuests.value||"").trim(),

    // ✅ место/стол
    table: (nTable?.value||"").trim(),
    area:  (nTable?.value||"").trim(),

    from: (nFrom.value||"").trim(),
    email: (nEmail.value||"").trim(),
    phone: (nPhone.value||"").trim(),
    note: (nNote.value||"").trim(),
  };

  if(!data.date || !data.time) return toast("Потрібні дата і час");
  if(!isDDMMYYYY(data.date)) return toast("Дата має бути dd.mm.yyyy");
  if(!isHHMM(data.time)) return toast("Час має бути HH:MM");

  try{
    setLoading(true, "Додаю…");
    const res = await fetch(WEBAPP_URL, {
      method:"POST",
      headers:{ "Content-Type":"text/plain;charset=utf-8" },
      body: JSON.stringify({ action:"add", data })
    });
    const json = await res.json();
    if(!json.ok) throw new Error(json.error || "Не додалося");

    toast("Додано ✅");
    nConfirmed.checked = false;
    [nDate,nTime,nGuests,nTable,nFrom,nEmail,nPhone,nNote].forEach(i=>{ if(i) i.value=""; });
    await fetchAll();
  }catch(err){
    console.error(err);
    toast("Не додалося ❌");
  }finally{
    setLoading(false);
  }
}

function menuBadgeForItem_(item){
  // показываем ТОЛЬКО для ручных (manual)
  const isQ = isQuandoo(item);
  if (isQ) return "";

  // берем только колонку G (menu)
  const v = String(item?.menu ?? "").trim();
  const key = v.toLowerCase();

  // пусто -> желтая "Меню ?"
  if (!v) return `<span class="res-menu-badge res-menu--unknown">Меню ?</span>`;

  // немає/нема/немае/немое/нет/no/none -> ничего
  if (/^нем/i.test(key) || ["нет","no","none"].includes(key)) return "";

  // зеленая только если ровно "меню" (или "menu")
  if (key === "меню" || key === "menu") return `<span class="res-menu-badge res-menu--yes">Меню</span>`;

  // любой другой текст -> ничего
  return "";
}

function renderItem(item){
  // ✅ чинить manual поля и тут тоже
  item = fixManualFields_(item);

  const isQ = isQuandoo(item);
  const cancelled = isCancelled(item);

  const dt = item._dt;
  const past = isPast(dt, ACTIVE_MINUTES);

  const srcBadge = isQ
    ? `<span class="res-badge res-badge--quandoo">Quandoo</span>`
    : `<span class="res-badge res-badge--manual">ручн.</span>`;

  const cancelBadge = cancelled
    ? `<span class="res-badge res-badge--cancelled">Отменено</span>`
    : "";

  const { shortName, rest } = isQ
    ? splitQuandoo(item.from)
    : { shortName: (item.from||"—"), rest:"" };

  const hasDetails = isQ && rest;

  // ✅ МЕНЮ-БЕЙДЖ
  const menuBadge = menuBadgeForItem_(item);

  // ✅ стол/место только для manual
  // ✅ стол/место только для manual (колонка H = stil/table/area)
// если пусто — не показываем вообще
const rawTable = !isQ ? String(item.stil || item.table || item.area || item.style || "").trim() : "";
const tableLabel = (!isQ && rawTable) ? `Стіл: ${rawTable}` : "";

  const wrap = document.createElement("div");
  wrap.className = "res-item";
  if(past) wrap.classList.add("is-past");
  if(cancelled) wrap.classList.add("is-cancelled");

  wrap.innerHTML = `
    <div style="min-width:0; width:100%;">
      <div class="res-item__left">
        <div class="res-time">${escapeHtml(hhmm(dt))}</div>
        <div class="res-meta">${escapeHtml(String(item.guests||""))} гостей</div>
        ${(!isQ && tableLabel) ? `<div class="res-meta">${escapeHtml(tableLabel)}</div>` : ``}
        <div class="res-item__name">${escapeHtml(shortName || "—")}</div>
      </div>

      ${hasDetails ? `<div class="res-details">${escapeHtml(rest)}</div>` : ``}
    </div>

    <div class="res-item__right">
      ${menuBadge}
      ${srcBadge}
      ${cancelBadge}
      ${hasDetails ? `<button class="res-btn" type="button" data-act="more">Подробнее</button>` : ``}
      ${(!isQ) ? `<button class="res-btn" type="button" data-act="edit">Ред.</button>` : ``}
    </div>
  `;

  if(hasDetails){
    const btnMore = wrap.querySelector('[data-act="more"]');
    const det = wrap.querySelector(".res-details");
    btnMore?.addEventListener("click", ()=>{
      const open = det.classList.toggle("is-open");
      btnMore.textContent = open ? "Скрыть" : "Подробнее";
    });
  }

  if(!isQ){
    const btnEdit = wrap.querySelector('[data-act="edit"]');
    btnEdit?.addEventListener("click", ()=> openEdit(item));
  }

  return wrap;
}

/* ================== HELPERS ================== */
function isQuandoo(x){
  return String(x?.source||"").toLowerCase() === "quandoo";
}
function isCancelled(x){
  return !!x?.cancelled || String(x?.status||"").toLowerCase() === "cancelled";
}

function splitQuandoo(raw){
  const s = String(raw||"").trim();
  if(!s) return { shortName:"—", rest:"" };

  // имя = первые два слова
  const parts = s.split(/\s+/);
  const shortName = parts.slice(0,2).join(" ");

  const rest = parts.length > 2 ? parts.slice(2).join(" ") : "";
  return { shortName, rest };
}

function isPast(dt, activeMinutes){
  const now = new Date();
  const grace = new Date(dt.getTime() + activeMinutes*60000);
  return grace < now;
}

function toInt(v){
  const n = Number(String(v||"").replace(/[^\d]/g,""));
  return Number.isFinite(n) ? n : 0;
}

function isDDMMYYYY(s){
  return /^(\d{2})\.(\d{2})\.(\d{4})$/.test(String(s||"").trim());
}
function isHHMM(s){
  return /^(\d{1,2}):(\d{2})$/.test(String(s||"").trim());
}

function toDateTime(ddmmyyyy, hhmmStr){
  const m = String(ddmmyyyy||"").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const t = String(hhmmStr||"").match(/^(\d{1,2}):(\d{2})$/);
  if(!m || !t) return null;
  const d = Number(m[1]), mo = Number(m[2])-1, y=Number(m[3]);
  const h = Number(t[1]), mi=Number(t[2]);
  return new Date(y, mo, d, h, mi, 0, 0);
}

function ddmmyyyyFromDate(d){
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yy = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

function hhmm(d){
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function setLoading(on, text="Завантаження…"){
  if(!loaderEl) return;
  loaderTextEl.textContent = text;
  loaderEl.classList.toggle("global-loader--hidden", !on);
  // чтобы не тыкали 100 раз
  [tabToday,tabTomorrow,tabWeek,tabMonth,tabAll,btnAdd,mSave,dateClear].forEach(b=>{ if(b) b.disabled = on; });
}

function setError(msg){
  if(!msg){ elError.style.display="none"; elError.textContent=""; return; }
  elError.style.display="inline";
  elError.textContent = msg;
}

function toast(msg){
  elToast.textContent = msg;
  elToast.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> elToast.style.display="none", 2000);
}

function escapeHtml(s){
  return String(s??"").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
}
function setVhUnit(){
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setVhUnit();
window.addEventListener('resize', setVhUnit);
window.addEventListener('orientationchange', setVhUnit);

/* ===== small helpers for date picker ===== */
function toISODate_(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function isoToDDMMYYYY_(iso){
  const m = String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return String(iso||"");
  return `${m[3]}.${m[2]}.${m[1]}`;
}