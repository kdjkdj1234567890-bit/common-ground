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

// Replan = plan with accumulated constraints (vetoes, price caps, tag nudges).
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = await readBody(req);
    const session = body.session || {};
    const members = Array.isArray(session.members) ? session.members : [];
    if (members.length < 2) {
      return res.status(400).json({ error: 'Session missing members.' });
    }
    const result = await agent.plan({
      members,
      city: session.city,
      constraints: body.constraints || {},
    });
    result.reaction = body.reaction || null;
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
