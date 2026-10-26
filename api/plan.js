const agent = require('./lib/agent');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = await readBody(req);
    const rawMembers = Array.isArray(body.members) ? body.members.slice(0, 6) : [];
    const members = rawMembers.map((m) => ({
      label: (m && (m.label || m.name)) || undefined,
      // Tolerate comma-joined strings as well as arrays of likes.
      likes: Array.isArray(m && m.likes)
        ? m.likes
        : String((m && m.likes) || '').split(',').map((x) => x.trim()).filter(Boolean),
    })).filter((m) => m.likes.length > 0);
    if (members.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 members to find common ground.' });
    }
    const result = await agent.plan({
      members,
      city: body.city,
      constraints: body.constraints || {},
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
