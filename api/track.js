// Counts page and player views with city/country. No cookies, no IP stored.
const { storageReady, redis, location, cors, body } = require("./_lib");

const ID = /^[a-z0-9-]{1,80}$/;
const TYPES = new Set(["home", "list", "player"]);

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!storageReady()) return res.status(204).end();

  const { type, player } = body(req);
  if (!TYPES.has(type) || (type === "player" && !ID.test(player || ""))) return res.status(400).json({ ok: false });

  const loc = location(req);
  const event = JSON.stringify({ t: Date.now(), type, player: type === "player" ? player : null, loc: loc.label });
  const commands = [
    ["HINCRBY", "views:pages", type, 1],
    ["HINCRBY", "views:locations", loc.label, 1],
    ["LPUSH", "events", event],
    ["LTRIM", "events", 0, 499],
  ];
  if (type === "player") {
    commands.push(["HINCRBY", "views:players", player, 1]);
    commands.push(["HINCRBY", `views:player:${player}`, loc.label, 1]);
  }
  try { await redis(commands); } catch { return res.status(502).json({ ok: false }); }
  return res.status(204).end();
};
