// auth.js — финальный общий файл авторизации для всех страниц sch7.at
// Работает с Node API на https://api.sch7.at через cookie-сессию.
//
// Требования на странице:
// - должен быть #auth-gate (оверлей)
// - должен быть #app-root (контент сайта)
// - (желательно) #auth-hint для текста
//
// Как использовать:
// 1) Подключи <script src="auth.js"></script> ПЕРЕД остальными скриптами.
// 2) Твои скрипты запускай только после события "auth-ready":
//    window.addEventListener("auth-ready", ()=> { ... });

const API_BASE = "https://api.sch7.at";

// Защита от бесконечного редиректа (если cookies блокируются)
const GUARD_KEY = "SCH7_AUTH_REDIRECT_GUARD_TS";
const GUARD_TTL_MS = 25_000;

function $(id){ return document.getElementById(id); }

function setHint(text){
  const el = $("auth-hint");
  if (el) el.textContent = text || "";
}

function showGate(text){
  const gate = $("auth-gate");
  const root = $("app-root");
  if (gate) gate.style.display = "flex";
  if (root) root.style.display = "none";
  setHint(text);
}

function showApp(){
  const gate = $("auth-gate");
  const root = $("app-root");
  if (gate) gate.style.display = "none";
  if (root) root.style.display = "";
  // сигнал всем скриптам, что можно стартовать
  window.dispatchEvent(new Event("auth-ready"));
}

function guardSet(){
  try { localStorage.setItem(GUARD_KEY, String(Date.now())); } catch {}
}
function guardClear(){
  try { localStorage.removeItem(GUARD_KEY); } catch {}
}
function guardActive(){
  try {
    const t = Number(localStorage.getItem(GUARD_KEY) || 0);
    return t && (Date.now() - t) < GUARD_TTL_MS;
  } catch { return false; }
}

async function apiMe(){
  const r = await fetch(`${API_BASE}/auth/me`, {
    method: "GET",
    cache: "no-store",
    credentials: "include", // КРИТИЧНО: иначе cookie не поедет
  });
  if (!r.ok) return { ok:false, status:r.status };
  const j = await r.json().catch(()=> ({}));
  return j && j.ok ? j : { ok:false };
}

function buildLoginUrl(){
  const returnUrl = location.href.split("#")[0];
  return `${API_BASE}/auth/login?return=${encodeURIComponent(returnUrl)}`;
}

// Локальный logout: вызывает API и перезагружает страницу
window.logout = async function logout(){
  showGate("Вихід…");
  try{
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type":"application/json" },
    });
  }catch(_){}
  guardClear();
  location.href = location.pathname; // очистить параметры/якоря
};

(async function initAuth(){
  // Показать оверлей пока проверяем
  showGate("Перевіряємо доступ…");

  // 1) Пробуем проверить сессию
  try{
    const me = await apiMe();
    if (me && me.ok){
      guardClear();
      showApp();
      return;
    }
  }catch(e){
    // Render может "спать" / сеть
    showGate("API тимчасово недоступний.\nСпробуй оновити сторінку через 5–10 секунд.");
    console.warn("auth: apiMe failed", e);
    return;
  }

  // 2) Сессии нет -> идём на login
  // Но если уже пытались недавно — значит cookies могут блокироваться
  if (guardActive()){
    showGate(
      "Сесія не зберігається (cookie блокується браузером).\n\n" +
      "Що зробити:\n" +
      "• iPhone/Safari: Settings → Safari → Prevent Cross-Site Tracking = OFF\n" +
      "• або відкрий в Chrome\n\n" +
      "Потім онови сторінку."
    );
    return;
  }

  guardSet();
  showGate("Потрібен вхід… переадресація на Google Login");
  location.replace(buildLoginUrl());
})();