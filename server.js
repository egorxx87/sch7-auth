// server.js — sch7 auth API (Render)
// Flow:
//  - GET  /              -> OK
//  - GET  /health        -> {ok:true}
//  - GET  /auth/login    -> redirect to Google OAuth
//  - GET  /auth/callback -> exchange code -> userinfo -> create session -> req.session.save -> redirect back
//  - GET  /auth/me       -> {ok:true,email} if session exists else 401
//  - POST /auth/logout   -> destroy session + clear cookie

import express from "express";
import session from "express-session";
import crypto from "crypto";

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;

// Твой API домен (должен совпадать с реальным)
const BASE_URL = (process.env.BASE_URL || "https://api.sch7.at").trim();

// Google OAuth
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || "").trim();

// Секрет сессии
const SESSION_SECRET = (process.env.SESSION_SECRET || "").trim();

// Allowlist origins фронта
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "https://sch7.at,https://www.sch7.at")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
);

// Allowlist email
const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS ||
    "egor.vorobiew1@gmail.com,mekh.gastro@gmail.com,karyna.m.ross@gmail.com,i.max.ross@gmail.com"
  )
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);

// как долго держим сессию
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 180);

if (!GOOGLE_CLIENT_ID) console.warn("⚠️ Missing env GOOGLE_CLIENT_ID");
if (!GOOGLE_CLIENT_SECRET) console.warn("⚠️ Missing env GOOGLE_CLIENT_SECRET");
if (!SESSION_SECRET) console.warn("⚠️ Missing env SESSION_SECRET");

app.use(express.json());

// CORS (важно: credentials + конкретный origin, не "*")
app.use((req, res, next) => {
  const origin = String(req.headers.origin || "");

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Session cookie (важно для cross-site: sameSite none + secure)
app.use(
  session({
    name: "sch7.sid",
    secret: SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    rolling: true, // обновляет cookie maxAge при каждом запросе
    cookie: {
      httpOnly: true,
      secure: true,      // MUST для https
      sameSite: "none",  // MUST для sch7.at -> api.sch7.at
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    },
  })
);

/* =========================
   HELPERS
========================= */

function isAllowedReturnUrl(returnUrl) {
  try {
    const u = new URL(returnUrl);
    if (u.protocol !== "https:") return false;
    return ALLOWED_ORIGINS.has(u.origin);
  } catch {
    return false;
  }
}

function makeGoogleAuthUrl(state) {
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${BASE_URL}/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
    access_type: "online",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

function textErr(res, code, msg) {
  return res.status(code).type("text").send(msg);
}

function cryptoRandomState_() {
  // Нормальный state для OAuth
  return crypto.randomBytes(24).toString("hex");
}

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.type("text").send("OK");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// старт логина
app.get("/auth/login", (req, res) => {
  const returnUrl = String(req.query.return || "").trim();

  if (!returnUrl || !isAllowedReturnUrl(returnUrl)) {
    return textErr(res, 400, "BAD_RETURN");
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return textErr(res, 500, "SERVER_MISSING_GOOGLE_ENV");
  }

  const state = cryptoRandomState_();
  req.session.oauthState = state;
  req.session.returnUrl = returnUrl;

  return res.redirect(makeGoogleAuthUrl(state));
});

// callback от Google
app.get("/auth/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "").trim();
    const state = String(req.query.state || "").trim();

    if (!code) return textErr(res, 400, "NO_CODE");

    if (!state || state !== req.session.oauthState) {
      return textErr(res, 400, "BAD_STATE");
    }

    const returnUrl = String(req.session.returnUrl || "").trim();
    if (!returnUrl || !isAllowedReturnUrl(returnUrl)) {
      return textErr(res, 400, "BAD_RETURN");
    }

    // exchange code -> token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${BASE_URL}/auth/callback`,
        grant_type: "authorization_code",
      }),
    });

    const token = await tokenRes.json();
    if (!token || !token.access_token) {
      return textErr(res, 400, "TOKEN_EXCHANGE_FAILED");
    }

    // userinfo
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    const user = await userRes.json();
    const email = String(user.email || "").trim().toLowerCase();

    if (!email) return textErr(res, 400, "NO_EMAIL");
    if (!ALLOWED_EMAILS.has(email)) return textErr(res, 403, "NOT_ALLOWED");

    // ✅ создаём сессию
    req.session.user = { email, at: Date.now() };

    // 🔥 КРИТИЧНО: сохранить сессию ДО редиректа
    return req.session.save((err) => {
      if (err) return textErr(res, 500, "SESSION_SAVE_FAILED");

      // ✅ чистим одноразовые поля
      delete req.session.oauthState;
      delete req.session.returnUrl;

      res.redirect(returnUrl);
    });

  } catch (e) {
    return textErr(res, 500, "AUTH_CALLBACK_ERROR: " + String(e?.message || e));
  }
});

// проверка сессии
app.get("/auth/me", (req, res) => {
  if (!req.session.user || !req.session.user.email) {
    return res.status(401).json({ ok: false });
  }
  res.json({ ok: true, email: req.session.user.email });
});

// logout
app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    // важно: удалить cookie
    res.clearCookie("sch7.sid", { sameSite: "none", secure: true });
    res.json({ ok: true });
  });
});

/* =========================
   START
========================= */

app.listen(PORT, () => {
  console.log("✅ sch7-auth running:", PORT);
  console.log("BASE_URL:", BASE_URL);
  console.log("ALLOWED_ORIGINS:", [...ALLOWED_ORIGINS]);
  console.log("ALLOWED_EMAILS:", [...ALLOWED_EMAILS]);
});