import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const list = [['/','text/html; charset=utf-8','index.html'],
  ['/style.css','text/css; charset=utf-8','style.css'],
  ['/app.js','text/javascript; charset=utf-8','app.js']];
if (existsSync('hero.webp')) list.push(['/hero.webp','image/webp','hero.webp']);
const assets = Object.fromEntries(list.map(([url,type,path]) => [
  url,[type,readFileSync(path,type.startsWith('image/') ? 'base64' : 'utf8')]
]));
const game = readFileSync('case.js','utf8').replace(/^export /gm,'');
const worker = readFileSync('worker.js','utf8').replace(/^import .*\r?\n/gm,'');
mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js',game+'\nconst assets = '+JSON.stringify(assets)+';\n'+worker);

