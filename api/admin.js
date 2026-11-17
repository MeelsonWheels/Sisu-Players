// Returns the admin dashboard data. Requires the ADMIN_PASSWORD set in Vercel.
const { storageReady, redis, passwordMatches } = require("./_lib");

const pairs = arr => { const o = {}; for (let i = 0; i < (arr || []).length; i += 2) o[arr[i]] = Number(arr[i + 1]); return o; };
const parse = list => (list || []).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!(process.env.ADMIN_PASSWORD || "").trim()) return res.status(503).json({ ok: false, error: "no admin password set" });
  const given = (req.headers["x-admin-password"] || "").toString();
  if (!passwordMatches(given)) return res.status(401).json({ ok: false, error: "wrong password" });
  if (!storageReady()) return res.status(200).json({ ok: true, configured: false });

  try {
    const [pages, players, locations, events, enquiries] = await redis([
      ["HGETALL", "views:pages"], ["HGETALL", "views:players"], ["HGETALL", "views:locations"],
      ["LRANGE", "events", 0, 499], ["LRANGE", "enquiries", 0, 999],
    ]);
    const playerViews = pairs(players);
    const ids = Object.keys(playerViews);
    const perPlayer = ids.length ? await redis(ids.map(id => ["HGETALL", `views:player:${id}`])) : [];
    const playerLocations = Object.fromEntries(ids.map((id, i) => [id, pairs(perPlayer[i])]));
    return res.status(200).json({
      ok: true, configured: true,
      pages: pairs(pages), players: playerViews, playerLocations, locations: pairs(locations),
      events: parse(events), enquiries: parse(enquiries),
      clarityId: process.env.CLARITY_PROJECT_ID || "",
    });
  } catch {
    return res.status(502).json({ ok: false, error: "storage error" });
  }
};
