const fs=require('fs');
const lines=(p)=>fs.existsSync(p)?fs.readFileSync(p,'utf8').split(/\n/).filter(Boolean).map(l=>JSON.parse(l)):[];
require('http').createServer((q,r)=>{const h={'access-control-allow-origin':'*','access-control-allow-headers':'content-type'};
 const f=decodeURIComponent(q.url.slice(1).split('?')[0]);
 if(require('./rate-routes.cjs')(q,r,f,h))return;
 if(q.method==='OPTIONS'){r.writeHead(204,h);return r.end()}
 const post=(file,cb)=>{let b='';q.on('data',d=>b+=d);q.on('end',()=>{cb(b);r.writeHead(200,h);r.end('ok')})};
 if(q.method==='POST'&&f==='snap')return post(0,b=>fs.writeFileSync('snap.png',Buffer.from(b.split(',')[1],'base64')));
 if(q.method==='POST'&&f==='save')return post(0,b=>fs.appendFileSync('features.jsonl',b.trim()+'\n'));
 if(q.method==='POST'&&f==='savef')return post(0,b=>fs.appendFileSync('featuresf.jsonl',b.trim()+'\n'));
 const js=(file)=>{r.writeHead(200,{...h,'content-type':'text/javascript'});r.end(fs.readFileSync(file))};
 const json=(o)=>{r.writeHead(200,{...h,'content-type':'application/json'});r.end(typeof o==='string'?o:JSON.stringify(o))};
 if(['worker.js','workerf.js','probe-run.js'].includes(f))return js(f);
 if(f==='done')return json(lines('features.jsonl').map(x=>x.id));
 if(f==='donef')return json(lines('featuresf.jsonl').map(x=>x.id));
 if(f==='all')return json(fs.readFileSync('all.json','utf8'));
 if(f==='allf')return json(fs.readFileSync('allf.json','utf8'));
 let m=f.match(/^f\/(raw_f[0-9]+)$/); if(m&&fs.existsSync('imgf/'+m[1])){r.writeHead(200,h);return r.end(fs.readFileSync('imgf/'+m[1]))}
 if(/^raw_t?[0-9]+$/.test(f)&&fs.existsSync('img/'+f)){r.writeHead(200,h);return r.end(fs.readFileSync('img/'+f))}
 r.writeHead(404,h);r.end()}).listen(5196,'127.0.0.1');
