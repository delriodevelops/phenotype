// Zero-dependency static server for local development: serves ./public on http://localhost:5300.
// node serve.mjs --lan (npm run dev:lan) opens it to your wifi, for phone testing.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = join(import.meta.dirname, 'public');
const PORT = Number(process.env.PORT || 5300), HOST = process.argv.includes('--lan') ? '0.0.0.0' : (process.env.HOST || '127.0.0.1');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (path.includes('..')) { res.writeHead(400); return res.end(); }
  let file = join(ROOT, path || 'index.html');
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch {}
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(PORT, HOST, () => console.log(`PHENOTYPE → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
