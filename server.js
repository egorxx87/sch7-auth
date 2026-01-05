import express from "express";
import session from "express-session";
import fetch from "node-fetch";

const app = express();

/* ===== CONFIG ===== */
const FRONTEND_ORIGIN = "https://sch7.at";
const BASE_URL = "https://api.sch7.at";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const ALLOWED_EMAILS = new Set([
  "egor.vorobiew1@gmail.com",
  "mekh.gastro@gmail.com",
  "karyna.m.ross@gmail.com",
  "i.max.ross@gmail.com",
]);

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
}

/* ===== SESSION ===== */
app.set("trust proxy", 1);
app.use(express.json());

app.use(
  session({
    name: "sch7.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 180 * 24 * 60 * 60 * 1000,
    },
  })
);

/* ===== CORS ===== */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ===== HELPERS ===== */
function googleAuthUrl(state) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${BASE_URL}/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
}

/* ===== ROUTES ===== */
app.get("/auth/login", (req, res) => {
  const returnUrl = req.query.return;
  if (!returnUrl || !returnUrl.startsWith("https://sch7.at")) {
    return res.status(400).send("BAD_RETURN");
  }

  const state = crypto.randomUUID();
  req.session.state = state;
  req.session.returnUrl = returnUrl;

  res.redirect(googleAuthUrl(state));
});

app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || state !== req.session.state) {
    return res.status(400).send("BAD_STATE");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: `${BASE_URL}/auth/callback`,
      grant_type: "authorization_code",
    }),
  });

  const token = await tokenRes.json();
  if (!token.access_token) return res.status(400).send("TOKEN_FAIL");

  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const user = await userRes.json();

  const email = String(user.email || "").toLowerCase();
  if (!ALLOWED_EMAILS.has(email)) {
    return res.status(403).send("NOT_ALLOWED");
  }

  req.session.user = { email };
  res.redirect(req.session.returnUrl);
});

app.get("/auth/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ ok: false });
  res.json({ ok: true, email: req.session.user.email });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* ===== START ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Auth server running"));