// extra routes for the rating page; required by serve.cjs
const fs = require('fs');
const read = () => fs.existsSync('ratings.jsonl') ? fs.readFileSync('ratings.jsonl', 'utf8').split(/\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
module.exports = (q, r, f, h) => {
  if (f === 'rate.html') { r.writeHead(200, { ...h, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); r.end(fs.readFileSync('rate.html')); return true; }
  if (f === 'rate-list') { r.writeHead(200, { ...h, 'content-type': 'application/json' }); r.end(fs.readFileSync('rate-list.json')); return true; }
  if (f === 'rated') { r.writeHead(200, { ...h, 'content-type': 'application/json' }); r.end(JSON.stringify(read().map((x) => x.id))); return true; }
  if (q.method === 'POST' && (f === 'rate' || f === 'unrate')) {
    let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => {
      const x = JSON.parse(b); let rows = read().filter((y) => y.id !== x.id); const had = rows.length < read().length;
      if (f === 'rate') rows.push(x);
      fs.writeFileSync('ratings.jsonl', rows.map((y) => JSON.stringify(y)).join('\n') + (rows.length ? '\n' : ''));
      r.writeHead(200, h); r.end(f === 'unrate' ? (had ? 'removed' : 'none') : 'ok');
    }); return true;
  }
  return false;
};
