// Shared helpers for the API functions. Secrets come only from Vercel environment variables.
const crypto = require("crypto");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function storageReady() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

// Runs several Redis commands in one request (Upstash REST pipeline).
async function redis(commands) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Storage error ${res.status}`);
  return (await res.json()).map(r => r.result);
}

// City and country from Vercel's edge headers. No IP address is read or stored.
function location(req) {
  const decode = v => { try { return decodeURIComponent(v || ""); } catch { return v || ""; } };
  const city = decode(req.headers["x-vercel-ip-city"]);
  const country = (req.headers["x-vercel-ip-country"] || "").toUpperCase();
  return { city, country, label: [city, country].filter(Boolean).join(", ") || "Unknown" };
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function passwordMatches(given) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || typeof given !== "string") return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

module.exports = { storageReady, redis, location, cors, passwordMatches, body };
