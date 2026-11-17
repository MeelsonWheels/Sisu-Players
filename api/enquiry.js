// Saves a "request player information" enquiry and emails it to Sisu via Resend.
const { storageReady, redis, location, cors, body } = require("./_lib");

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const clean = (v, max) => String(v || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const html = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendEmail(e) {
  const key = process.env.RESEND_API_KEY, to = process.env.ENQUIRY_TO, from = process.env.ENQUIRY_FROM;
  if (!key || !to || !from) return "not configured";
  const subject = e.player ? `Player enquiry: ${e.playerName || e.player}` : "Tailored shortlist request";
  const rows = [["Player", e.playerName || e.player || "Shortlist request"], ["Name", e.name], ["Email", e.email],
    ["Club / organisation", e.club], ["Role", e.role], ["Location", e.loc], ["Message", e.message]];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: to.split(",").map(s => s.trim()), reply_to: e.email, subject,
      html: `<p>New enquiry from the Sisu Player List.</p><table cellpadding="6">${
        rows.filter(([, v]) => v).map(([k, v]) => `<tr><td><b>${html(k)}</b></td><td>${html(v).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>`,
    }),
  });
  return res.ok ? "sent" : `failed ${res.status}`;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  const b = body(req);
  if (b.website) return res.status(200).json({ ok: true }); // honeypot field: bots fill it, people don't see it
  const e = {
    t: Date.now(),
    name: clean(b.name, 120), email: clean(b.email, 200).toLowerCase(), club: clean(b.club, 160),
    role: clean(b.role, 120), message: clean(b.message, 2000),
    player: /^[a-z0-9-]{1,80}$/.test(b.player || "") ? b.player : "", playerName: clean(b.playerName, 120),
    loc: location(req).label,
  };
  if (!e.name || !EMAIL.test(e.email) || b.consent !== true) return res.status(400).json({ ok: false, error: "invalid" });
  if (!storageReady() && !process.env.RESEND_API_KEY) return res.status(503).json({ ok: false, error: "not configured" });

  let saved = false;
  if (storageReady()) {
    try { await redis([["LPUSH", "enquiries", JSON.stringify(e)], ["LTRIM", "enquiries", 0, 999]]); saved = true; } catch {}
  }
  let emailed = "not configured";
  try { emailed = await sendEmail(e); } catch { emailed = "failed"; }
  if (!saved && emailed !== "sent") return res.status(502).json({ ok: false, error: "delivery failed" });
  return res.status(200).json({ ok: true, saved, emailed });
};
