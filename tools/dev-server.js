// Local dev server: mimics Vercel's api/ + public/ layout with zero deps.
//   QLOO_API_KEY=... node tools/dev-server.js   -> http://localhost:3461
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z-]/g, '');
    try {
      const handler = require(path.join(ROOT, 'api', name + '.js'));
      // Vercel-style: pass raw req/res with a json helper
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
      await handler(req, res);
    } catch (e) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'no such api route: ' + name }));
    }
    return;
  }
  let p = path.join(ROOT, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  if (!p.startsWith(path.join(ROOT, 'public'))) { res.statusCode = 403; return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
    res.end(data);
  });
});
const port = process.env.PORT || 3461;
server.listen(port, () => console.log(`Common Ground dev server -> http://localhost:${port} (QLOO_API_KEY ${process.env.QLOO_API_KEY ? 'set: LIVE mode' : 'missing: SAMPLE mode'})`));
