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
    const members = Array.isArray(body.members) ? body.members.slice(0, 6) : [];
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
