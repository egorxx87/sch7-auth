import express from "express";
import session from "express-session";
import crypto from "crypto";

const app = express();

/* =========================
   CONFIG
========================= */

// Разрешённые origins фронта (GitHub Pages)
const ALLOWED_ORIGINS = new Set([
  "https://sch7.at",
  "https://www.sch7.at",
]);

// Твой публичный URL API (после SSL)
const BASE_URL = "https://api.sch7.at";

// Google OAuth
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

// Секрет сессии (любой длинный)
const SESSION_SECRET = process.env.SESSION_SECRET || "";

// Белый список email (можешь расширять)
const ALLOWED_EMAILS = new Set([
  "egor.vorobiew1@gmail.com",
  "mekh.gastro@gmail.com",
  "karyna.m.ross@gmail.com",
  "i.max.ross@gmail.com",
].map((x) => x.trim().toLowerCase()).filter(Boolean));

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error("❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in env");
}
if (!SESSION_SECRET) {
  console.error("❌ Missing SESSION_SECRET in env");
}

/* =========================
   MIDDLEWARE
========================= */

app.set("trust proxy", 1);
app.use(express.json());

// CORS (важно: credentials true)
app.use((req, res, next) => {
  const origin = String(req.headers.origin || "");
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Session cookie (будет храниться на api.sch7.at и слаться с sch7.at запросами)
app.use(
  session({
    name: "sch7.sid",
    secret: SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,      // обязательно для https
      sameSite: "none",  // обязательно для cross-site (sch7.at -> api.sch7.at)
      maxAge: 180 * 24 * 60 * 60 * 1000, // 180 дней
    },
  })
);

/* =========================
   HELPERS
========================= */

function isAllowedReturnUrl(returnUrl) {
  try {
    const u = new URL(returnUrl);
    return ALLOWED_ORIGINS.has(u.origin); // разрешаем любые пути внутри sch7.at и www.sch7.at
  } catch {
    return false;
  }
}

function googleAuthUrl(state) {
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${BASE_URL}/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
    access_type: "online",
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
}

/* =========================
   ROUTES
========================= */

// чтобы не было "Cannot GET /"
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
    return res.status(400).type("text").send("BAD_RETURN");
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).type("text").send("SERVER_MISSING_GOOGLE_ENV");
  }

  const state = crypto.randomUUID();
  req.session.oauthState = state;
  req.session.returnUrl = returnUrl;

  res.redirect(googleAuthUrl(state));
});

// callback от Google
app.get("/auth/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");

    if (!code) return res.status(400).type("text").send("NO_CODE");
    if (!state || state !== req.session.oauthState) {
      return res.status(400).type("text").send("BAD_STATE");
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
      return res.status(400).type("text").send("TOKEN_EXCHANGE_FAILED");
    }

    // get user info
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const user = await userRes.json();

    const email = String(user.email || "").trim().toLowerCase();
    if (!email) return res.status(400).type("text").send("NO_EMAIL");

    if (!ALLOWED_EMAILS.has(email)) {
      return res.status(403).type("text").send("NOT_ALLOWED");
    }

    req.session.user = { email, at: Date.now() };

    const back = String(req.session.returnUrl || "https://sch7.at");
    res.redirect(back);
  } catch (e) {
    res.status(500).type("text").send("AUTH_CALLBACK_ERROR: " + (e?.message || String(e)));
  }
});

// проверить сессию (фронт дергает fetch(..., {credentials:"include"})
app.get("/auth/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ ok: false });
  res.json({ ok: true, email: req.session.user.email });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* =========================
   START
========================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Auth server running on port", PORT));